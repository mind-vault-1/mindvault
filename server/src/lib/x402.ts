import { x402ResourceServer } from "@x402/express";
import { ExactStellarScheme } from "@x402/stellar/exact/server";
import type { Network } from "@x402/core/types";
import { config } from "../config.js";
import { createLoggingFacilitatorClient } from "./loggingFacilitator.js";

export const network = config.NETWORK as Network;

export const facilitatorClient = createLoggingFacilitatorClient(config.FACILITATOR_URL);

export const sharedX402ResourceServer = new x402ResourceServer(facilitatorClient).register(
  network,
  new ExactStellarScheme(),
);
