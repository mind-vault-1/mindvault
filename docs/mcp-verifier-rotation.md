# Verifier Key Rotation and Recovery

This document covers the on-chain and operational steps to rotate verifier
authority in the MindVault vault-registry contract, confirm that the new key is
active, and recover from a lost or incorrect key.

---

## Background

The verifier role authorises an address to call `set_verification_status` on
registered resources. Only the **admin** may grant or revoke this role. Up to
**32** addresses may hold the verifier role simultaneously
(`MAX_ROLE_HOLDERS = 32`).

Three contract functions manage the verifier set:

| Function | Who may call | Effect |
| ---------------------- | ------------ | --------------------------------------------- |
| `add_verifier` | Admin | Grants verifier role to a new address |
| `remove_verifier` | Admin | Revokes verifier role from an address |
| `rotate_verifier` | Admin | Atomically removes old verifier and adds new |

`rotate_verifier` is the preferred path for a planned key rotation because it
is atomic: either both the remove and the add succeed, or neither does.

---

## Authorization prerequisites

Before calling any of these functions, the admin must:

1. Have an active admin address set on the contract (bootstrapped via
   `bootstrap_admin` or `nominate_new_admin` + `accept_admin_role`).
2. Provide `admin.require_auth()` — the transaction must be signed by the
   current admin keypair.
3. Confirm the contract is not paused (`set_paused` must be `false`).
4. Confirm the verifier role does not already have 32 holders when adding a new
   one (error `RoleCapacityReached`).

---

## Planned key rotation (`rotate_verifier`)

Use `rotate_verifier` when you have the old verifier key and want to replace it
in a single atomic operation.

```
rotate_verifier(old_verifier: Address, new_verifier: Address)
```

**Preconditions the contract enforces:**
- `old_verifier != new_verifier` (errors `AlreadyRegistered`)
- `old_verifier` must currently hold the verifier role (errors `NotFound`)
- `new_verifier` must not already hold the verifier role (errors `AlreadyRegistered`)
- Admin authorisation required

**What happens on-chain:**
1. `old_verifier` is removed from the role index (`rmverif` event emitted).
2. `new_verifier` is added to the role index (`addverif` event emitted).
3. A `verrot` event is published with `{ admin, old_verifier, new_verifier, ledger }`.

**Confirm activation:**

After the transaction is confirmed, verify the new key is active:

```
is_verifier(new_verifier)   → true
is_verifier(old_verifier)   → false
```

Also check the `verrot` event in the transaction's event stream. The event
topic is `verrot` and the payload carries:

```json
{
  "admin": "<admin address>",
  "old_verifier": "<old address>",
  "new_verifier": "<new address>",
  "ledger": <ledger sequence at rotation>
}
```

---

## Adding a new verifier without removing the old one

If you are expanding the verifier set rather than replacing a key:

```
add_verifier(verifier: Address)
```

The `addverif` event is emitted on success. Confirm with `is_verifier(new_address)`.

---

## Removing a verifier

```
remove_verifier(verifier: Address)
```

The `rmverif` event is emitted. Confirm with `is_verifier(removed_address) → false`.

---

## Recovery from a lost verifier key

If the old verifier key is lost or compromised, the admin can remove it and
add a replacement without holding the old key.

**Steps:**

1. Confirm the lost address still holds the verifier role:
   ```
   is_verifier(lost_address) → true
   ```

2. Call `remove_verifier(lost_address)` signed by the admin. This does not
   require the lost key — only admin authorisation is needed.

3. Call `add_verifier(new_address)` signed by the admin.

4. Confirm both changes:
   ```
   is_verifier(lost_address) → false
   is_verifier(new_address)  → true
   ```

5. Revoke or rotate the lost key's off-chain credentials (API keys,
   environment secrets, MCP server config) so it cannot sign future requests
   even if recovered.

**Note:** `rotate_verifier` cannot be used for a lost key because it requires
the `old_verifier` address to currently hold the role. If the address was
already removed (e.g. by an emergency admin action), use `add_verifier` alone.

---

## Recovery from an incorrect key (wrong address added)

If `add_verifier` or `rotate_verifier` added the wrong address:

1. Call `remove_verifier(wrong_address)` to revoke the incorrect grant.
2. Call `add_verifier(correct_address)` to grant the right one.
3. Confirm: `is_verifier(wrong_address) → false`, `is_verifier(correct_address) → true`.

---

## Testnet rehearsal

Before rotating on mainnet, rehearse on testnet:

1. Deploy a testnet instance of the vault-registry contract.
2. Bootstrap an admin address.
3. Add a placeholder verifier with `add_verifier`.
4. Run `rotate_verifier(placeholder, new_key)` and verify both `is_verifier` calls.
5. Simulate the lost-key recovery path by calling `remove_verifier(placeholder)`
   without signing with the placeholder key (only admin sig needed).
6. Inspect the event stream for `addverif`, `rmverif`, and `verrot` events to
   confirm event shapes match the expected payload.
7. Use `get_verifier_status_history(verifier_address)` to review the
   paginated status-change history written by any `set_verification_status`
   calls during the rehearsal.

---

## Reading verifier state

| Read | Returns |
| --------------------------------------- | ------------------------------------------------------- |
| `is_verifier(address)` | `bool` — whether the address currently holds the role |
| `list_role_holders(role: Verifier)` | Ordered list of all current verifier addresses |
| `get_verifier_status_history(address)` | Paginated history of `set_verification_status` calls |

`get_verifier_status_history` returns a `VerifierStatusHistoryPage` with a
cursor for pagination. Query it after a rotation to confirm no verification
calls were made by the old key after the rotation ledger.

---

## Event reference

| Event topic | When emitted | Payload |
| ----------- | -------------------------------------------------- | ---------------------------------------------------------- |
| `addverif` | `add_verifier` or `rotate_verifier` (new side) | `RoleChange { admin, target, granted: true }` |
| `rmverif` | `remove_verifier` or `rotate_verifier` (old side) | `RoleChange { admin, target, granted: false }` |
| `verrot` | `rotate_verifier` | `VerifierRotation { admin, old_verifier, new_verifier, ledger }` |

---

## Error reference

| Error | Code | Cause |
| ---------------------- | ---- | --------------------------------------------------------------- |
| `AdminNotSet` | 18 | No admin has been bootstrapped yet |
| `NotFound` | 2 | `old_verifier` passed to `rotate_verifier` does not hold the role |
| `AlreadyRegistered` | 1 | `new_verifier` already holds the role, or `old == new` |
| `RoleCapacityReached` | 56 | Adding would exceed 32 verifier holders |
| `ContractPaused` | — | Contract is paused; rotation blocked |

---

## See also

- [Contract upgrade checklist](contract-upgrade-checklist.md) — includes admin role handoff steps
- [Deployment runbook](deployment-runbook.md) — mainnet deployment procedure
- [Mainnet deployment checklist](mainnet-deployment-checklist.md) — pre-deploy verification
- [MCP error codes](mcp-error-codes.md) — structured error reference
