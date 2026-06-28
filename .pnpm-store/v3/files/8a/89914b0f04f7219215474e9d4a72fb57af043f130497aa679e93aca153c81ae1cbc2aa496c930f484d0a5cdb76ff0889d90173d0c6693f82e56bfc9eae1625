import { isValidISO8601Date as e } from "@signinwithethereum/siwe-parser";
//#region lib/types.ts
var t = [
	"signature",
	"scheme",
	"domain",
	"nonce",
	"uri",
	"chainId",
	"requestId",
	"time"
], n = [
	"provider",
	"config",
	"suppressExceptions",
	"verificationFallback",
	"strict"
], r = class e extends Error {
	type;
	expected;
	received;
	constructor(t, n, r) {
		super(t), this.name = "SiweError", this.type = t, this.expected = n, this.received = r, Object.setPrototypeOf(this, e.prototype);
	}
}, i = /* @__PURE__ */ function(e) {
	return e.EXPIRED_MESSAGE = "Expired message.", e.INVALID_DOMAIN = "Invalid domain.", e.SCHEME_MISMATCH = "Scheme does not match provided scheme for verification.", e.DOMAIN_MISMATCH = "Domain does not match provided domain for verification.", e.NONCE_MISMATCH = "Nonce does not match provided nonce for verification.", e.URI_MISMATCH = "URI does not match provided URI for verification.", e.CHAIN_ID_MISMATCH = "Chain ID does not match provided chain ID for verification.", e.REQUEST_ID_MISMATCH = "Request ID does not match provided request ID for verification.", e.INVALID_ADDRESS = "Invalid address.", e.INVALID_URI = "URI does not conform to RFC 3986.", e.INVALID_NONCE = "Nonce size smaller then 8 characters or is not alphanumeric.", e.NOT_YET_VALID_MESSAGE = "Message is not valid yet.", e.INVALID_SIGNATURE = "Signature does not match address of the message.", e.INVALID_SIGNATURE_CHAIN_ID = "Contract wallet verification provider chain does not match message chain ID.", e.INVALID_TIME_FORMAT = "Invalid time format.", e.INVALID_MESSAGE_VERSION = "Invalid message version.", e.UNABLE_TO_PARSE = "Unable to parse the message.", e.MISSING_DOMAIN = "Domain is required for verification.", e.MISSING_NONCE = "Nonce is required for verification.", e.MISSING_URI = "URI is required in strict mode.", e.MISSING_CHAIN_ID = "Chain ID is required in strict mode.", e.MISSING_CONFIG = "No verification configuration found.", e.MISSING_PROVIDER_LIBRARY = "Required provider library is not installed.", e.NONCE_GENERATION_FAILED = "Nonce generation failed.", e.INVALID_PARAMS = "Invalid parameters passed to verify.", e.MALFORMED_MESSAGE = "Message could not be prepared for signing.", e;
}({}), a = "0x1626ba7e", o = null;
function s(e) {
	o = e;
}
function c() {
	return o;
}
async function l(e) {
	try {
		let t = await import("viem"), { createViemConfig: n } = await import("./viemAdapter-By13KInL.js").then((e) => e.n);
		return n({ publicClient: t.createPublicClient({ transport: t.http(e) }) });
	} catch {}
	try {
		let { ethers: t } = await import("ethers"), { createEthersConfig: n } = await import("./ethersCompat-Df4a6QIZ.js").then((e) => e.n), r;
		return r = t.JsonRpcProvider ? new t.JsonRpcProvider(e) : new t.providers.JsonRpcProvider(e), n(r);
	} catch {}
	throw new r(i.MISSING_PROVIDER_LIBRARY, "viem or ethers installed", "Neither found");
}
//#endregion
//#region lib/utils.ts
var u = async (e, t, n) => n?.checkContractWalletSignature ? n.checkContractWalletSignature(e.address, e.prepareMessage(), t, e.chainId) : !1, d = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789", f = () => {
	let e = new Uint8Array(17);
	crypto.getRandomValues(e);
	let t = "";
	for (let n = 0; n < 17; n++) t += d[e[n] % 62];
	if (!t || t.length < 8) throw new r(i.NONCE_GENERATION_FAILED, "alphanumeric nonce >= 8 chars", String(t));
	return t;
}, p = class e extends Error {
	constructor(t) {
		super(t), this.name = "ChainIdMismatchError", Object.setPrototypeOf(this, e.prototype);
	}
}, m = (e, t) => {
	let n = [];
	return Object.keys(e).forEach((e) => {
		t.includes(e) || n.push(e);
	}), n;
};
//#endregion
export { e as a, l as c, i as d, n as f, f as i, c as l, u as n, a as o, t as p, m as r, s, p as t, r as u };
