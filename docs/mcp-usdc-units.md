# MCP USDC Units

Every USDC amount in the MCP server is in one of two encodings, and neither
carries its unit:

| Source                       | Encoding                      | `1 USDC` looks like |
| ---------------------------- | ----------------------------- | ------------------- |
| Horizon (`/accounts/:id`)    | decimal string                | `"1.0000000"`       |
| Soroban / the vault registry | i128 **stroops** (7 decimals) | `10000000n`         |

They differ by 10<sup>7</sup>. A value from one substituted for the other
type-checks, formats, and compares without complaint — and means ten million
times more or less than it should. The dangerous direction is quiet: a stroop
count read as a decimal balance reports a wallet as richly funded and waves an
unaffordable payment through.

Payment and refund amounts recorded by the vault-registry are also stroops.
Refund records are cumulative per payment receipt, and the contract rejects a
refund that would make the total exceed the original settled payment amount.

Fee quotes must use the same base units and integer floor division as the
contract: `floor(amount * platform_fee_bps / 10_000)`. Converting to decimal
USDC before applying the basis-point rate can produce a quote that differs
from the fee accrued when the receipt is settled, especially at small amounts.
Destination splits are floored from the already-computed platform fee, with
the recipient receiving the remainder.

Source: [`mcp/src/usdcAmount.ts`](../mcp/src/usdcAmount.ts).

## One conversion, tagged at the boundary

The factor is defined once (`STROOPS_PER_USDC`) and every amount that crosses a
service boundary is tagged with the encoding it arrived in:

```ts
normalizeUsdcBalance({ source: "horizon", balance: "12.5" }); // "12.5000000"
normalizeUsdcBalance({ source: "soroban", stroops: 125000000n }); // "12.5000000"
```

The tag is the safeguard. A reader cannot consume a balance without stating which
encoding it speaks, so a second balance source cannot be wired in on the wrong
scale — the compiler asks which one it is.

## What this replaced

The 10<sup>7</sup> factor used to be written out five times, each with its own
parser and its own idea of what a malformed amount should do:

| Was in              | Now uses                         |
| ------------------- | -------------------------------- |
| `index.ts`          | `stroopsToUsdc`, `usdcToStroops` |
| `tools/registry.ts` | `stroopsToUsdc`                  |
| `tools/publish.ts`  | `usdcToStroops`                  |
| `paymentCeiling.ts` | `usdcToStroops`                  |
| `receipts.ts`       | `sumUsdc`, `trimUsdc`            |

Five copies of a constant is five chances for the sixth caller to pick the wrong
one — which is how a ceiling and the price it guards end up measured on
different scales.

## Malformed amounts are null, never zero

`usdcToStroops` returns `null` for anything it cannot read exactly — including
`"1.00000001"`, which has more precision than Stellar can hold and would
otherwise be rounded into a transaction the agent never approved.

`compareUsdc` returns `null` when either side is unreadable, so a caller cannot
mistake "could not compare" for "not greater than". That distinction is load
bearing: `insufficientFundsMessage` now **blocks** a payment when the balance
cannot be parsed, where a floating-point `NaN` check previously let it through as
though funds were sufficient.

## Failover and units

`rpcFailover` fans a request across several **Soroban RPC** endpoints, which all
speak stroops, so failing over between them cannot change the scale. There is no
Soroban→Horizon balance fallback today: `getBalanceDetails` reads Horizon only.

Issue #838 describes what such a fallback would do if one were added naively —
return a balance off by 10<sup>7</sup>, silently. The tagged boundary above is
what makes adding one safe: a Soroban balance read enters as
`{ source: "soroban", stroops }` and is converted at the edge, or it does not
compile.

## Coverage

- [`mcp/src/usdcAmount.test.ts`](../mcp/src/usdcAmount.test.ts) — the factor,
  both directions, round-tripping, precision limits, and that the same holding
  read from either source normalizes to the same amount
- [`mcp/src/paymentCeiling.test.ts`](../mcp/src/paymentCeiling.test.ts) and
  [`mcp/src/receipts.test.ts`](../mcp/src/receipts.test.ts) — the migrated
  callers, unchanged in behaviour

See also: [mcp-rpc-failover.md](mcp-rpc-failover.md),
[mcp-receipt-export.md](mcp-receipt-export.md).

## USDC identity: issuer, not symbol (#1053)

On Stellar, an asset is identified by the pair `(asset_code, asset_issuer)`, not
by the code alone. Anyone can issue a `credit_alphanum4` token with the code
`"USDC"` from a throwaway account. Without checking the issuer, a counterfeit
token would be reported as the same USDC that x402 payments settle in — and an
attacker could trick an agent into trusting a worthless balance.

The MCP server now identifies canonical USDC by matching both fields against
the network preset:

```ts
// Before (vulnerable):
balances.find((b) => b.asset_type === "credit_alphanum4" && b.asset_code === "USDC");

// After (issuer-checked):
findCanonicalUsdc(balances, networkPreset.usdcClassicIssuer);
```

The `usdcClassicIssuer` is set per network in
[`packages/registry-client/src/networks.ts`](../packages/registry-client/src/networks.ts):

| Network | `usdcClassicIssuer`                                        |
| ------- | ---------------------------------------------------------- |
| testnet | `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5` |
| mainnet | `GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN` |

A Horizon balance entry is only the canonical USDC when its `asset_code` is
`"USDC"` **and** its `asset_issuer` matches the preset. A counterfeit entry with
the same code but a different issuer is never selected as the payment asset.

Source: [`mcp/src/usdcIdentity.ts`](../mcp/src/usdcIdentity.ts).

### Coverage

- [`mcp/src/usdcIdentity.test.ts`](../mcp/src/usdcIdentity.test.ts) — the
  predicate and finder: canonical match, counterfeit rejection, missing
  `asset_issuer`, wrong asset type, wrong code, network-awareness
- [`mcp/src/index.test.ts`](../mcp/src/index.test.ts) — end-to-end: counterfeit
  USDC alone reports no-trustline; canonical selected when both are present
- [`mcp/src/generateFixtures.test.ts`](../mcp/src/generateFixtures.test.ts) —
  fixture contains a counterfeit entry that is never selected


## USDC units at every public API boundary

USDC crosses six distinct API surfaces on its way from a creator's price to a
settled on-chain payment, and the unit is not the same at each one. A consumer
that assumes one unit throughout will either send a transaction for ten million
times the intended amount or display a balance as ten million times too small.
The table below maps every boundary to the unit it speaks, with a concrete
example. The conversion itself always runs through the tagged boundary above
(`usdcToStroops` / `stroopsToUsdc` in [`mcp/src/usdcAmount.ts`](../mcp/src/usdcAmount.ts));
this section documents where each unit appears so a caller knows which side of
the boundary it is on.

| Boundary                     | Unit                    | Example                                  | Where defined                                                |
| ---------------------------- | ----------------------- | ---------------------------------------- | ------------------------------------------------------------ |
| Vault-registry contract       | i128 stroops            | `50_000_000` for 5 USDC                  | `contract/contracts/vault-registry/src/lib.rs`              |
| Server HTTP API               | decimal string          | `"5.0000000"` for 5 USDC                 | `server/src/routes/resources.ts`, `server/src/db/schema.ts` |
| x402 PAYMENT-REQUIRED header  | stroops (in base64 JSON) | `50000000` inside the encoded blob       | `server/src/middleware/dynamicPaywall.ts`                   |
| MCP tool arguments            | decimal string          | `"5"` or `"5.5"` for 5 USDC              | `mcp/src/tools/publish.ts`, `mcp/src/tools/registry.ts`     |
| Stellar Horizon API           | decimal string          | `"1.0000000"` for 1 USDC                | `mcp/src/usdcAmount.ts` (`source: "horizon"`)               |
| Soroban RPC                   | i128 stroops            | `10000000n` for 1 USDC                   | `mcp/src/usdcAmount.ts` (`source: "soroban"`)               |

### 1. Vault-registry contract (Soroban)

Every price and amount on the contract is an `i128` in USDC base units — 7
decimals, so `1 USDC = 10_000_000`. The contract never sees a decimal string.

```rust
// contract/contracts/vault-registry/src/lib.rs
pub fn register(env: Env, creator: Address, id: String, price: i128, metadata: String)
//                                  ^^^^^^^^^^^ stroops — 50_000_000 means 5 USDC

pub fn set_price(env: Env, id: String, new_price: i128)
//                                        ^^^^^^^^^ stroops

pub fn record_payment(env: Env, receipt_id: String, resource_id: String,
                      payer: Address, amount: i128, tx_hash: String)
//                                 ^^^^^^ stroops — must exactly match the resource price

pub fn buy_lease(env: Env, holder: Address, resource_id: String,
                 tier: LeaseTier, amount: i128, tx_hash: String)
//                              ^^^^^^ stroops — the lease price for the tier
```

`get(resource_id)` returns a `Resource` whose `price` field is `i128` stroops.
`preview_fee_split(amount)` takes stroops and applies `floor(amount * bps / 10_000)`
— the same integer floor division the contract uses when settling, so the
preview matches the accrued fee exactly. Converting to decimal USDC before
applying the basis-point rate can produce a quote that differs at small amounts.

### 2. Server HTTP API (Express)

The server stores and returns prices as **decimal strings**, not stroops. The
Postgres `resources.price` and `payments.amount` columns are `text`, holding
values like `"5.0000000"`. When the server calls the contract it converts:

```ts
// server/src/routes/resources.ts
const priceStroops = BigInt(Math.round(parseFloat(resource.price) * 1_000_000_0));
// resource.price is "5.0000000"  →  priceStroops is 50000000n
```

A buyer calling `GET /resources/:id` receives `price` as a decimal string. The
verification fee (`POST /verify-content`) is `$0.10 USDC`, also expressed as a
decimal. The server is the boundary that translates between human-readable
decimal USDC (for the web app and API clients) and stroops (for the contract).

### 3. x402 PAYMENT-REQUIRED header

The 402 response's `PAYMENT-REQUIRED` header is a base64-encoded JSON blob. The
`price` field inside that blob is in **stroops** — the same i128 the contract
expects — because the client must sign a Soroban auth entry for exactly that
amount:

```jsonc
// decoded PAYMENT-REQUIRED header (abbreviated)
{
  "price": "50000000",        // stroops — 5 USDC
  "destination": "G...",       // creator wallet
  "scheme": "stellar"
  // … network, asset contract id …
}
```

An x402-aware client reads this header, signs a Soroban authorization entry for
`price` stroops of USDC, and retries the request with the `X-Payment` header
carrying the signed entry. The unit is stroops because the auth entry is a
contract call, and contracts speak stroops.

### 4. MCP tools

MCP tool arguments use **decimal USDC strings** for human-friendly input, then
convert to stroops before the contract call through `usdcToStroops()`:

```ts
// mcp/src/tools/publish.ts — mindvault_set_price
const stroops = usdcToStroops(args.priceUsdc); // "5.5" → 55000000n

// mcp/src/tools/registry.ts — preview normalizes on-chain stroops to decimal
price: stroopsToUsdc(resource.price) // 50000000n → "5.0000000"
```

`usdcToStroops` returns `null` for anything it cannot read exactly — including
`"1.00000001"`, which has more precision than Stellar can hold. A `null` result
blocks the tool call rather than rounding into a transaction the agent never
approved. `mindvault_buy` reads the resource price from the catalog (decimal)
and the contract requires the exact stroop equivalent, so the conversion must
be exact.

### 5. Stellar Horizon API

`GET /accounts/:id` returns balance entries with `balance` as a **decimal
string** (`"1.0000000"` for 1 USDC). The MCP server reads these via
`normalizeUsdcBalance({ source: "horizon", balance })`, which tags the encoding
at the boundary so it cannot be confused with a Soroban stroop value.

### 6. Soroban RPC

All contract reads and writes through Soroban RPC carry `i128` values in
**stroops**. `rpcFailover` fans a request across several Soroban RPC endpoints,
which all speak stroops, so failing over between them cannot change the scale.
There is no Soroban → Horizon balance fallback today; the tagged boundary is
what makes adding one safe (see [Failover and units](#failover-and-units) above).

### 7. Reconciliation script

The reconciliation script
([`server/scripts/reconcile.ts`](../server/scripts/reconcile.ts)) converts
**both ways** to detect drift between the database (decimal strings) and the
on-chain registry (stroops):

```ts
// server/scripts/reconcile.ts
stroopsToUsdcString(onChainRow.price)   // 50000000n → "5.0000000"
usdcStringToStroops(dbRow.price)        // "5.0000000" → 50000000n
```

A mismatch between the two after conversion means the DB and the contract have
drifted — the reconciliation report surfaces the difference for an operator to
investigate. See [reconciliation.md](reconciliation.md).

### The dangerous direction

A stroop count read as a decimal balance reports a wallet as richly funded and
waves an unaffordable payment through — the factor of 10⁷ is silent because
both units type-check, format, and compare without complaint. The tagged
boundary above (`normalizeUsdcBalance` with an explicit `source`) is what
prevents this: a reader cannot consume a balance without declaring which
encoding it speaks, so a second balance source wired in on the wrong scale does
not compile. Every boundary in this table feeds into that boundary at the
point where its unit is converted.
