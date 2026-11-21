# Upstream health probe (#1205)

`mindvault_upstream_health` gives an operator one answer to "which upstream is
broken right now, and is each one on the network this server is configured
for?"

| Upstream            | Env var                 | Request                                   | Network identity     |
| ------------------- | ----------------------- | ----------------------------------------- | -------------------- |
| `api`               | `MINDVAULT_URL`         | `GET /resources?limit=1`                  | —                    |
| `horizon`           | `HORIZON_URL`           | `GET /`                                   | `network_passphrase` |
| `soroban_rpc`       | `SOROBAN_RPC_URL`       | `POST getNetwork` (JSON-RPC)              | `result.passphrase`  |
| `sponsored_account` | `SPONSORED_ACCOUNT_URL` | `GET /` (the create path is never called) | —                    |

## Behaviour

- **One attempt per upstream, no retries.** The latency is what a single
  request costs, and a flaky upstream is not hidden behind the retry policy.
  `mindvault_registry_health` still retries, for a "will it work eventually"
  answer.
- **Parallel.** The whole probe takes as long as the slowest upstream, bounded
  by `timeoutMs` (default 5000, range 100–30000).
- **Network identity.** The passphrases that Horizon and Soroban RPC report
  are compared with the configured `REGISTRY_NETWORK_PASSPHRASE`.
  `networkMatch` is `true`, `false`, or `null` when the upstream does not
  report one.
- **Status per upstream:**
  - `ok`
  - `degraded`: it answered with a non-2xx status or reported another network
  - `down`: no answer (DNS failure, refused connection or timeout)
  - `not_configured`
  - `skipped`: not in the `upstreams` argument

  Every non-`ok` status comes with an `action` naming the env var to check.

- **Verdict.** `unhealthy` when the API, Horizon or Soroban RPC is down or not
  configured, `degraded` when anything else is wrong (including a failing
  sponsored account service, which is optional), otherwise `healthy`.
- **Safe output.** URLs are reported without credentials, query strings or
  fragments, so an RPC API key in the URL never reaches a transcript.
  Transport errors are reduced to a fixed message plus the error code.

The tool never signs, pays or creates accounts. Results are always listed in
the order `api`, `horizon`, `soroban_rpc`, `sponsored_account`.

```json
{ "upstreams": ["horizon", "soroban_rpc"], "timeoutMs": 2000 }
```

Coverage: [`mcp/src/upstreamProbe.test.ts`](../mcp/src/upstreamProbe.test.ts)
and [`mcp/src/operatorDiagnostics.integration.test.ts`](../mcp/src/operatorDiagnostics.integration.test.ts).
