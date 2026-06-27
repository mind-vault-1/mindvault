# ADR: Refund and Escrow Mechanisms for MindVault

| Field       | Value                                              |
|-------------|------------------------------------------------------|
| **Status**  | Proposed                                             |
| **Date**    | 2026-06-24                                           |
| **Issue**   | [#178](https://github.com/mind-vault-1/mindvault/issues/178) |
| **Authors** | morelucks                                            |

---

## Context

MindVault currently uses the **x402 protocol** for resource access payments. When a buyer requests a paywalled resource (`GET /resources/:id`), the server returns an HTTP 402 with payment details. The buyer signs a Soroban USDC authorization entry, retries with the signed proof, and the server settles via the x402 facilitator. USDC moves **directly from buyer to creator** — MindVault never custodies funds.

This model is elegant and simple, but it provides **no mechanism for refunds, disputes, or buyer protection**. Once settled, the USDC transfer is final. If a resource is misleading, broken, or not as described, the buyer has no recourse.

This ADR researches and compares approaches to introduce buyer safety without sacrificing the simplicity and trust properties of the current system.

---

## Current Payment Flow

```
Buyer → GET /resources/:id → 402 (price, payTo=creator)
Buyer → sign USDC auth entry → retry with X-Payment header
Server → facilitator.verify() → facilitator.settle() → USDC: buyer → creator
Server → deliver resource
```

**Key properties:**
- No intermediary custody — USDC goes directly to creator wallet
- Price is read from the on-chain vault-registry contract
- Settlement is atomic and final (single Soroban transaction)
- Server is stateless for payment — no sessions, no balances

---

## Options Evaluated

### Option A: Status Quo — Direct Payment, No Refunds

**How it works:** Exactly as today. USDC goes directly to the creator's wallet upon settlement. No refund path.

| Dimension          | Assessment |
|--------------------|------------|
| Creator trust      | ✅ Maximum — funds are immediately available |
| Buyer safety       | ❌ None — payment is irreversible |
| Agent automation   | ✅ Simple — no additional steps |
| Implementation     | ✅ Already done |
| Stellar/Soroban    | ✅ No contract changes |

**Tradeoffs:** Works well for low-value resources where trust is established through verification scores. Breaks down when prices rise or buyers lack prior trust signals.

---

### Option B: On-Chain Escrow Contract

**How it works:** Deploy a new `vault-escrow` Soroban contract. Instead of settling USDC directly to the creator, funds are locked in the escrow contract with a time-bounded release window.

```
Buyer → pay USDC → vault-escrow contract (locked)
         │
         ├─ After dispute window (e.g. 24h): auto-release to creator
         ├─ Buyer disputes within window: funds held for resolution
         └─ Both parties agree: early release or refund
```

**Contract interface (sketch):**

```rust
pub fn deposit(buyer: Address, resource_id: String, amount: i128)
pub fn release(resource_id: String)          // auto or creator-initiated
pub fn dispute(buyer: Address, resource_id: String, reason: String)
pub fn refund(resource_id: String)           // after dispute resolution
pub fn get_escrow(resource_id: String) -> EscrowState
```

**New state machine:**

```
DEPOSITED → (timeout) → RELEASED
DEPOSITED → (buyer disputes) → DISPUTED → REFUNDED | RELEASED
```

| Dimension          | Assessment |
|--------------------|------------|
| Creator trust      | ⚠️ Moderate — funds delayed by dispute window |
| Buyer safety       | ✅ Strong — can dispute within window |
| Agent automation   | ⚠️ Agents need to handle dispute/release flows |
| Implementation     | ❌ High — new Soroban contract, new settlement flow |
| Stellar/Soroban    | ⚠️ Soroban persistent storage costs for escrow state; TTL management needed |

**Stellar/Soroban constraints:**
- Escrow state entries need `extend_ttl` bumps (same pattern as vault-registry)
- USDC transfer to escrow contract requires the contract to hold a USDC trustline (SAC balance)
- Dispute resolution requires either a trusted arbiter key or multi-sig between buyer + creator
- Soroban's `require_auth` can enforce that only the buyer can dispute and only the creator can release early

**x402 settlement implications:**
- The x402 facilitator currently settles to the `payTo` address directly. Using an escrow requires either:
  1. Setting `payTo` to the escrow contract address and having the facilitator settle there, or
  2. Bypassing the x402 facilitator entirely and building a custom settlement flow
- Option (1) is cleaner but requires the escrow contract to implement the SAC `transfer` receiver interface
- Option (2) means losing facilitator signature verification — we'd verify ourselves

---

### Option C: Server-Mediated Partial Refunds

**How it works:** Payments still settle directly to the creator via x402. The MindVault server operates a **refund pool** (a platform-controlled wallet) that can issue partial refunds to buyers when a dispute is upheld.

```
Buyer → pay USDC → creator (via x402, as today)
Buyer → POST /disputes { resourceId, reason }
Server → AI review of dispute + resource quality
Server → if upheld: transfer USDC from refund pool → buyer
```

**API additions:**

```
POST /disputes          — buyer files a dispute
GET  /disputes/:id      — check dispute status
POST /disputes/:id/rule — admin/AI rules on dispute
```

**DB schema addition:**

```sql
CREATE TABLE disputes (
  id            TEXT PRIMARY KEY,
  resource_id   TEXT NOT NULL REFERENCES resources(id),
  buyer_address TEXT NOT NULL,
  amount        TEXT NOT NULL,
  reason        TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending',  -- pending | upheld | denied
  refund_tx     TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  resolved_at   TIMESTAMPTZ
);
```

| Dimension          | Assessment |
|--------------------|------------|
| Creator trust      | ✅ High — funds arrive immediately, refunds come from platform pool |
| Buyer safety       | ⚠️ Moderate — depends on platform pool solvency and fair rulings |
| Agent automation   | ✅ Simple REST API for filing/checking disputes |
| Implementation     | ⚠️ Medium — new API routes, dispute table, refund wallet logic |
| Stellar/Soroban    | ✅ No contract changes — refunds are separate USDC transfers |

**Stellar/Soroban constraints:**
- Platform needs a funded wallet for refunds — operational cost
- Refund transfers are standard USDC SAC `transfer` calls — well-understood
- No escrow contract needed — simpler on-chain footprint

**x402 settlement implications:**
- Zero changes to the x402 flow — settlement is exactly as today
- Refunds are independent transactions unrelated to the original payment

---

### Option D: Dispute Window with Delayed Delivery

**How it works:** Combine x402 direct payment with a **server-side hold**. Payment settles immediately (USDC goes to creator), but the server delays resource delivery for a configurable window. During the window, the buyer can cancel (before delivery) and the server requests the creator return the funds.

```
Buyer → pay USDC → creator (via x402)
Server → record payment, start dispute window timer
         │
         ├─ Window expires: deliver resource
         ├─ Buyer cancels within window: server requests creator refund
         └─ Creator pre-approves: immediate delivery
```

| Dimension          | Assessment |
|--------------------|------------|
| Creator trust      | ⚠️ Low — relies on creators honoring refund requests |
| Buyer safety       | ⚠️ Weak — no enforcement; creator can ignore refund request |
| Agent automation   | ⚠️ Delayed delivery complicates agent workflows |
| Implementation     | ⚠️ Medium — timer logic, cancellation API |
| Stellar/Soroban    | ✅ No contract changes |

**Tradeoffs:** This option is the weakest because it has no on-chain enforcement for refunds. Creators can simply not refund. It's essentially an honor system.

---

## Comparison Matrix

| Criterion                  | A: Status Quo | B: On-Chain Escrow | C: Partial Refunds | D: Delayed Delivery |
|---------------------------|:---:|:---:|:---:|:---:|
| Buyer protection          | ❌ | ✅ | ⚠️ | ❌ |
| Creator fund availability | ✅ | ⚠️ | ✅ | ✅ |
| Implementation complexity | ✅ | ❌ | ⚠️ | ⚠️ |
| On-chain changes          | ✅ | ❌ | ✅ | ✅ |
| x402 compatibility        | ✅ | ⚠️ | ✅ | ✅ |
| Agent-friendliness        | ✅ | ⚠️ | ✅ | ⚠️ |
| Trustlessness             | ✅ | ✅ | ❌ | ❌ |

---

## Recommendation

**Short-term (next milestone): Option C — Server-Mediated Partial Refunds**

This is the pragmatic choice. It:
- Requires **zero changes** to the x402 payment flow or Soroban contracts
- Gives buyers a dispute path without delaying creator payouts
- Is fully automatable for AI agents (simple REST endpoints)
- Can be implemented as a standalone feature in the server package

The main risk — platform pool insolvency — is manageable at MindVault's current scale and can be funded from a small percentage of verification fees.

**Medium-term (future milestone): Option B — On-Chain Escrow Contract**

Once the marketplace scales and the dispute volume justifies it, migrating to an on-chain escrow provides **trustless** buyer protection. The escrow contract should be designed to:
- Accept USDC deposits keyed by `(resource_id, buyer_address)`
- Auto-release after a configurable ledger window (e.g., ~24h of ledgers)
- Allow buyer-initiated disputes that freeze the release
- Use a platform arbiter key for dispute resolution (upgradeable to DAO governance later)

---

## Recommended Follow-Up Issues

1. **`feat: implement dispute API and refund pool (Option C)`**
   - Add `disputes` table to DB schema
   - Create `POST /disputes`, `GET /disputes/:id`, `POST /disputes/:id/rule` API routes
   - Fund and configure a platform refund wallet
   - Add AI-assisted dispute review using existing OpenRouter integration
   - Update MCP server with `mindvault_dispute` and `mindvault_dispute_status` tools

2. **`feat: design vault-escrow Soroban contract (Option B)`**
   - Define escrow state machine (Deposited → Released / Disputed → Refunded)
   - Implement USDC SAC integration for contract-held balances
   - Add TTL management for escrow entries
   - Write comprehensive Soroban tests for all state transitions

3. **`docs: update x402 payment docs for dispute flow`**
   - Update `x402-sequence-diagram.md` with dispute/refund path
   - Add buyer-facing documentation for dispute process
   - Update MCP quickstart with dispute tool examples

---

## References

- [x402 protocol spec](https://www.x402.org/)
- [x402 payment sequence diagram](x402-sequence-diagram.md)
- [MindVault architecture](architecture.md)
- [vault-registry contract source](../contract/contracts/vault-registry/src/lib.rs)
- [Soroban SDK — persistent storage](https://soroban.stellar.org/docs/learn/persisting-data)
- [Stellar USDC SAC](https://stellar.expert/explorer/public/asset/USDC-GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN)
