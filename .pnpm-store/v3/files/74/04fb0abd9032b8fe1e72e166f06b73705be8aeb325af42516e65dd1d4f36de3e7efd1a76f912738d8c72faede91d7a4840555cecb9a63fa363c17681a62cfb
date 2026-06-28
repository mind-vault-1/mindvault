import { a as e, c as t, d as n, f as r, i, l as a, n as o, o as s, p as c, r as l, s as u, t as d, u as f } from "./utils-9-kzgPFC.js";
import { i as p, r as m, t as h } from "./ethersCompat-Df4a6QIZ.js";
import { t as g } from "./viemAdapter-By13KInL.js";
import { ParsedMessage as _, SiweParseError as v, classifyAddressCase as y, parseIntegerNumber as b, toChecksumAddress as x } from "@signinwithethereum/siwe-parser";
//#region lib/client.ts
function S(e, t) {
	return e instanceof f ? e : new f(t, void 0, e instanceof Error ? e.message : String(e));
}
async function C(e) {
	if (e.config) return e.config;
	let { provider: t } = e, r = a();
	if (r) {
		if (t && !r.checkContractWalletSignature) {
			let { tryAutoDetectEthers: e } = await import("./ethersCompat-Df4a6QIZ.js").then((e) => e.n), n = await e(t);
			if (n) return {
				...r,
				checkContractWalletSignature: n.checkContractWalletSignature
			};
		}
		return r;
	}
	let { tryAutoDetectEthers: i } = await import("./ethersCompat-Df4a6QIZ.js").then((e) => e.n), o = await i(t);
	if (o) return o;
	throw new f(n.MISSING_CONFIG, "SiweConfig via configure(), opts.config, or auto-detection", "No config found");
}
var w = class {
	scheme;
	domain;
	address;
	statement;
	uri;
	version;
	chainId;
	nonce;
	issuedAt;
	expirationTime;
	notBefore;
	requestId;
	resources;
	warnings;
	constructor(e) {
		if (typeof e == "string") {
			let t = new _(e);
			this.warnings = t.warnings, this.scheme = t.scheme, this.domain = t.domain, this.address = t.address, this.statement = t.statement, this.uri = t.uri, this.version = t.version, this.nonce = t.nonce, this.issuedAt = t.issuedAt, this.expirationTime = t.expirationTime, this.notBefore = t.notBefore, this.requestId = t.requestId, this.chainId = t.chainId, this.resources = t.resources;
		} else {
			if (this.warnings = [], this.scheme = e?.scheme, this.domain = e.domain, this.address = e.address, this.statement = e?.statement, this.uri = e.uri, this.version = e.version, this.chainId = e.chainId, this.nonce = e.nonce, this.issuedAt = e?.issuedAt, this.expirationTime = e?.expirationTime, this.notBefore = e?.notBefore, this.requestId = e?.requestId, this.resources = e?.resources, typeof this.chainId == "string" && (this.chainId = b(this.chainId)), !this.domain) throw new f(n.INVALID_DOMAIN, "valid domain", String(this.domain));
			if (!this.address) throw new f(n.INVALID_ADDRESS, "valid EIP-55 address", String(this.address));
			if (y(this.address) === "unchecksummed" && (this.warnings.push(`address is not EIP-55 checksummed - ${this.address}`), this.address = x(this.address)), !this.uri) throw new f(n.INVALID_URI, "valid RFC 3986 URI", String(this.uri));
			if (!this.version) throw new f(n.INVALID_MESSAGE_VERSION, "1", String(this.version));
			if (this.chainId === void 0 || this.chainId === null) throw new f(n.UNABLE_TO_PARSE, "valid chain ID", String(this.chainId));
			if (!this.nonce) throw new f(n.INVALID_NONCE, "alphanumeric nonce >= 8 chars", String(this.nonce));
			if (!this.issuedAt) throw new f(n.UNABLE_TO_PARSE, "valid ISO 8601 issuedAt", String(this.issuedAt));
			let t = new _(this.prepareMessage());
			this.warnings.push(...t.warnings);
		}
	}
	toMessage() {
		let e = `${this.scheme ? `${this.scheme}://${this.domain}` : this.domain} wants you to sign in with your Ethereum account:`, t = `URI: ${this.uri}`, n = [e, this.address].join("\n"), r = [
			t,
			`Version: ${this.version}`,
			`Chain ID: ${this.chainId}`,
			`Nonce: ${this.nonce}`
		];
		if (this.issuedAt && r.push(`Issued At: ${this.issuedAt}`), this.expirationTime) {
			let e = `Expiration Time: ${this.expirationTime}`;
			r.push(e);
		}
		this.notBefore && r.push(`Not Before: ${this.notBefore}`), this.requestId !== void 0 && r.push(`Request ID: ${this.requestId}`), this.resources && r.push(["Resources:", ...this.resources.map((e) => `- ${e}`)].join("\n"));
		let i = r.join("\n");
		return this.statement === void 0 ? n += "\n\n" : n = [n, this.statement].join("\n\n") + "\n", [n, i].join("\n");
	}
	prepareMessage() {
		let e;
		switch (this.version) {
			case "1":
				e = this.toMessage();
				break;
			default:
				e = this.toMessage();
				break;
		}
		return e;
	}
	async verify(e, t = { suppressExceptions: !1 }) {
		let i = (e) => {
			if (t.suppressExceptions) return e;
			throw e.error;
		}, a = l(e, c);
		if (a.length > 0) return i({
			success: !1,
			data: this,
			error: new f(n.INVALID_PARAMS, `Valid keys: ${c.join(", ")}`, `Invalid keys: ${a.join(", ")}`)
		});
		let s = l(t, r);
		if (s.length > 0) return i({
			success: !1,
			data: this,
			error: new f(n.INVALID_PARAMS, `Valid keys: ${r.join(", ")}`, `Invalid keys: ${s.join(", ")}`)
		});
		let u;
		try {
			u = await C(t);
		} catch (e) {
			return i({
				success: !1,
				data: this,
				error: S(e, n.MISSING_CONFIG)
			});
		}
		let { signature: p, scheme: m, domain: h, nonce: g, uri: _, chainId: v, requestId: y, time: b } = e;
		if (!h) return i({
			success: !1,
			data: this,
			error: new f(n.MISSING_DOMAIN)
		});
		if (!g) return i({
			success: !1,
			data: this,
			error: new f(n.MISSING_NONCE)
		});
		if (t.strict) {
			if (_ === void 0) return i({
				success: !1,
				data: this,
				error: new f(n.MISSING_URI)
			});
			if (v == null) return i({
				success: !1,
				data: this,
				error: new f(n.MISSING_CHAIN_ID)
			});
		}
		if (m !== void 0 && m !== this.scheme) return i({
			success: !1,
			data: this,
			error: new f(n.SCHEME_MISMATCH, m, this.scheme)
		});
		if (h !== void 0 && h !== this.domain) return i({
			success: !1,
			data: this,
			error: new f(n.DOMAIN_MISMATCH, h, this.domain)
		});
		if (g !== void 0 && g !== this.nonce) return i({
			success: !1,
			data: this,
			error: new f(n.NONCE_MISMATCH, g, this.nonce)
		});
		if (_ !== void 0 && _ !== this.uri) return i({
			success: !1,
			data: this,
			error: new f(n.URI_MISMATCH, _, this.uri)
		});
		if (v != null && v !== this.chainId) return i({
			success: !1,
			data: this,
			error: new f(n.CHAIN_ID_MISMATCH, String(v), String(this.chainId))
		});
		if (y !== void 0 && y !== this.requestId) return i({
			success: !1,
			data: this,
			error: new f(n.REQUEST_ID_MISMATCH, y, this.requestId)
		});
		let x = new Date(b || /* @__PURE__ */ new Date());
		if (isNaN(x.getTime())) return i({
			success: !1,
			data: this,
			error: new f(n.INVALID_TIME_FORMAT, "valid ISO 8601 datetime", String(b))
		});
		if (this.expirationTime) {
			let e = new Date(this.expirationTime);
			if (x.getTime() >= e.getTime()) return i({
				success: !1,
				data: this,
				error: new f(n.EXPIRED_MESSAGE, `${x.toISOString()} < ${e.toISOString()}`, `${x.toISOString()} >= ${e.toISOString()}`)
			});
		}
		if (this.notBefore) {
			let e = new Date(this.notBefore);
			if (x.getTime() < e.getTime()) return i({
				success: !1,
				data: this,
				error: new f(n.NOT_YET_VALID_MESSAGE, `${x.toISOString()} >= ${e.toISOString()}`, `${x.toISOString()} < ${e.toISOString()}`)
			});
		}
		let w;
		try {
			w = this.prepareMessage();
		} catch (e) {
			return i({
				success: !1,
				data: this,
				error: S(e, n.MALFORMED_MESSAGE)
			});
		}
		let T;
		try {
			T = await u.verifyMessage(w, p);
		} catch {}
		if (T && T.toLowerCase() === this.address.toLowerCase()) return {
			success: !0,
			data: this
		};
		let E = o(this, p, u).then((e) => e ? {
			success: !0,
			data: this
		} : {
			success: !1,
			data: this,
			error: new f(n.INVALID_SIGNATURE, T, `Resolved address to be ${this.address}`)
		}).catch((e) => e instanceof d ? {
			success: !1,
			data: this,
			error: new f(n.INVALID_SIGNATURE_CHAIN_ID, String(this.chainId), e.message)
		} : {
			success: !1,
			data: this,
			error: S(e, n.INVALID_SIGNATURE)
		}), [D, O] = await Promise.all([E, t?.verificationFallback?.(e, t, this, E)?.then((e) => e)?.catch((e) => e)]);
		return O ? O.success ? O : i(O) : D.success ? D : i(D);
	}
};
//#endregion
export { d as ChainIdMismatchError, s as EIP1271_MAGICVALUE, m as EIP6492_MAGIC_SUFFIX, f as SiweError, n as SiweErrorType, w as SiweMessage, v as SiweParseError, r as VerifyOptsKeys, c as VerifyParamsKeys, o as checkContractWalletSignature, l as checkInvalidKeys, u as configure, t as createConfig, h as createEthersConfig, g as createViemConfig, i as generateNonce, a as getGlobalConfig, p as isEIP6492Signature, e as isValidISO8601Date };
