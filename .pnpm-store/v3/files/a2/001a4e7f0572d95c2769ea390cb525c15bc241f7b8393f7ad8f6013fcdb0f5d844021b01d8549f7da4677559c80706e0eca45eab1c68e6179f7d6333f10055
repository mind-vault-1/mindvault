import { t as e } from "./rolldown-runtime-CAFD8bLK.js";
import { d as t, o as n, t as r, u as i } from "./utils-9-kzgPFC.js";
//#region lib/viemAdapter.ts
var a = /* @__PURE__ */ e({ createViemConfig: () => s }), o = [{
	inputs: [{
		name: "_message",
		type: "bytes32"
	}, {
		name: "_signature",
		type: "bytes"
	}],
	name: "isValidSignature",
	outputs: [{
		name: "",
		type: "bytes4"
	}],
	stateMutability: "view",
	type: "function"
}];
async function s(e) {
	let a;
	try {
		a = await import("viem");
	} catch {
		throw new i(t.MISSING_PROVIDER_LIBRARY, "viem installed (npm install viem)", "viem not found");
	}
	let s = {
		verifyMessage: async (e, t) => a.recoverMessageAddress({
			message: e,
			signature: t
		}),
		hashMessage: (e) => a.hashMessage(e),
		getAddress: (e) => a.getAddress(e)
	};
	if (e?.publicClient) {
		let t = e.publicClient;
		s.checkContractWalletSignature = async (e, i, s, c) => {
			let l = t.chain?.id;
			if (l == null && t.getChainId && (l = await t.getChainId()), l == null) throw new r("EIP-1271/EIP-6492 verification requires a viem publicClient with chain.id or getChainId().");
			if (l !== c) throw new r(`publicClient chainId ${l} does not match message chainId ${c}.`);
			if (t.verifyMessage) return t.verifyMessage({
				address: e,
				message: i,
				signature: s
			});
			let u = a.hashMessage(i);
			return await t.readContract({
				address: e,
				abi: o,
				functionName: "isValidSignature",
				args: [u, s]
			}) === n;
		};
	}
	return s;
}
//#endregion
export { a as n, s as t };
