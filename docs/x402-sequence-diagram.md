# x402 Buy/Pay Flow — Sequence Diagram

This diagram walks through the full x402 payment flow: from the initial resource request through payment, verification, settlement, and final delivery.

```mermaid
sequenceDiagram
    participant Buyer as Buyer / AI Agent
    participant Server as MindVault Server
    participant Facilitator as x402 Facilitator
    participant Stellar as Stellar Network (Soroban USDC SAC)

    Note over Buyer,Stellar: Step 1: Initial request (no payment)
    Buyer->>Server: GET /resources/:id
    Note right of Server: Server reads price + creator<br/>from vault-registry contract
    Server-->>Buyer: HTTP 402 Payment Required
    Note right of Buyer: PAYMENT-REQUIRED header:<br/>{ price, destination, network, asset, scheme }

    Note over Buyer,Stellar: Step 2: Sign payment authorization
    Buyer->>Buyer: Decode PAYMENT-REQUIRED header
    Buyer->>Buyer: Build Soroban auth entry<br/>(USDC transfer: buyer → creator)
    Buyer->>Buyer: Sign with Stellar keypair / wallet
    Note right of Buyer: Auth entry (signed):<br/>valid for limited ledger window

    Note over Buyer,Stellar: Step 3: Retry with payment proof
    Buyer->>Server: GET /resources/:id
    Note right of Buyer: X-Payment header:<br/>signed auth entry (base64)

    Note over Buyer,Stellar: Step 4: Verify payment
    Server->>Facilitator: POST /verify
    Note right of Server: Signed auth entry + price + destination
    Facilitator->>Facilitator: Validate signature<br/>Check price matches<br/>Check network<br/>Check not expired
    Facilitator-->>Server: { valid: true }

    Note over Buyer,Stellar: Step 5: Settle on-chain
    Server->>Facilitator: POST /settle
    Facilitator->>Stellar: Submit USDC transfer tx
    Note right of Facilitator: USDC transferred:<br/>buyer → creator wallet
    Stellar-->>Facilitator: { txHash, status: "SUCCESS" }
    Facilitator-->>Server: settlement confirmation
    Note right of Server: USDC goes directly to creator —<br/>MindVault takes no cut

    Note over Buyer,Stellar: Step 6: Deliver resource
    Server->>Server: Record access in DB
    Server-->>Buyer: HTTP 200 + resource content
    Note right of Buyer: Resource delivered:<br/>link / JSON / file body
```

## Flow summary

| Step | What happens | Protocol |
|------|-------------|----------|
| 1 | Client requests resource; server returns 402 with payment details | HTTP 402 + `PAYMENT-REQUIRED` header |
| 2 | Client builds and signs a Soroban USDC authorization entry | Stellar Soroban auth |
| 3 | Client retries with the signed auth entry in an `X-Payment` header | HTTP GET + `X-Payment` |
| 4 | Server sends auth entry to x402 facilitator for signature verification | `/verify` at `x402.org/facilitator` |
| 5 | Facilitator settles the USDC transfer on Stellar testnet | Soroban USDC SAC transfer |
| 6 | Server delivers the resource content | HTTP 200 |

## Key properties

- **No accounts or OAuth** — a Stellar keypair is all a client needs
- **Price read from chain** — the vault-registry contract is queried at request time, so price updates take effect immediately
- **Direct settlement** — USDC goes from buyer to creator; MindVault has no access to funds
- **Stateless retry** — every request is self-contained; the server does not track sessions
- **Auth entry expiry** — signed auth entries have a limited ledger window (minutes), so retries must happen promptly

## See also

- [Architecture overview](architecture.md) — system diagram and layer design
- [x402 payment troubleshooting](x402-payment-troubleshooting.md) — common failures and fixes
- [x402 protocol spec](https://www.x402.org/)
