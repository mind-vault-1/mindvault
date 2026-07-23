/**
 * Deterministic mock of the external services the MindVault MCP server talks to,
 * used by the smoke test's `--target mock` mode so it can run with no live
 * backend, no funded wallet, and no network access.
 *
 * A single HTTP listener stands in for three upstreams (routed by path, so
 * hostnames never collide):
 *   - the sponsored-account service  (POST /create)
 *   - Stellar Horizon                (GET  /accounts/:pk)
 *   - the vault API                  (/resources, /publishers, /agent/status, …)
 *
 * The paid endpoints (`/verify-content`, `/resources/:id`) return 200 directly,
 * so the x402 wrapper passes through without a real on-chain payment.
 */

import { Keypair } from "@stellar/stellar-sdk";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "http";
import type { AddressInfo } from "net";

export interface MockServer {
  /** Base URL bound to a `*.localhost` host so the server's network validation infers testnet. */
  url: string;
  port: number;
  close: () => Promise<void>;
}

interface MockResource {
  id: string;
  title: string;
  description: string;
  price: string;
  resourceType: "link";
  verificationStatus: "verified";
  accessUrl: string;
}

async function readBody(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf-8"));
  } catch {
    return {};
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(payload);
}

/**
 * Start the mock server. It listens on `::` (dual-stack loopback) so requests to
 * any `*.localhost` host the MCP server is pointed at resolve back here.
 */
export function startMockServer(): Promise<MockServer> {
  const resources = new Map<string, MockResource>();
  let resourceCounter = 0;

  const server: Server = createServer((req, res) => {
    handle(req, res).catch((err) => {
      sendJson(res, 500, { error: `mock server failure: ${String(err)}` });
    });
  });

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const method = (req.method ?? "GET").toUpperCase();
    const { pathname } = new URL(req.url ?? "/", "http://localhost");

    // Sponsored-account service: mint a real (random) Stellar keypair so the
    // MCP server can construct an x402 signer without hitting the chain.
    if (method === "POST" && pathname === "/create") {
      const kp = Keypair.random();
      return sendJson(res, 200, { publicKey: kp.publicKey(), secretKey: kp.secret() });
    }

    // Horizon: report a healthy USDC balance so funds checks always pass.
    if (method === "GET" && pathname.startsWith("/accounts/")) {
      return sendJson(res, 200, {
        balances: [
          { asset_type: "credit_alphanum4", asset_code: "USDC", balance: "1000.0000000" },
          { asset_type: "native", balance: "100.0000000" },
        ],
      });
    }

    // Vault API — publisher registration.
    if (method === "POST" && pathname === "/publishers") {
      return sendJson(res, 200, { id: "pub-smoke-1", apiKey: "smoke-api-key" });
    }

    // Vault API — verification agent status (drives the pre-publish funds check).
    if (method === "GET" && pathname === "/agent/status") {
      return sendJson(res, 200, {
        agent: { pricePerVerification: "0.01", totalEarnings: "0", verifications: 0 },
      });
    }

    // Vault API — paid content verification. 200 ⇒ x402 wrapper passes through.
    if (method === "POST" && pathname === "/verify-content") {
      return sendJson(res, 200, { isOriginal: true, flags: [] });
    }

    // Vault API — resource collection: create (POST) / browse (GET).
    if (pathname === "/resources") {
      if (method === "POST") {
        const body = await readBody(req);
        resourceCounter += 1;
        const id = `smoke-res-${resourceCounter}`;
        const resource: MockResource = {
          id,
          title: typeof body.title === "string" ? body.title : "Untitled",
          description: typeof body.description === "string" ? body.description : "",
          price: typeof body.price === "string" ? body.price : "0",
          resourceType: "link",
          verificationStatus: "verified",
          accessUrl: `${baseUrl()}/access/${id}`,
        };
        resources.set(id, resource);
        return sendJson(res, 201, resource);
      }
      if (method === "GET") {
        return sendJson(res, 200, [...resources.values()]);
      }
    }

    // Vault API — per-resource routes: /resources/:id[/meta|/register]
    const parts = pathname.split("/").filter(Boolean);
    if (parts[0] === "resources" && parts.length >= 2) {
      const id = parts[1];
      const sub = parts[2];
      const resource = resources.get(id);

      if (sub === "register" && method === "POST") {
        return sendJson(res, 200, {
          onchainStatus: "registered",
          onchainTxHash: `SMOKE_TX_${id.toUpperCase().replace(/-/g, "_")}`,
        });
      }
      if (sub === "meta" && method === "GET") {
        if (!resource) return sendJson(res, 404, { error: "not found" });
        return sendJson(res, 200, resource);
      }
      // Buy: paid endpoint, returns 200 so the x402 wrapper passes through.
      if (sub === undefined && method === "GET") {
        if (!resource) return sendJson(res, 404, { error: "not found" });
        return sendJson(res, 200, {
          id: resource.id,
          title: resource.title,
          accessUrl: resource.accessUrl,
          content: `Mock content for ${resource.id}`,
        });
      }
    }

    sendJson(res, 404, { error: `no mock route for ${method} ${pathname}` });
  }

  function baseUrl(): string {
    const { port } = server.address() as AddressInfo;
    return `http://testnet.localhost:${port}`;
  }

  return new Promise((resolve, reject) => {
    server.on("error", reject);
    // Bind to all loopback interfaces so *.localhost (IPv4 or IPv6) reaches us.
    server.listen(0, "::", () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: baseUrl(),
        port,
        close: () =>
          new Promise<void>((res, rej) => server.close((err) => (err ? rej(err) : res()))),
      });
    });
  });
}
