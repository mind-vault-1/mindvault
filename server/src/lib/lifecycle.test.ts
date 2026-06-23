import { describe, it, expect, beforeEach } from "vitest";
import {
  isAccepting,
  beginShutdown,
  incInFlight,
  decInFlight,
  inFlightCount,
  whenDrained,
  __resetLifecycle,
} from "./lifecycle.js";

describe("lifecycle", () => {
  beforeEach(() => {
    __resetLifecycle();
  });

  it("accepts connections until shutdown begins", () => {
    expect(isAccepting()).toBe(true);
    beginShutdown();
    expect(isAccepting()).toBe(false);
  });

  it("tracks the in-flight request count without going negative", () => {
    incInFlight();
    incInFlight();
    expect(inFlightCount()).toBe(2);
    decInFlight();
    expect(inFlightCount()).toBe(1);
    decInFlight();
    decInFlight();
    expect(inFlightCount()).toBe(0);
  });

  it("whenDrained resolves immediately when idle", async () => {
    await expect(whenDrained()).resolves.toBeUndefined();
  });

  it("whenDrained resolves once the last in-flight request finishes", async () => {
    incInFlight();
    incInFlight();

    let resolved = false;
    const drained = whenDrained().then(() => {
      resolved = true;
    });

    decInFlight();
    expect(resolved).toBe(false); // still one in flight

    decInFlight();
    await drained;
    expect(resolved).toBe(true);
  });
});
