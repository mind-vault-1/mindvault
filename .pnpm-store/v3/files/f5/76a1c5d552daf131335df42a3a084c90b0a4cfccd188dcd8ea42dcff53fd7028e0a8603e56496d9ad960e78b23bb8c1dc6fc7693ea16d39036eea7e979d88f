// src/shared/json.ts
function toJsonSafe(obj) {
  return JSON.parse(
    JSON.stringify(
      obj,
      (_key, value) => typeof value === "bigint" ? value.toString() : value
    )
  );
}

// src/verify/useFacilitator.ts
var DEFAULT_FACILITATOR_URL = "https://facilitator.stellar-x402.org";
function useFacilitator(facilitator) {
  async function verify2(payload, paymentRequirements) {
    const url = facilitator?.url || DEFAULT_FACILITATOR_URL;
    let headers = { "Content-Type": "application/json" };
    if (facilitator?.createAuthHeaders) {
      const authHeaders = await facilitator.createAuthHeaders();
      headers = { ...headers, ...authHeaders.verify };
    }
    const res = await fetch(`${url}/verify`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        x402Version: payload.x402Version,
        paymentPayload: toJsonSafe(payload),
        paymentRequirements: toJsonSafe(paymentRequirements)
      })
    });
    if (res.status !== 200) {
      let errorMessage = `Failed to verify payment: ${res.statusText}`;
      try {
        const errorData = await res.json();
        if (errorData.error) {
          errorMessage = errorData.error;
        }
      } catch {
      }
      throw new Error(errorMessage);
    }
    const data = await res.json();
    return data;
  }
  async function settle2(payload, paymentRequirements) {
    const url = facilitator?.url || DEFAULT_FACILITATOR_URL;
    let headers = { "Content-Type": "application/json" };
    if (facilitator?.createAuthHeaders) {
      const authHeaders = await facilitator.createAuthHeaders();
      headers = { ...headers, ...authHeaders.settle };
    }
    const res = await fetch(`${url}/settle`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        x402Version: payload.x402Version,
        paymentPayload: toJsonSafe(payload),
        paymentRequirements: toJsonSafe(paymentRequirements)
      })
    });
    if (res.status !== 200) {
      let errorMessage = `Failed to settle payment: ${res.status} ${res.statusText}`;
      try {
        const errorData = await res.json();
        if (errorData.error) {
          errorMessage = errorData.error;
        }
      } catch {
      }
      throw new Error(errorMessage);
    }
    const data = await res.json();
    return data;
  }
  async function supported2() {
    const url = facilitator?.url || DEFAULT_FACILITATOR_URL;
    let headers = { "Content-Type": "application/json" };
    if (facilitator?.createAuthHeaders) {
      const authHeaders = await facilitator.createAuthHeaders();
      headers = { ...headers, ...authHeaders.supported };
    }
    const res = await fetch(`${url}/supported`, {
      method: "GET",
      headers
    });
    if (res.status !== 200) {
      throw new Error(`Failed to get supported payment kinds: ${res.statusText}`);
    }
    const data = await res.json();
    return data;
  }
  async function list2(config = {}) {
    const url = facilitator?.url || DEFAULT_FACILITATOR_URL;
    let headers = { "Content-Type": "application/json" };
    if (facilitator?.createAuthHeaders) {
      const authHeaders = await facilitator.createAuthHeaders();
      if (authHeaders.list) {
        headers = { ...headers, ...authHeaders.list };
      }
    }
    const params = new URLSearchParams();
    if (config.type !== void 0) params.set("type", config.type);
    if (config.limit !== void 0) params.set("limit", config.limit.toString());
    if (config.offset !== void 0) params.set("offset", config.offset.toString());
    const queryString = params.toString();
    const requestUrl = queryString ? `${url}/discovery/resources?${queryString}` : `${url}/discovery/resources`;
    const res = await fetch(requestUrl, {
      method: "GET",
      headers
    });
    if (res.status !== 200) {
      throw new Error(`Failed to list discovery resources: ${res.status} ${res.statusText}`);
    }
    const data = await res.json();
    return data;
  }
  return { verify: verify2, settle: settle2, supported: supported2, list: list2 };
}
var { verify, settle, supported, list } = useFacilitator();

export { list, settle, supported, useFacilitator, verify };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map