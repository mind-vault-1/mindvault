# Request Signatures (Optional)

Publisher mutations (`POST` and `DELETE` on `/resources/*`) can require an HMAC-SHA256 request signature in addition to the API key. This limits replay and tampering if an API key leaks.

**Off by default.** Set `REQUIRE_REQUEST_SIGNATURE=true` on the server to enforce signatures.

## Headers

| Header | Description |
|--------|-------------|
| `x-api-key` | Publisher API key (also the HMAC secret) |
| `X-Timestamp` | Unix time in **seconds** when the request was signed |
| `X-Signature` | Lowercase hex HMAC-SHA256 of the canonical string |
| `Idempotency-Key` | Optional; included in the canonical string when present |

## Canonical string

Join with newline (`\n`):

```
METHOD
PATH
TIMESTAMP
BODY_SHA256_HEX
[IDEMPOTENCY_KEY]
```

- **METHOD** — uppercase HTTP verb (`POST`, `DELETE`, …)
- **PATH** — path and query only (e.g. `/resources/abc/register`, no scheme/host)
- **TIMESTAMP** — same value as the `X-Timestamp` header (string)
- **BODY_SHA256_HEX** — SHA-256 hex digest of the request body (see below)
- **IDEMPOTENCY_KEY** — only when the `Idempotency-Key` header is sent

Compute the signature:

```
X-Signature = HMAC-SHA256(secret=api_key, message=canonical_string)
```

Use `crypto.timingSafeEqual` (or equivalent) when comparing on the server.

## Body hash

### JSON requests

Hash the **exact raw UTF-8 bytes** sent as the body:

```js
bodyHash = sha256(rawBody).hex()
```

For an empty body (e.g. `DELETE`, or `POST` with no payload):

```
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
```

### Multipart file publish (`POST /resources`)

After parsing form fields, hash a canonical string built from sorted field names:

```
description=...
price=1.00
title=My Doc
walletAddress=G...
file=<sha256_hex_of_file_bytes>
```

Then `bodyHash = sha256(that_string).hex()`. Omit the `file=` line when publishing a link without a file upload.

## Timestamp window

Reject requests when `|now - timestamp|` exceeds `SIGNATURE_MAX_SKEW_MS` (default **5 minutes** / `300000` ms). Stale or future-dated requests return `401` with `"Request timestamp outside allowed window"`.

## Protected routes

When enabled, signatures are required on:

- `POST /resources`
- `DELETE /resources/{id}`
- `POST /resources/{id}/register`
- `POST /resources/{id}/price/prepare`
- `POST /resources/{id}/price`
- `POST /resources/{id}/ownership/prepare`
- `POST /resources/{id}/ownership`

Read-only authenticated routes (`GET /publishers/me`, `GET /resources/{id}/register/prepare`, etc.) are **not** signed.

## Server configuration

```env
# Off by default
REQUIRE_REQUEST_SIGNATURE=false
# Max clock skew when signatures are required (milliseconds)
SIGNATURE_MAX_SKEW_MS=300000
```

## Client examples

### Node.js (MCP server)

The MCP package signs mutating requests automatically when `x-api-key` is present. See `mcp/src/requestSignature.ts`.

### Web dashboard

The web app signs publisher mutations via `web/src/api/requestSignature.ts` (`signedPublisherFetch`).

### curl (JSON)

```bash
API_KEY="mv_..."
METHOD="POST"
PATH="/resources/abc/register"
BODY='{"signedXdr":"AAAA..."}'
TS=$(date +%s)
BODY_HASH=$(printf '%s' "$BODY" | openssl dgst -sha256 -hex | awk '{print $2}')
CANONICAL=$(printf '%s\n%s\n%s\n%s' "$METHOD" "$PATH" "$TS" "$BODY_HASH")
SIG=$(printf '%s' "$CANONICAL" | openssl dgst -sha256 -hmac "$API_KEY" -hex | awk '{print $2}')

curl -X POST "http://localhost:4021$PATH" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $API_KEY" \
  -H "X-Timestamp: $TS" \
  -H "X-Signature: $SIG" \
  -d "$BODY"
```

## Error responses

| Status | `error` field |
|--------|----------------|
| 401 | `Missing X-Timestamp header` |
| 401 | `Missing X-Signature header` |
| 401 | `Request timestamp outside allowed window` |
| 401 | `Invalid request signature` |

When `REQUIRE_REQUEST_SIGNATURE=false`, unsigned requests behave as before (API key only).
