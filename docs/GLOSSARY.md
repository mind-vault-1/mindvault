# Glossary

## x402

The x402 protocol standardizes the HTTP 402 Payment Required status code for machine-readable paywalls. A server returns a 402 response with a `PAYMENT-REQUIRED` header encoding the price, destination wallet, network, and payment scheme. The client reads this header, signs a payment, and retries the request with proof of payment attached. MindVault uses `@x402/express` on the server and `@x402/stellar` for client signing.

See also: [Soroban](#soroban), [Sponsored Accounts](#sponsored-accounts)

## Soroban

Soroban is Stellar's smart contract platform. MindVault uses it for the [vault-registry](#vault-registry) contract and for USDC payments via the Stellar Asset Contract (SAC). When a client pays for a resource, it signs a Soroban authorization entry authorizing a USDC transfer from the client's wallet to the creator's wallet.

## vault-registry

The vault-registry is a [Soroban](#soroban) smart contract that maintains an on-chain ledger of published resources. Each entry maps a resource ID to its creator wallet address and price. Resources must be registered here after verification before they appear as on-chain entries in the catalog.

## MCP

MCP (Model Context Protocol) is an open standard for exposing tools to AI agents. MindVault's MCP server lets Claude Code, Codex, and other MCP-enabled agents browse the catalog, pay for resources, and publish new ones — all through natural language without accounts or OAuth.

See the [MCP Server section of the README](../README.md#mcp-server) for installation instructions and available tools.

## Sponsored Accounts

A sponsored account is a Stellar account whose base reserve (~1.5 XLM) and USDC trustline are funded by a sponsoring account rather than the new account holder. MindVault uses the [stellar-sponsored-agent-account](https://github.com/oceans404/stellar-sponsored-agent-account) service so AI agents can receive a Stellar wallet at zero upfront cost and immediately hold USDC.

See also: [MCP](#mcp)
# MindVault Glossary

This glossary defines the core terms used throughout the MindVault documentation and codebase.

---

## A

**Agent**
: An autonomous AI system (e.g., Claude Code, Codex) that interacts with MindVault programmatically via the MCP server or HTTP API. Agents pay for resources using Stellar wallets, just like humans.

**API Key**
: A credential used to authenticate publisher requests to the MindVault server API. Unlike browser-wallet auth, API keys are used by automated agents and server-to-server communication.

---

## C

**Content Hash**
: A SHA-256 hash stored in the vault-registry contract's `metadata` field. Clients can verify the integrity of delivered content by hashing it and comparing against this value. Also called a content integrity anchor.

**Creator**
: The Stellar wallet address that owns a resource on the vault-registry contract. The creator is the only party allowed to mutate a resource (`require_auth` enforced on-chain). The creator receives payments directly from buyers.

---

## F

**Facilitator**
: The payment verification and settlement service at `x402.org/facilitator` (operated by Coinbase on Stellar testnet). The facilitator calls `/verify` to check a payment authorization and `/settle` to submit the USDC transfer on-chain. Also called the x402 facilitator.

**Freighter**
: A browser wallet extension for Stellar. MindVault's web app uses Freighter via `@creit.tech/stellar-wallets-kit` for wallet connection and transaction signing.

---

## H

**HTTP 402 (Payment Required)**
: An HTTP status code reserved for "Payment Required" but never standardized before x402. MindVault uses it to signal that a buyer must pay before the requested resource is delivered. The response includes a `PAYMENT-REQUIRED` header with machine-readable payment instructions.

---

## I

**IPFS URI**
: An InterPlanetary File System identifier pointing to content stored off-chain. Stored in the vault-registry contract's `metadata` field. MindVault does not host content directly — it stores the URI on-chain and serves content off-chain.

---

## M

**MCP Server**
: The MindVault Model Context Protocol server that lets AI agents interact with the vault through tools like `mindvault_browse`, `mindvault_publish`, and `mindvault_buy`. Agents use MCP tools instead of a browser wallet.

**Metadata**
: A field in the vault-registry contract storing a content pointer — typically an IPFS URI or a SHA-256 content hash. Used by clients to verify content integrity.

---

## N

**Network Passphrase**
: The Stellar network identifier. MindVault uses `stellar:testnet` (Test SDF Network). All signers, wallets, and the server must use the same passphrase.

---

## P

**Paywall**
: The HTTP 402 mechanism MindVault wraps around each resource. When a request arrives without a payment header, the server returns 402 with payment instructions. When a valid payment header is present, the server delivers the resource.

**Payment-Required Header**
: A base64-encoded JSON header returned with HTTP 402 responses. Contains the price (in USDC stroops), the creator's Stellar wallet address, the USDC Stellar Asset Contract ID, the network, and the payment scheme. An x402-aware client reads this header to construct and sign the payment.

**Platform Wallet**
: The MindVault-operated Stellar wallet (`GB6LGS25...`) that receives verification fees. The verification agent is itself an x402-paid service earning USDC to this wallet.

**Publisher**
: An authenticated MindVault user who has registered as a creator via `mindvault_register`. Publishers can store resources, set prices, and receive payments directly to their Stellar wallet.

---

## R

**Registry Client**
: The `@mindvault/registry-client` workspace package (`packages/registry-client/`) wrapping the auto-generated Soroban bindings. All three MindVault consumers — `server/`, `web/`, and `mcp/` — depend on this package for consistent types and network defaults.

**require_auth**
: A Soroban contract mechanism that enforces cryptographic ownership. Methods on the vault-registry contract tagged with `require_auth` only execute when the transaction includes the creator's signature. This guarantees the platform cannot reassign a resource without the creator's key.

---

## S

**SAC (Stellar Asset Contract)**
: The Soroban contract wrapping the classic USDC issuer. All MindVault payments use the USDC token via its SAC interface (`CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA`). Balances are interchangeable between classic Stellar operations and Soroban invocations.

**Soroban**
: Stellar's smart contract platform. MindVault's vault-registry contract and all payment operations run on Soroban. Soroban is to Stellar what EVM is to Ethereum.

**Soroban Authorization Entry**
: A signed authorization that grants a Soroban contract permission to invoke a token transfer on behalf of a user. x402 uses Soroban authorization entries as the payment proof mechanism. An x402-aware client signs an auth entry for a USDC transfer and attaches it to the retry request.

**Sponsored Account**
: A Stellar account whose minimum balance reserve is sponsored by the `stellar-sponsored-agent-account` service (~1.5 XLM). This allows AI agents to get a wallet with zero upfront XLM. The MCP server uses sponsored accounts for agent wallets.

**Stellar Explorer**
: A block explorer for Stellar. MindVault activity is visible on [stellar.expert/explorer/testnet](https://stellar.expert/explorer/testnet) (testnet) or [stellar.expert/explorer](https://stellar.expert/explorer) (mainnet).

**Stellar Testnet**
: Stellar's testing network. All MindVault development and testing uses testnet. USDC on testnet is faucet-funded (free). The testnet passphrase is `Test SDF Network ; September 2015`.

**stroops**
: The smallest unit of XLM on Stellar. 1 XLM = 10,000,000 stroops. USDC on Soroban uses 7 decimals, so 1 USDC = 10,000,000 stroops. The vault-registry contract stores prices in USDC stroops.

---

## T

**Trustline**
: A Stellar ledger entry allowing an account to hold a non-native asset (like USDC). Classic Stellar accounts must explicitly trust the USDC issuer before receiving or sending USDC. Soroban accounts (like SAC) do not require trustlines.

---

## U

**USDC**
: The USDC stablecoin. On Stellar testnet, USDC is issued by Circle via the SAC. All MindVault payments are denominated in USDC on Stellar. MindVault does not handle any other token.

---

## V

**Vault**
: MindVault's payment-protected storage for digital resources. Each stored resource gets a unique URL with a programmable paywall. Anyone — human or AI — pays USDC to access a vault URL.

**vault-registry Contract**
: The Soroban smart contract deployed on Stellar that is the single, permissionless source of truth for who owns what resource and at what price. Its key properties are `creator`, `price`, `metadata`, and `listed`. Mutations require the creator's Soroban `require_auth` signature.

**Verification Agent**
: A built-in AI agent that reviews submitted resources for originality and quality before they go live in the vault. It has its own x402-paid endpoint (`POST /verify-content`) priced at $0.10 USDC, payable from the publisher's wallet.

---

## X

**x402**
: A protocol that standardizes HTTP 402 for machine-readable payment flows. x402 specifies how a server returns payment instructions via the `PAYMENT-REQUIRED` header and how a client constructs and signs a Soroban authorization entry as payment proof. MindVault uses `@x402/express` on the server and `@x402/stellar` for client signing.

**x402-aware Client**
: A client (browser wallet integration, `@x402/fetch` in Node, or the MCP server) that understands the x402 protocol — reads the `PAYMENT-REQUIRED` header, signs a Soroban authorization entry, and retries the request with an `X-Payment` header.

**X-Payment Header**
: The header a client attaches to the retry request after signing a Soroban authorization entry. Contains the base64-encoded signed auth entry as proof of payment.

---

## Z

**402**
: Short for HTTP 402 Payment Required. Used throughout MindVault documentation as shorthand for the payment-required response.
