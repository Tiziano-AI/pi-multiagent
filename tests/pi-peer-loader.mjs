import { pathToFileURL } from "node:url";

const PACKAGE_ROOT = "/opt/homebrew/lib/node_modules/@mariozechner/pi-coding-agent";
const MAPPINGS = new Map([
	["@mariozechner/pi-coding-agent", `${PACKAGE_ROOT}/dist/index.js`],
	["@mariozechner/pi-ai", `${PACKAGE_ROOT}/node_modules/@mariozechner/pi-ai/dist/index.js`],
	["@mariozechner/pi-tui", `${PACKAGE_ROOT}/node_modules/@mariozechner/pi-tui/dist/index.js`],
	["typebox", `${PACKAGE_ROOT}/node_modules/typebox/build/index.mjs`],
]);

export async function resolve(specifier, context, nextResolve) {
	const mapped = MAPPINGS.get(specifier);
	if (mapped) return { url: pathToFileURL(mapped).href, shortCircuit: true };
	return nextResolve(specifier, context);
}
