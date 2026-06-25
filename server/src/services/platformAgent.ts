import { wrapFetchWithPayment } from "@x402/fetch";
import { x402Client } from "@x402/core/client";
import { ExactStellarScheme } from "@x402/stellar/exact/client";
import { createEd25519Signer } from "@x402/stellar";
import type { Network } from "@x402/core/types";
import { config } from "../config.js";

const network = config.NETWORK as Network;
const signer = createEd25519Signer(config.AGENT_SECRET_KEY, network);

const client = new x402Client().register(network, new ExactStellarScheme(signer));

export const paidFetch = wrapFetchWithPayment(fetch, client);
