/**
 * Stable identifiers for the long-running part of a publish (#1250).
 *
 * `mindvault_publish` returns as soon as the resource exists, but AI
 * verification and on-chain registration can take longer than one MCP
 * connection lives. A client that reconnects, or an agent process that
 * restarts, needs a handle that resumes `mindvault_publish_status` polling for
 * the same publish without having kept the resource id around in a form it
 * can trust.
 *
 * The identifier is **derived**, not stored:
 *
 *     pubop1.<base64url(resourceId)>.<check>
 *
 * where `check` is the first 16 hex characters of
 * `sha256("mindvault-publish-operation/v1\n" + network + "\n" + apiOrigin + "\n" + resourceId)`.
 *
 *   - It survives a restart, a reconnect, or a different MCP server process:
 *     nothing has to be persisted, and nothing can be lost or pruned.
 *   - It is bound to the network and API it was issued for. An id issued on
 *     testnet does not resolve after switching to mainnet (or to another API
 *     host that happens to have a resource with the same id); it is refused
 *     instead of silently polling a different resource.
 *   - It carries no secret and grants nothing: publish status is a read of
 *     public resource metadata, so the check only detects typos, truncation
 *     and ids from another scope. It is not an access token.
 *
 * Retention: there is no local expiry. An id resolves for as long as the
 * resource exists on the API it was issued for; once the resource is gone,
 * polling reports the same not-found error a bare `resourceId` would.
 *
 * Pure: no I/O.
 */

import { createHash } from "node:crypto";

export const PUBLISH_OPERATION_ID_PREFIX = "pubop1";

/** Resource ids longer than this are not accepted inside an operation id. */
export const MAX_PUBLISH_OPERATION_RESOURCE_ID_LENGTH = 256;

const CHECK_LENGTH = 16;
const OPERATION_ID_PATTERN = /^pubop1\.([A-Za-z0-9_-]+)\.([0-9a-f]{16})$/;

/** What an operation id is bound to. */
export interface PublishOperationScope {
  /** Stellar network name, e.g. `testnet`. */
  network: string;
  /** Origin of the MindVault API, e.g. `https://api.example.com`. */
  apiOrigin: string;
}

export type PublishOperationResolution =
  | { ok: true; resourceId: string }
  | { ok: false; code: "malformed_operation_id" | "operation_scope_mismatch"; message: string };

function check(resourceId: string, scope: PublishOperationScope): string {
  return createHash("sha256")
    .update(`mindvault-publish-operation/v1\n${scope.network}\n${scope.apiOrigin}\n${resourceId}`)
    .digest("hex")
    .slice(0, CHECK_LENGTH);
}

/** The operation id for publishing `resourceId` in `scope`. */
export function publishOperationId(resourceId: string, scope: PublishOperationScope): string {
  const encoded = Buffer.from(resourceId, "utf8").toString("base64url");
  return `${PUBLISH_OPERATION_ID_PREFIX}.${encoded}.${check(resourceId, scope)}`;
}

/**
 * Resolve an operation id back to its resource id, refusing one that is
 * malformed or was issued for another network or API. Messages never repeat
 * the id.
 */
export function resolvePublishOperationId(
  operationId: string,
  scope: PublishOperationScope,
): PublishOperationResolution {
  const match = OPERATION_ID_PATTERN.exec(operationId.trim());
  const malformed: PublishOperationResolution = {
    ok: false,
    code: "malformed_operation_id",
    message:
      'operationId is not a MindVault publish operation id. Pass the operationId returned by mindvault_publish or mindvault_publish_status (it starts with "pubop1."), or pass resourceId instead.',
  };
  if (!match) return malformed;

  const [, encoded, givenCheck] = match;
  const resourceId = Buffer.from(encoded!, "base64url").toString("utf8");
  if (
    resourceId.length === 0 ||
    resourceId.length > MAX_PUBLISH_OPERATION_RESOURCE_ID_LENGTH ||
    // base64url decoding is lenient; only the canonical encoding is an id.
    Buffer.from(resourceId, "utf8").toString("base64url") !== encoded
  ) {
    return malformed;
  }
  if (check(resourceId, scope) !== givenCheck) {
    return {
      ok: false,
      code: "operation_scope_mismatch",
      message: `operationId was not issued for the active network (${scope.network}) and API (${scope.apiOrigin}), or it was altered. Switch back to the profile and network it was issued on, or pass resourceId instead.`,
    };
  }
  return { ok: true, resourceId };
}

/**
 * The resource a `mindvault_publish_status` call is about: `resourceId`,
 * the resource an `operationId` resolves to, or both when they agree.
 *
 * @throws Error with an agent-safe message when neither is given, the
 *   operation id does not resolve in `scope`, or the two disagree.
 */
export function publishStatusTarget(
  args: { resourceId?: unknown; operationId?: unknown },
  scope: PublishOperationScope,
): string {
  if (args.operationId !== undefined && typeof args.operationId !== "string") {
    throw new Error("operationId must be the string returned by mindvault_publish.");
  }
  const resourceId = typeof args.resourceId === "string" ? args.resourceId.trim() : "";
  const operationId = typeof args.operationId === "string" ? args.operationId.trim() : "";
  if (!operationId) {
    if (!resourceId) {
      throw new Error(
        "resourceId is required (or pass operationId). Pass the id or operationId returned by mindvault_publish (e.g. 'cm7x8y9z').",
      );
    }
    return resourceId;
  }
  const resolved = resolvePublishOperationId(operationId, scope);
  if (!resolved.ok) throw new Error(resolved.message);
  if (resourceId && resourceId !== resolved.resourceId) {
    throw new Error(
      "resourceId and operationId refer to different resources. Pass only one of them.",
    );
  }
  return resolved.resourceId;
}
