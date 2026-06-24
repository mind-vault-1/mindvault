import { describe, it, expect } from "vitest";
import { parsePayerFromXPayment } from "./parseXPayment.js";

function encode(payload: unknown): string {
  return Buffer.from(JSON.stringify(payload)).toString("base64");
}

describe("parsePayerFromXPayment", () => {
  describe("EVM exact scheme — payload.authorization.from", () => {
    it("extracts payer from payload.authorization.from", () => {
      const header = encode({
        x402Version: 1,
        scheme: "exact",
        network: "eip155:8453",
        payload: {
          signature: "0xabc",
          authorization: {
            from: "0x1234567890abcdef1234567890abcdef12345678",
            to: "0xrecipient",
            value: "100000",
            validAfter: "0",
            validBefore: "9999999999",
            nonce: "0xdeadbeef",
          },
        },
      });
      const { payer, parseError } = parsePayerFromXPayment(header);
      expect(payer).toBe("0x1234567890abcdef1234567890abcdef12345678");
      expect(parseError).toBeUndefined();
    });
  });

  describe("legacy Stellar — payload.authorization.address", () => {
    it("extracts payer from payload.authorization.address", () => {
      const header = encode({
        payload: {
          authorization: {
            address: "GABC123EXAMPLESTELLARADDRESS",
          },
        },
      });
      const { payer, parseError } = parsePayerFromXPayment(header);
      expect(payer).toBe("GABC123EXAMPLESTELLARADDRESS");
      expect(parseError).toBeUndefined();
    });
  });

  describe("legacy top-level clientAddress", () => {
    it("extracts payer from clientAddress", () => {
      const header = encode({ clientAddress: "GCLIENT123EXAMPLEADDRESS" });
      const { payer, parseError } = parsePayerFromXPayment(header);
      expect(payer).toBe("GCLIENT123EXAMPLEADDRESS");
      expect(parseError).toBeUndefined();
    });
  });

  describe("Stellar transaction payload — no extractable address", () => {
    it("returns undefined payer without error for Stellar XDR payload", () => {
      const header = encode({
        x402Version: 1,
        payload: { transaction: "AAAAAQAAAA..." },
      });
      const { payer, parseError } = parsePayerFromXPayment(header);
      expect(payer).toBeUndefined();
      expect(parseError).toBeUndefined();
    });
  });

  describe("priority ordering", () => {
    it("prefers authorization.from over authorization.address", () => {
      const header = encode({
        payload: {
          authorization: {
            from: "0xfrom",
            address: "ADDRESS_FALLBACK",
          },
        },
      });
      const { payer } = parsePayerFromXPayment(header);
      expect(payer).toBe("0xfrom");
    });

    it("prefers authorization.address over clientAddress", () => {
      const header = encode({
        clientAddress: "TOP_LEVEL_CLIENT",
        payload: {
          authorization: {
            address: "AUTH_ADDRESS",
          },
        },
      });
      const { payer } = parsePayerFromXPayment(header);
      expect(payer).toBe("AUTH_ADDRESS");
    });
  });

  describe("malformed headers", () => {
    it("returns parseError for non-base64 input", () => {
      const { payer, parseError } = parsePayerFromXPayment("!!!not-base64!!!");
      expect(payer).toBeUndefined();
      expect(parseError).toMatch(/Failed to decode/);
    });

    it("returns parseError for base64 of non-JSON", () => {
      const header = Buffer.from("this is not json").toString("base64");
      const { payer, parseError } = parsePayerFromXPayment(header);
      expect(payer).toBeUndefined();
      expect(parseError).toMatch(/Failed to decode/);
    });

    it("returns parseError for base64 of a JSON array (not an object)", () => {
      const header = Buffer.from(JSON.stringify([1, 2, 3])).toString("base64");
      const { payer, parseError } = parsePayerFromXPayment(header);
      expect(payer).toBeUndefined();
      expect(parseError).toMatch(/not an object/);
    });

    it("returns parseError for base64 of null", () => {
      const header = Buffer.from("null").toString("base64");
      const { payer, parseError } = parsePayerFromXPayment(header);
      expect(payer).toBeUndefined();
      expect(parseError).toMatch(/not an object/);
    });

    it("returns undefined payer without error for empty payload object", () => {
      const header = encode({});
      const { payer, parseError } = parsePayerFromXPayment(header);
      expect(payer).toBeUndefined();
      expect(parseError).toBeUndefined();
    });

    it("returns undefined payer without error when authorization fields are empty strings", () => {
      const header = encode({
        payload: { authorization: { from: "", address: "" } },
        clientAddress: "",
      });
      const { payer, parseError } = parsePayerFromXPayment(header);
      expect(payer).toBeUndefined();
      expect(parseError).toBeUndefined();
    });
  });
});
