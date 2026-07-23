# MCP Wallet Profiles

The MindVault MCP server supports **multiple named wallet profiles** so a single
agent can keep separate identities — for example `testnet` vs `mainnet`, or a
`publisher` identity vs a `buyer` identity. Each profile has its own Stellar
wallet and its own publisher API key. Exactly one profile is **active** at a
time, and every tool operates on the active profile.

Profiles are persisted to `~/.mindvault/state.json` (mode `0600`) and reloaded on
restart. Secret keys are never shown in tool output.

## Tools

| Tool                      | What it does                                                                                         |
| ------------------------- | ---------------------------------------------------------------------------------------------------- |
| `mindvault_setup_wallet`  | Create a wallet. Optional `profile` arg creates/switches to that named profile before creating it.   |
| `mindvault_use_profile`   | Switch the active profile (`name` required), creating it if it does not exist.                       |
| `mindvault_list_profiles` | List all profiles, marking the active one and showing each wallet address and registration state.    |
| `mindvault_wallet_info`   | Show the active profile name, wallet address, USDC balance, and whether it is registered.            |
| `mindvault_reset`         | Clear the active profile's credentials, or pass `all=true` to remove every profile and delete state. |

## Example

```text
# Create a dedicated publisher wallet under a named profile
mindvault_setup_wallet { "profile": "publisher" }
mindvault_register     { "name": "Alice", "email": "alice@example.com" }

# Create a separate buyer identity and switch to it
mindvault_setup_wallet { "profile": "buyer" }

# See both identities (the active one is marked with *)
mindvault_list_profiles
#   publisher — GJPUBLISHER..., registered
# * buyer — GJBUYER...

# Switch back to the publisher to list something
mindvault_use_profile  { "name": "publisher" }
mindvault_publish      { "title": "My Dataset", "price": "5", "externalUrl": "https://example.com/data" }
```

## Profile names

Names are 1–64 characters from letters, digits, dot (`.`), dash (`-`), and
underscore (`_`). Invalid names are rejected with a deterministic,
agent-safe error message.

## State migration

Older installs stored a single wallet as `{ wallet, apiKey }` at the top level of
`state.json`. On first load, that state is automatically migrated into a profile
named `default` and re-persisted in the current format:

```json
{
  "version": 1,
  "activeProfile": "default",
  "profiles": {
    "default": { "wallet": { "publicKey": "…", "secretKey": "…" }, "apiKey": "…" }
  }
}
```

No action is required — existing wallets keep working as the `default` profile.
The migration is covered by unit tests in
[`mcp/src/profiles.test.ts`](../mcp/src/profiles.test.ts).
