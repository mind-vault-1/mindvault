import type { DependencyCheck, DependencyStatus } from "./probes.js";

export function overallReadinessStatus(checks: Record<string, DependencyCheck>): DependencyStatus {
  return Object.values(checks).every((c) => c.status === "ok") ? "ok" : "error";
}
