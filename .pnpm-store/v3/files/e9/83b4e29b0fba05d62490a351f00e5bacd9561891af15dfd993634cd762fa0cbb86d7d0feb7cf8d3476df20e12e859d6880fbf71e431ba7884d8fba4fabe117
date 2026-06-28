import {
  x402HTTPClient
} from "../chunk-YEYZQZNL.mjs";
import "../chunk-FPXAE3OS.mjs";
import {
  x402Version
} from "../chunk-VE37GDG2.mjs";
import "../chunk-AGOUMC4P.mjs";
import {
  findByNetworkAndScheme,
  findSchemesByNetwork
} from "../chunk-ABS7D6VX.mjs";
import "../chunk-BJTO5JO5.mjs";

// src/client/x402Client.ts
var x402Client = class _x402Client {
  /**
   * Creates a new x402Client instance.
   *
   * @param paymentRequirementsSelector - Function to select payment requirements from available options
   */
  constructor(paymentRequirementsSelector) {
    this.registeredClientSchemes = /* @__PURE__ */ new Map();
    this.schemeClientHookAdapters = /* @__PURE__ */ new Map();
    this.policies = [];
    this.registeredExtensions = /* @__PURE__ */ new Map();
    this.beforePaymentCreationHooks = [];
    this.afterPaymentCreationHooks = [];
    this.onPaymentCreationFailureHooks = [];
    this.paymentResponseHooks = [];
    this.paymentRequirementsSelector = paymentRequirementsSelector || ((x402Version2, accepts) => accepts[0]);
  }
  /**
   * Creates a new x402Client instance from a configuration object.
   *
   * @param config - The client configuration including schemes, policies, and payment requirements selector
   * @returns A configured x402Client instance
   */
  static fromConfig(config) {
    const client = new _x402Client(config.paymentRequirementsSelector);
    config.schemes.forEach((scheme) => {
      if (scheme.x402Version === 1) {
        client.registerV1(scheme.network, scheme.client);
      } else {
        client.register(scheme.network, scheme.client);
      }
    });
    config.policies?.forEach((policy) => {
      client.registerPolicy(policy);
    });
    return client;
  }
  /**
   * Registers a scheme client for the current x402 version.
   *
   * @param network - The network to register the client for
   * @param client - The scheme network client to register
   * @returns The x402Client instance for chaining
   */
  register(network, client) {
    return this._registerScheme(x402Version, network, client);
  }
  /**
   * Registers a scheme client for x402 version 1.
   *
   * @param network - The v1 network identifier (e.g., 'base-sepolia', 'solana-devnet')
   * @param client - The scheme network client to register
   * @returns The x402Client instance for chaining
   */
  registerV1(network, client) {
    return this._registerScheme(1, network, client);
  }
  /**
   * Registers a policy to filter or transform payment requirements.
   *
   * Policies are applied in order after filtering by registered schemes
   * and before the selector chooses the final payment requirement.
   *
   * @param policy - Function to filter/transform payment requirements
   * @returns The x402Client instance for chaining
   *
   * @example
   * ```typescript
   * // Prefer cheaper options
   * client.registerPolicy((version, reqs) =>
   *   reqs.filter(r => BigInt(r.value) < BigInt('1000000'))
   * );
   *
   * // Prefer specific networks
   * client.registerPolicy((version, reqs) =>
   *   reqs.filter(r => r.network.startsWith('eip155:'))
   * );
   * ```
   */
  registerPolicy(policy) {
    this.policies.push(policy);
    return this;
  }
  /**
   * Registers a client extension that can enrich payment payloads.
   *
   * Extensions are invoked after the scheme creates the base payload and the
   * payload is wrapped with extensions/resource/accepted data. If the extension's
   * key is present in `paymentRequired.extensions`, the extension's
   * `enrichPaymentPayload` hook is called to modify the payload.
   *
   * @param extension - The client extension to register
   * @returns The x402Client instance for chaining
   */
  registerExtension(extension) {
    this.registeredExtensions.set(extension.key, extension);
    return this;
  }
  /**
   * Get all registered client extensions.
   *
   * @returns Array of registered extensions
   */
  getExtensions() {
    return Array.from(this.registeredExtensions.values());
  }
  /**
   * Register a hook to execute before payment payload creation.
   * Can abort creation by returning { abort: true, reason: string }
   *
   * @param hook - The hook function to register
   * @returns The x402Client instance for chaining
   */
  onBeforePaymentCreation(hook) {
    this.beforePaymentCreationHooks.push(hook);
    return this;
  }
  /**
   * Register a hook to execute after successful payment payload creation.
   *
   * @param hook - The hook function to register
   * @returns The x402Client instance for chaining
   */
  onAfterPaymentCreation(hook) {
    this.afterPaymentCreationHooks.push(hook);
    return this;
  }
  /**
   * Register a hook to execute when payment payload creation fails.
   * Can recover from failure by returning { recovered: true, payload: PaymentPayload }
   *
   * @param hook - The hook function to register
   * @returns The x402Client instance for chaining
   */
  onPaymentCreationFailure(hook) {
    this.onPaymentCreationFailureHooks.push(hook);
    return this;
  }
  /**
   * Register a hook to execute after a paid request completes.
   * Can signal recovery by returning { recovered: true }, causing the transport to retry.
   *
   * @param hook - The hook function to register
   * @returns The x402Client instance for chaining
   */
  onPaymentResponse(hook) {
    this.paymentResponseHooks.push(hook);
    return this;
  }
  /**
   * Fires all registered payment response hooks in order.
   * Returns `{ recovered: true }` if any hook signals recovery (first wins).
   *
   * @param ctx - The payment response context
   * @returns Recovery signal or undefined
   */
  async handlePaymentResponse(ctx) {
    for (const hook of this.getLabeledHooks(
      "onPaymentResponse",
      ctx.paymentPayload.x402Version,
      ctx.requirements,
      ctx.paymentRequired?.extensions ?? ctx.paymentPayload.extensions
    )) {
      const result = await hook(ctx);
      if (result && "recovered" in result && result.recovered) {
        return { recovered: true };
      }
    }
    return void 0;
  }
  /**
   * Creates a payment payload based on a PaymentRequired response.
   *
   * Automatically extracts x402Version, resource, and extensions from the PaymentRequired
   * response and constructs a complete PaymentPayload with the accepted requirements.
   *
   * @param paymentRequired - The PaymentRequired response from the server
   * @returns Promise resolving to the complete payment payload
   */
  async createPaymentPayload(paymentRequired) {
    const clientSchemesByNetwork = this.registeredClientSchemes.get(paymentRequired.x402Version);
    if (!clientSchemesByNetwork) {
      throw new Error(`No client registered for x402 version: ${paymentRequired.x402Version}`);
    }
    const requirements = this.selectPaymentRequirements(paymentRequired.x402Version, paymentRequired.accepts);
    const context = {
      paymentRequired,
      selectedRequirements: requirements
    };
    for (const hook of this.getLabeledHooks(
      "beforePaymentCreation",
      paymentRequired.x402Version,
      requirements,
      paymentRequired.extensions
    )) {
      const result = await hook(context);
      if (result && "abort" in result && result.abort) {
        throw new Error(`Payment creation aborted: ${result.reason}`);
      }
    }
    try {
      const schemeNetworkClient = findByNetworkAndScheme(clientSchemesByNetwork, requirements.scheme, requirements.network);
      if (!schemeNetworkClient) {
        throw new Error(`No client registered for scheme: ${requirements.scheme} and network: ${requirements.network}`);
      }
      const partialPayload = await schemeNetworkClient.createPaymentPayload(
        paymentRequired.x402Version,
        requirements,
        { extensions: paymentRequired.extensions }
      );
      let paymentPayload;
      if (partialPayload.x402Version == 1) {
        paymentPayload = partialPayload;
      } else {
        const mergedExtensions = this.mergeExtensions(
          paymentRequired.extensions,
          partialPayload.extensions
        );
        paymentPayload = {
          x402Version: partialPayload.x402Version,
          payload: partialPayload.payload,
          extensions: mergedExtensions,
          resource: paymentRequired.resource,
          accepted: requirements
        };
      }
      paymentPayload = await this.enrichPaymentPayloadWithExtensions(paymentPayload, paymentRequired);
      const createdContext = {
        ...context,
        paymentPayload
      };
      for (const hook of this.getLabeledHooks(
        "afterPaymentCreation",
        paymentRequired.x402Version,
        requirements,
        paymentRequired.extensions
      )) {
        await hook(createdContext);
      }
      return paymentPayload;
    } catch (error) {
      const failureContext = {
        ...context,
        error
      };
      for (const hook of this.getLabeledHooks(
        "onPaymentCreationFailure",
        paymentRequired.x402Version,
        requirements,
        paymentRequired.extensions
      )) {
        const result = await hook(failureContext);
        if (result && "recovered" in result && result.recovered) {
          return result.payload;
        }
      }
      throw error;
    }
  }
  /**
   * Merges server-declared extensions with client extension echoes.
   * Client extension data may add fields, but server-declared fields remain intact.
   *
   * @param serverExtensions - Extensions declared by the server in the 402 response
   * @param clientExtensions - Extensions provided by the client or scheme
   * @returns The merged extensions object, or undefined if both inputs are undefined
   */
  mergeExtensions(serverExtensions, clientExtensions) {
    if (!clientExtensions) return serverExtensions;
    if (!serverExtensions) return clientExtensions;
    const merged = { ...serverExtensions };
    for (const [key, clientValue] of Object.entries(clientExtensions)) {
      const serverValue = merged[key];
      if (serverValue === null || typeof serverValue !== "object" || Array.isArray(serverValue) || clientValue === null || typeof clientValue !== "object" || Array.isArray(clientValue)) {
        merged[key] = clientValue;
        continue;
      }
      const serverRecord = serverValue;
      const clientRecord = clientValue;
      const extensionValue = { ...serverRecord };
      const pending = [{ target: extensionValue, source: clientRecord }];
      for (const item of pending) {
        for (const [fieldKey, clientFieldValue] of Object.entries(item.source)) {
          const serverFieldValue = item.target[fieldKey];
          if (serverFieldValue !== null && typeof serverFieldValue === "object" && !Array.isArray(serverFieldValue) && clientFieldValue !== null && typeof clientFieldValue === "object" && !Array.isArray(clientFieldValue)) {
            const nestedValue = { ...serverFieldValue };
            item.target[fieldKey] = nestedValue;
            pending.push({
              target: nestedValue,
              source: clientFieldValue
            });
            continue;
          }
          if (!Object.prototype.hasOwnProperty.call(item.target, fieldKey)) {
            item.target[fieldKey] = clientFieldValue;
          }
        }
      }
      merged[key] = extensionValue;
    }
    return merged;
  }
  /**
   * Enriches a payment payload by calling registered extension hooks.
   * For each extension key present in the PaymentRequired response,
   * invokes the corresponding extension's enrichPaymentPayload callback.
   *
   * @param paymentPayload - The payment payload to enrich with extension data
   * @param paymentRequired - The PaymentRequired response containing extension declarations
   * @returns The enriched payment payload with extension data applied
   */
  async enrichPaymentPayloadWithExtensions(paymentPayload, paymentRequired) {
    if (!paymentRequired.extensions || this.registeredExtensions.size === 0) {
      return paymentPayload;
    }
    let enriched = paymentPayload;
    for (const [key, extension] of this.registeredExtensions) {
      if (key in paymentRequired.extensions && extension.enrichPaymentPayload) {
        enriched = await extension.enrichPaymentPayload(enriched, paymentRequired);
      }
    }
    return {
      ...enriched,
      extensions: this.mergeExtensions(paymentRequired.extensions, enriched.extensions)
    };
  }
  /**
   * Selects appropriate payment requirements based on registered clients and policies.
   *
   * Selection process:
   * 1. Filter by registered schemes (network + scheme support)
   * 2. Apply all registered policies in order
   * 3. Use selector to choose final requirement
   *
   * @param x402Version - The x402 protocol version
   * @param paymentRequirements - Array of available payment requirements
   * @returns The selected payment requirements
   */
  selectPaymentRequirements(x402Version2, paymentRequirements) {
    const clientSchemesByNetwork = this.registeredClientSchemes.get(x402Version2);
    if (!clientSchemesByNetwork) {
      throw new Error(`No client registered for x402 version: ${x402Version2}`);
    }
    const supportedPaymentRequirements = paymentRequirements.filter((requirement) => {
      let clientSchemes = findSchemesByNetwork(clientSchemesByNetwork, requirement.network);
      if (!clientSchemes) {
        return false;
      }
      return clientSchemes.has(requirement.scheme);
    });
    if (supportedPaymentRequirements.length === 0) {
      throw new Error(`No network/scheme registered for x402 version: ${x402Version2} which comply with the payment requirements. ${JSON.stringify({
        x402Version: x402Version2,
        paymentRequirements,
        x402Versions: Array.from(this.registeredClientSchemes.keys()),
        networks: Array.from(clientSchemesByNetwork.keys()),
        schemes: Array.from(clientSchemesByNetwork.values()).map((schemes) => Array.from(schemes.keys())).flat()
      })}`);
    }
    let filteredRequirements = supportedPaymentRequirements;
    for (const policy of this.policies) {
      filteredRequirements = policy(x402Version2, filteredRequirements);
      if (filteredRequirements.length === 0) {
        throw new Error(`All payment requirements were filtered out by policies for x402 version: ${x402Version2}`);
      }
    }
    return this.paymentRequirementsSelector(x402Version2, filteredRequirements);
  }
  /**
   * Internal method to register a scheme client.
   *
   * @param x402Version - The x402 protocol version
   * @param network - The network to register the client for
   * @param client - The scheme network client to register
   * @returns The x402Client instance for chaining
   */
  _registerScheme(x402Version2, network, client) {
    if (!this.registeredClientSchemes.has(x402Version2)) {
      this.registeredClientSchemes.set(x402Version2, /* @__PURE__ */ new Map());
    }
    const clientSchemesByNetwork = this.registeredClientSchemes.get(x402Version2);
    if (!clientSchemesByNetwork.has(network)) {
      clientSchemesByNetwork.set(network, /* @__PURE__ */ new Map());
    }
    const clientByScheme = clientSchemesByNetwork.get(network);
    clientByScheme.set(client.scheme, client);
    if (!this.schemeClientHookAdapters.has(x402Version2)) {
      this.schemeClientHookAdapters.set(x402Version2, /* @__PURE__ */ new Map());
    }
    const adaptersByNetwork = this.schemeClientHookAdapters.get(x402Version2);
    if (!adaptersByNetwork.has(network)) {
      adaptersByNetwork.set(network, /* @__PURE__ */ new Map());
    }
    const adaptersByScheme = adaptersByNetwork.get(network);
    const hooks = client.schemeHooks;
    if (!hooks) {
      adaptersByScheme.delete(client.scheme);
      return this;
    }
    const handles = {};
    if (hooks.onBeforePaymentCreation) {
      handles.beforePaymentCreation = hooks.onBeforePaymentCreation;
    }
    if (hooks.onAfterPaymentCreation) {
      handles.afterPaymentCreation = hooks.onAfterPaymentCreation;
    }
    if (hooks.onPaymentCreationFailure) {
      handles.onPaymentCreationFailure = hooks.onPaymentCreationFailure;
    }
    if (hooks.onPaymentResponse) {
      handles.onPaymentResponse = hooks.onPaymentResponse;
    }
    if (Object.keys(handles).length > 0) {
      adaptersByScheme.set(client.scheme, handles);
    } else {
      adaptersByScheme.delete(client.scheme);
    }
    return this;
  }
  /**
   * Returns manual hooks followed by the selected scheme hook and declared extension hooks.
   *
   * @param phase - Hook slot to collect
   * @param x402Version - Protocol version for the selected requirement
   * @param requirements - Selected payment requirement
   * @param declaredExtensions - Extension declarations that scope extension hooks
   * @returns Hooks in invocation order
   */
  getLabeledHooks(phase, x402Version2, requirements, declaredExtensions) {
    let manual;
    switch (phase) {
      case "beforePaymentCreation":
        manual = this.beforePaymentCreationHooks;
        break;
      case "afterPaymentCreation":
        manual = this.afterPaymentCreationHooks;
        break;
      case "onPaymentCreationFailure":
        manual = this.onPaymentCreationFailureHooks;
        break;
      case "onPaymentResponse":
        manual = this.paymentResponseHooks;
        break;
    }
    const out = [...manual];
    const adaptersByNetwork = this.schemeClientHookAdapters.get(x402Version2);
    const schemeAdapter = adaptersByNetwork ? findByNetworkAndScheme(adaptersByNetwork, requirements.scheme, requirements.network) : void 0;
    const hook = schemeAdapter?.[phase];
    if (hook !== void 0) {
      out.push(hook);
    }
    if (!declaredExtensions) {
      return out;
    }
    const extensionHookKey = this.getClientExtensionHookKey(phase);
    for (const [extensionKey, extension] of this.registeredExtensions) {
      if (!(extensionKey in declaredExtensions)) continue;
      const extensionHook = extension.hooks?.[extensionHookKey];
      if (!extensionHook) continue;
      out.push((async (ctx) => {
        return extensionHook(declaredExtensions[extensionKey], ctx);
      }));
    }
    return out;
  }
  /**
   * Maps internal hook phases to extension hook names.
   *
   * @param phase - Internal hook phase
   * @returns Extension hook key for the phase
   */
  getClientExtensionHookKey(phase) {
    switch (phase) {
      case "beforePaymentCreation":
        return "onBeforePaymentCreation";
      case "afterPaymentCreation":
        return "onAfterPaymentCreation";
      case "onPaymentCreationFailure":
        return "onPaymentCreationFailure";
      case "onPaymentResponse":
        return "onPaymentResponse";
    }
  }
};
export {
  x402Client,
  x402HTTPClient
};
//# sourceMappingURL=index.mjs.map