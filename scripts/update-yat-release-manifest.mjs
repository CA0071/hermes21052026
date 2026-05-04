import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

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

export function parseZipInfoOutput(output) {
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

function parseZipInfo(path) {
  return parseZipInfoOutput(run("zipinfo", ["-t", path]));
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

export function refreshManifestText(manifest, values) {
  let nextManifest = manifest;
  nextManifest = replaceOne(
    nextManifest,
    /dist\/mac-arm64\/Yat\.app\n {4}size: .+/,
    `dist/mac-arm64/Yat.app\n    size: ${values.appSize}`,
    "app size",
  );
  nextManifest = replaceOne(
    nextManifest,
    /dist\/yat-0\.3\.2\.dmg\n {4}size: .+\n {4}sha256: [a-f0-9]{64}/,
    `dist/yat-0.3.2.dmg\n    size: ${values.dmgSize}\n    sha256: ${values.dmgSha}`,
    "DMG size and SHA-256",
  );
  nextManifest = replaceOne(
    nextManifest,
    /dist\/Yat-0\.3\.2-arm64-mac\.zip\n {4}size: .+\n {4}sha256: [a-f0-9]{64}/,
    `dist/Yat-0.3.2-arm64-mac.zip\n    size: ${values.zipSize}\n    sha256: ${values.zipSha}`,
    "ZIP size and SHA-256",
  );
  nextManifest = replaceOne(
    nextManifest,
    / {2}size: .+\n {2}source: .+\n {2}commit: .+\n {2}short commit: .+\n {2}ref: .+\n {2}metadata sha256: [a-f0-9]{64}/,
    [
      `  size: ${values.bundleSize}`,
      `  source: ${values.metadata.source}`,
      `  commit: ${values.metadata.commit}`,
      `  short commit: ${values.metadata.shortCommit}`,
      `  ref: ${values.metadata.ref}`,
      `  metadata sha256: ${values.metadataSha}`,
    ].join("\n"),
    "Hermes bundle metadata",
  );
  nextManifest = replaceOne(
    nextManifest,
    / {2}entries: \d+\n {2}zip file size: \d+ bytes\n {2}uncompressed total: \d+ bytes\n {2}compressed total: \d+ bytes\n {2}compression ratio: [0-9.]+%/,
    [
      `  entries: ${values.zipInfo.entries}`,
      `  zip file size: ${values.zipFileSize} bytes`,
      `  uncompressed total: ${values.zipInfo.uncompressed} bytes`,
      `  compressed total: ${values.zipInfo.compressed} bytes`,
      `  compression ratio: ${values.zipInfo.ratio}`,
    ].join("\n"),
    "ZIP statistics",
  );
  return nextManifest;
}

function main() {
  const metadata = JSON.parse(readFileSync(bundleMetadataPath, "utf8"));
  const manifest = refreshManifestText(readFileSync(docsManifestPath, "utf8"), {
    appSize: duSize(appPath),
    dmgSize: duSize(dmgPath),
    dmgSha: sha256(dmgPath),
    zipSize: duSize(zipPath),
    zipSha: sha256(zipPath),
    bundleSize: duSize(bundleRootPath),
    metadata,
    metadataSha: sha256(bundleMetadataPath),
    zipInfo: parseZipInfo(zipPath),
    zipFileSize: statSize(zipPath),
  });

  writeFileSync(docsManifestPath, manifest);
  writeFileSync(distManifestPath, manifest);

  console.log(`Updated ${docsManifestPath}`);
  console.log(`Updated ${distManifestPath}`);
}

const isCli =
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isCli) {
  main();
}
