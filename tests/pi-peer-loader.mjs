import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

function resolvePackageRoot() {
	const explicitRoot = process.env.PI_CODING_AGENT_PACKAGE_ROOT;
	if (explicitRoot && explicitRoot.length > 0) return explicitRoot;
	const globalNodeModules = execFileSync("npm", ["--silent", "root", "-g"], { encoding: "utf8" }).trim();
	return join(globalNodeModules, "@mariozechner/pi-coding-agent");
}

const PACKAGE_ROOT = resolvePackageRoot();
const MAPPINGS = new Map([
	["@mariozechner/pi-coding-agent", `${PACKAGE_ROOT}/dist/index.js`],
	["@mariozechner/pi-ai", `${PACKAGE_ROOT}/node_modules/@mariozechner/pi-ai/dist/index.js`],
	["@mariozechner/pi-tui", `${PACKAGE_ROOT}/node_modules/@mariozechner/pi-tui/dist/index.js`],
	["typebox", `${PACKAGE_ROOT}/node_modules/typebox/build/index.mjs`],
	["typebox/compile", `${PACKAGE_ROOT}/node_modules/typebox/build/compile/index.mjs`],
]);

export async function resolve(specifier, context, nextResolve) {
	const mapped = MAPPINGS.get(specifier);
	if (mapped) return { url: pathToFileURL(mapped).href, shortCircuit: true };
	return nextResolve(specifier, context);
}
