import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const docsManifestPath = join(root, "docs", "YAT_RELEASE_MANIFEST.txt");
const distManifestPath = join(root, "dist", "YAT_RELEASE_MANIFEST.txt");
const appPath = join(root, "dist", "mac-arm64", "Yat.app");
const dmgPath = join(root, "dist", "yat-0.3.2.dmg");
const zipPath = join(root, "dist", "Yat-0.3.2-arm64-mac.zip");
const bundleRootPath = join(root, "resources", "hermes-agent-bundle");
const bundleMetadataPath = join(bundleRootPath, "hermes-bundle.json");

function run(command, args) {
  return execFileSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function sha256(path) {
  const hash = createHash("sha256");
  hash.update(readFileSync(path));
  return hash.digest("hex");
}

function duSize(path) {
  return run("du", ["-sh", path]).split(/\s+/)[0];
}

function parseZipInfo(path) {
  const output = run("zipinfo", ["-t", path]);
  const match = output.match(
    /^(\d+) files, (\d+) bytes uncompressed, (\d+) bytes compressed:\s+([0-9.]+%)/,
  );
  if (!match) {
    throw new Error(`Could not parse zipinfo output: ${output}`);
  }
  return {
    entries: Number(match[1]),
    uncompressed: Number(match[2]),
    compressed: Number(match[3]),
    ratio: match[4],
  };
}

function statSize(path) {
  return Number(run("stat", ["-f", "%z", path]));
}

function replaceOne(text, pattern, replacement, label) {
  if (!pattern.test(text)) {
    throw new Error(`Could not update manifest field: ${label}`);
  }
  return text.replace(pattern, replacement);
}

const metadata = JSON.parse(readFileSync(bundleMetadataPath, "utf8"));
const zipInfo = parseZipInfo(zipPath);

let manifest = readFileSync(docsManifestPath, "utf8");

manifest = replaceOne(
  manifest,
  /dist\/mac-arm64\/Yat\.app\n {4}size: .+/,
  `dist/mac-arm64/Yat.app\n    size: ${duSize(appPath)}`,
  "app size",
);
manifest = replaceOne(
  manifest,
  /dist\/yat-0\.3\.2\.dmg\n {4}size: .+\n {4}sha256: [a-f0-9]{64}/,
  `dist/yat-0.3.2.dmg\n    size: ${duSize(dmgPath)}\n    sha256: ${sha256(dmgPath)}`,
  "DMG size and SHA-256",
);
manifest = replaceOne(
  manifest,
  /dist\/Yat-0\.3\.2-arm64-mac\.zip\n {4}size: .+\n {4}sha256: [a-f0-9]{64}/,
  `dist/Yat-0.3.2-arm64-mac.zip\n    size: ${duSize(zipPath)}\n    sha256: ${sha256(zipPath)}`,
  "ZIP size and SHA-256",
);
manifest = replaceOne(
  manifest,
  / {2}size: .+\n {2}source: .+\n {2}commit: .+\n {2}short commit: .+\n {2}ref: .+\n {2}metadata sha256: [a-f0-9]{64}/,
  [
    `  size: ${duSize(bundleRootPath)}`,
    `  source: ${metadata.source}`,
    `  commit: ${metadata.commit}`,
    `  short commit: ${metadata.shortCommit}`,
    `  ref: ${metadata.ref}`,
    `  metadata sha256: ${sha256(bundleMetadataPath)}`,
  ].join("\n"),
  "Hermes bundle metadata",
);
manifest = replaceOne(
  manifest,
  / {2}entries: \d+\n {2}zip file size: \d+ bytes\n {2}uncompressed total: \d+ bytes\n {2}compressed total: \d+ bytes\n {2}compression ratio: [0-9.]+%/,
  [
    `  entries: ${zipInfo.entries}`,
    `  zip file size: ${statSize(zipPath)} bytes`,
    `  uncompressed total: ${zipInfo.uncompressed} bytes`,
    `  compressed total: ${zipInfo.compressed} bytes`,
    `  compression ratio: ${zipInfo.ratio}`,
  ].join("\n"),
  "ZIP statistics",
);

writeFileSync(docsManifestPath, manifest);
writeFileSync(distManifestPath, manifest);

console.log(`Updated ${docsManifestPath}`);
console.log(`Updated ${distManifestPath}`);
