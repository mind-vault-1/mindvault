# MCP Tool Summary (generated)

This file is a generated, human-readable summary of the MCP tool surface (ListTools). It is scoped to the `mcp/` package and intended as a quick reference for integrators and reviewers.

Generated: 2026-08-29

## Tools

- `mindvault_setup_wallet`: Create a Stellar wallet using the sponsored account protocol. Optionally pass a profile name to create the wallet under a named profile and make it active.
- `mindvault_wallet_info`: Check the active profile, wallet address, USDC balance, and publisher registration status.
- `mindvault_use_profile`: Switch the active wallet profile, creating it if it does not exist.
- `mindvault_list_profiles`: List all named wallet profiles and their metadata.
- `mindvault_browse`: List resources in the MindVault catalog with optional filters (keyword, price range, verification status, type, owner, sort, pagination, tags, listed state).
- `mindvault_search`: Search the MindVault catalog by keyword and filters; returns compact summaries.
- `mindvault_preview`: Get details and price for a specific resource before purchasing.
- `mindvault_register`: Register as a publisher using the agent wallet (persists API key to state file).
- `mindvault_publish`: Publish a link resource to the catalog; performs AI verification and may register on-chain if verified.
- `mindvault_publish_status`: (not described here) Check publish verification/on-chain registration status.
- `mindvault_buy`: Pay USDC via x402 and access a resource (supports dry-run).
- `mindvault_export_receipts`: Export receipts for purchases as JSON or CSV with filtering and summary.
- `mindvault_register_onchain`: Register an already-published, verified resource on the vault registry contract (retry on-chain registration).
- `mindvault_agent_status`: Report the verification agent's earnings and activity.
- `mindvault_registry_info`: Return on-chain registry contract ID, network, RPC URL, and field information.
- `mindvault_network_profile`: Report current Stellar/x402 network configuration and warnings.
- `mindvault_check_bindings`: Verify registry-client bindings match deployed contract interface.
- `mindvault_check_consistency`: Compare a resource from the API catalog with the same resource on-chain.
- `mindvault_registry_lookup`: Look up a resource directly from the on-chain vault registry by ID.
- `mindvault_registry_list`: List resources registered on-chain with pagination.
- `mindvault_tx_status`: Look up the status of a Stellar transaction by hash via Soroban RPC.
- `mindvault_reset`: Clear credentials from memory and disk (per-profile or all).
- `mindvault_backup_state`: Export an encrypted backup of the state file.
- `mindvault_restore_state`: Restore state from an encrypted backup.
- `mindvault_metrics`: Return opt-in tool-level metrics; optionally reset counters.
- `mindvault_set_tags`: Replace discovery tags on an on-chain resource (owner-only).
- `mindvault_update_metadata`: Update the on-chain metadata pointer for a registered resource (owner-only).
- `mindvault_set_price`: Update on-chain price for a registered resource (owner-only).
- `mindvault_transfer_ownership`: Transfer ownership of a registered resource to another Stellar address.
- `mindvault_set_listed`: Change the listed state (listed/delisted) of a resource (owner-only).
- `mindvault_check_state_permissions`: Verify state file permissions are safe (mode 0600 recommended).
- `mindvault_registry_health`: Check health of dependencies: MindVault API, Horizon, Soroban RPC, contract, and network alignment.
- `mindvault_import_wallet`: Import an existing Stellar secret key into a profile.
- `mindvault_rotate_publisher_key`: Rotate the publisher API key for a profile.
- `mindvault_verify_install`: Verify local installation and configuration (Node.js version, env, contract IDs).
- `mindvault_recover_catalog_cache`: Request a catalog stale-cache recovery; returns guidance for operators.

## Notes

- This file is generated from the tool metadata and is intended as documentation only. For authoritative schemas and input validation, see `mcp/src/tools.ts` and `mcp/src/validation.ts`.
- Keep the generated summary lightweight; regenerate when tool definitions change.
