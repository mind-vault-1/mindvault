# MCP State Backup & Restore Threat Model

`mindvault_backup_state` and `mindvault_restore_state` move an agent's full
`~/.mindvault/state.json` between environments. That state file is not ordinary
data: every profile inside it holds a **Stellar wallet secret key** and a
**publisher API key**. A backup that leaks them compromises the agent's on-chain
wallet and its publisher account.

This document is the threat model for that backup/restore path. It names the
assets at stake, draws the trust boundaries the blob crosses, enumerates the
threats and the code that mitigates each one, and lists what an operator must
still do right. The implementation lives in
[`mcp/src/stateBackup.ts`](../mcp/src/stateBackup.ts); the comparison and
corrupt-recovery behavior is exposed through the `mindvault_*_state` tools
described in [mcp-wallet-profiles.md](mcp-wallet-profiles.md).

## Assets and trust boundaries

### Assets

| Asset                          | What it is                                              | Why it matters                                              |
| ------------------------------ | ------------------------------------------------------- | ----------------------------------------------------------- |
| Wallet secret key (per profile) | Stellar seed (`S…`) that signs for the profile's wallet | Controls the agent's USDC. Anyone who reads it can spend.   |
| Publisher API key (per profile) | Key authorizing publisher mutations through the server | Authorizes publish / price / ownership changes on behalf of the agent. |
| Active profile name             | Which profile the next tool call acts on               | Selects which wallet signs and which API key authenticates.  |
| State version                  | Schema version of the persisted state                  | Drives migration; a wrong version can mis-deserialize state. |

### Trust boundaries

The backup blob crosses three zones, and the trust posture differs for each:

- **Local filesystem (`~/.mindvault/`)** — trusted. The state file and backup
  directory live here, written mode `0600` (owner-only). On a single-user
  machine the operator owns this zone.
- **Agent chat transport** — untrusted. The operator types the passphrase and
  pastes the blob into the MCP client (Claude Code, Codex, Cursor, …). That
  transcript may be logged, shared, or sent to a remote model. The passphrase
  is entered here, so this is where passphrase hygiene begins and ends.
- **Cross-environment copy** — untrusted channel, encrypted payload. The blob
  may transit a chat log, email, a paste service, or version control. It is
  AES-256-GCM ciphertext, so confidentiality and integrity hold regardless of
  the channel — but the **passphrase** travels out of band and must never be
  shipped alongside the blob.

## Threat table

| Threat                                                                                       | Impact                                                              | Mitigation                                                                                                                              | Where enforced                                                                                  |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Plaintext secret exposure in a shared backup                                                 | Wallet drained; publisher account hijacked                          | State is JSON-stringified and encrypted with AES-256-GCM before emission; plaintext secrets never appear in the output, only ciphertext | `exportState` in [`mcp/src/stateBackup.ts`](../mcp/src/stateBackup.ts)                          |
| Wrong passphrase on restore                                                                  | Silent decryption of another agent's state, or garbage overwriting local state | GCM auth tag verification fails before any local state is touched; restore aborts with a deterministic error                          | `restoreState` decryption + `decipher.final()`                                                 |
| Backup blob tampering / truncation                                                            | Forged state written to disk, or partial ciphertext misparsed       | GCM auth tag binds integrity to ciphertext; any modification, truncation, or reordering fails the tag before state is written          | `restoreState` (`setAuthTag` + `decipher.final`)                                               |
| Replay of a stale backup over newer state                                                    | Newer wallet/API key replaced by an older copy, losing credentials   | Current state is preserved as `state.json.legacy` before the restore writes; `mindvault_compare_state_backup` previews the diff first   | `restoreState` write path; `compareStateWithBackup` / `compareStateSnapshots`                   |
| Network identity mismatch (testnet wallet restored onto a mainnet server)                    | Agent signs mainnet transactions with a testnet-funded key          | `validateBackupNetworkIdentities` checks each profile's network is testnet/mainnet, matches the server's expected network, and the keypair is consistent | `restoreState` → `validateBackupNetworkIdentities`                                             |
| Profile name collision (case-variant duplicates causing silent overwrite)                   | One identity silently overwrites another (e.g. `default` vs `Default`) | `validateBackupProfiles` rejects case-insensitive duplicates with a field-level error naming each conflicting key, before any write     | `restoreState` → `validateBackupProfiles`                                                      |
| Weak passphrase                                                                              | Offline brute force recovers the key from a captured blob           | Minimum 8 characters enforced; scrypt KDF (N=2^14, r=8, p=1) slows each guess; per-backup salt prevents rainbow-table reuse              | `exportState` / `restoreState` passphrase check + `scryptSync`                                 |
| Backup file readable by other users                                                           | Other accounts on the host read wallet secret keys                   | Backup files are written mode `0600` (owner read/write only), atomically (temp file + rename)                                            | `exportStateFile` → `writeAtomically`                                                           |
| Unbounded backup growth                                                                      | Disk fills; old blobs accumulate secrets indefinitely                | Retention prunes `~/.mindvault/backups` by age (30 days), count (10 files), and total size (50 MiB); active state and `*.legacy`/`*.corrupt-*` files are never deleted | [`mcp/src/retention.ts`](../mcp/src/retention.ts), see [mcp-retention.md](mcp-retention.md)       |
| Corrupt local state during restore                                                           | Restore leaves a half-written state file; both old and new state lost | Current state is moved aside as `state.json.legacy` (mode `0600`) before writing; the restored state is written atomically (temp + rename) | `restoreState` write path → `writeAtomically`                                                   |
| Mismatched keypair (secret key does not derive the stored public key)                        | Wallet signs as a different account than the profile reports        | `validateBackupNetworkIdentities` derives the public key from the secret seed and rejects a mismatch with a field-level error           | `restoreState` → `validateBackupNetworkIdentities`                                             |

## Trust boundaries diagram

```text
                         ┌─────────────────────────────────────────────┐
                         │            Agent chat transport              │
   Operator types         │   (untrusted: logged, shared, remote model) │
   passphrase here ──────▶│                                             │
                         │   passphrase ──▶ restoreState(blob, pass)     │
                         └──────────────────────────┬──────────────────┘
                                                     │
                                  decrypted state    │  (only after GCM tag passes)
                                                     ▼
   ┌───────────────────────────────────────────────────────────────────────┐
   │                      Local filesystem (trusted)                        │
   │                                                                        │
   │   ~/.mindvault/state.json        ← mode 0600, owner-only               │
   │   ~/.mindvault/backups/*.backup  ← mode 0600, owner-only, retention-bound│
   │   ~/.mindvault/state.json.legacy ← preserved before each restore        │
   │   ~/.mindvault/state.json.corrupt-* ← quarantined corrupt state         │
   └───────────────────────────────────────────────────────────────────────┘
                                                     ▲
   ┌──────────────────────────────────────────────────┴──────────────────────┐
   │              Cross-environment copy (untrusted channel)                 │
   │                                                                         │
   │   backup blob = v1:<salt>:<nonce>:<ciphertext+authtag>                  │
   │   AES-256-GCM ciphertext — confidentiality & integrity hold on any channel│
   │   passphrase travels OUT OF BAND, never with the blob                   │
   └─────────────────────────────────────────────────────────────────────────┘
```

The invariant: the blob may cross any untrusted channel safely, but the
passphrase must never travel with it. The agent chat transport is where the
passphrase is exposed, so that zone is treated as untrusted even though it is
where the operator sits.

## Operational implications

The code mitigates the threats above, but several responsibilities remain with
the operator:

- **Passphrase management.** The blob's security reduces to the passphrase.
  Choose a long, unique passphrase, never reuse it, and never store it next
  to the blob. Because the passphrase is typed into the agent chat transport,
  treat that transcript as sensitive. A captured blob without the passphrase
  is defended by scrypt (N=2^14), but a weak or reused passphrase is the
  weakest link.
- **Backup rotation.** Retention prunes old backups automatically (see
  [mcp-retention.md](mcp-retention.md)), but each retained backup still holds
  ciphertext. Rotate the passphrase when you rotate credentials, and delete
  backups for wallets you no longer use.
- **Pre-restore comparison.** Before restoring, run
  `mindvault_compare_state_backup` to preview the diff between local and
  backup state — version, digest match, and structural differences (profile
  names, network bindings, presence of wallet/API key) — without writing
  anything. The restore itself preserves the prior state as `state.json.legacy`,
  so a mistaken restore is reversible from that file.
- **Recovery from corrupt state.** If `state.json` is unreadable, invalid
  JSON, or holds no valid profile, the server quarantines it as
  `state.json.corrupt-<epoch>` and starts empty. Restore the newest backup
  with `mindvault_restore_state`, or re-import the wallet with
  `mindvault_import_wallet` when no backup exists. See
  [mcp-state-recovery.md](mcp-state-recovery.md).

## See also

- [mcp-state-recovery.md](mcp-state-recovery.md) — corrupt state file recovery and quarantine behavior
- [mcp-retention.md](mcp-retention.md) — backup age/count/size bounds and what is never deleted
- [mcp-wallet-profiles.md](mcp-wallet-profiles.md) — multi-profile state, backup/restore tools, and wallet integrity checks
- [mcp-security-guide.md](mcp-security-guide.md) — wallet key handling, confirmation guards, and payment validation
- [`mcp/src/stateBackup.ts`](../mcp/src/stateBackup.ts) — encryption, restore validation, and atomic write implementation
