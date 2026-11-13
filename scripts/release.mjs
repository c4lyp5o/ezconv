import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const pkg = await Bun.file(`${root}package.json`).json();
const client = await Bun.file(`${root}client/package.json`).json();
const version = client.version;
const cache = `ezconv-v${version}`;
const changelog = await Bun.file(`${root}CHANGELOG.md`).text();
const args = new Set(process.argv.slice(2));

function assert(condition, message) {
	if (!condition) throw new Error(message);
}
function command(argv, capture = false) {
	const result = Bun.spawnSync(argv, {
		cwd: root,
		stdout: capture ? "pipe" : "inherit",
		stderr: "inherit",
	});
	assert(result.exitCode === 0, `Command failed: ${argv.join(" ")}`);
	return capture ? new TextDecoder().decode(result.stdout).trim() : "";
}

assert(/^\d+\.\d+\.\d+$/.test(version), "Use a stable semantic release version");
assert(pkg.version === version, "Root and frontend package versions must match");
assert(
	changelog.includes(`## [${version}] - `),
	"Changelog must contain the release version and date",
);
assert(
	(await Bun.file(`${root}client/public/sw.js`).text()).includes(`"${cache}"`),
	"Service worker cache must match the release version",
);
if (process.env.GITHUB_REF_TYPE === "tag")
	assert(process.env.GITHUB_REF_NAME === `v${version}`, "Git tag must match the package version");
console.log(`Release metadata valid: v${version}`);

if (args.has("--validate")) process.exit(0);
assert(
	!command(["git", "status", "--porcelain"], true),
	"Commit all source changes before preparing release artifacts",
);
if (!args.has("--package-only")) {
	for (const argv of [
		["bun", "install", "--frozen-lockfile"],
		["bun", "install", "--cwd", "client", "--frozen-lockfile"],
		["bun", "run", "lint"],
		["bun", "run", "test"],
		["bun", "run", "build"],
	])
		command(argv);
}

const dist = `${root}dist`;
assert(await Bun.file(`${dist}/index.html`).exists(), "Build the frontend before packaging");
assert(
	(await Bun.file(`${dist}/sw.js`).text()).includes(`"${cache}"`),
	"Built service worker is stale; rebuild first",
);
const entries = [];
for await (const path of new Bun.Glob("**/*").scan({ cwd: dist, onlyFiles: true }))
	entries.push(path);
entries.sort();
assert(
	entries.some((p) => p.endsWith(".wasm")),
	"Build is missing WebAssembly assets",
);
assert(
	entries.some((p) => p.startsWith("pdf/standard_fonts/")),
	"Build is missing local PDF fonts",
);
let hasVersion = false;
for (const path of entries.filter((p) => /^assets\/index-.*\.js$/.test(p))) {
	if ((await Bun.file(`${dist}/${path}`).text()).includes(version)) hasVersion = true;
}
assert(hasVersion, "Built app version is stale; rebuild first");

const require = createRequire(`${root}client/package.json`);
const JSZip = require("jszip");
const zip = new JSZip();
for (const path of entries)
	zip.file(path, await Bun.file(`${dist}/${path}`).arrayBuffer(), {
		date: new Date("2000-01-01T00:00:00Z"),
		unixPermissions: 0o644,
	});
const bytes = await zip.generateAsync({
	type: "uint8array",
	compression: "DEFLATE",
	compressionOptions: { level: 6 },
	platform: "UNIX",
});
const output = `${root}release/${version}`;
await mkdir(output, { recursive: true });
const filename = `ezconv-${version}-static.zip`;
const digest = new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
const start = changelog.indexOf(`## [${version}] - `);
const end = changelog.indexOf("\n## [", start + 1);
await Bun.write(`${output}/${filename}`, bytes);
await Bun.write(`${output}/SHA256SUMS`, `${digest}  ${filename}\n`);
await Bun.write(
	`${output}/RELEASE_NOTES.md`,
	`${changelog
		.slice(start, end < 0 ? undefined : end)
		.trim()
		.replaceAll(
			"(RELEASE.md)",
			`(https://github.com/c4lyp5o/ezconv/blob/v${version}/RELEASE.md)`,
		)}\n`,
);
await Bun.write(
	`${output}/manifest.json`,
	`${JSON.stringify({ version, commit: command(["git", "rev-parse", "HEAD"], true), files: entries.length, archive: filename, sha256: digest }, null, 2)}\n`,
);
console.log(`Prepared ${output}/${filename} (${bytes.byteLength} bytes, ${entries.length} files)`);
console.log("Nothing was tagged, pushed, published or deployed.");
