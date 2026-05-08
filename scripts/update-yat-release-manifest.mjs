import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  readPackageReleasePaths,
  releaseVerificationCommands,
} from "./yat-release-paths.mjs";

const root = resolve(new URL("..", import.meta.url).pathname);
const docsManifestPath = join(root, "docs", "YAT_RELEASE_MANIFEST.txt");
const distManifestPath = join(root, "dist", "YAT_RELEASE_MANIFEST.txt");
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

function localDateStamp(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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

function replaceAllRequired(text, pattern, replacement, label) {
  const probe = new RegExp(pattern.source, pattern.flags);
  if (!probe.test(text)) {
    throw new Error(`Could not update manifest field: ${label}`);
  }
  return text.replace(pattern, replacement);
}

function requireValue(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Manifest ${label} value is required`);
  }
  return value;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeReleasePaths(manifest, paths, repositories) {
  let nextManifest = manifest;
  nextManifest = replaceOne(
    nextManifest,
    /^[^\n]+ macOS release manifest$/m,
    `${paths.productName} ${paths.version} macOS release manifest`,
    "manifest title",
  );
  nextManifest = replaceOne(
    nextManifest,
    /^Generated: \d{4}-\d{2}-\d{2}$/m,
    `Generated: ${requireValue(repositories.generatedDate, "generated date")}`,
    "generated date",
  );
  nextManifest = replaceOne(
    nextManifest,
    /Source repo:\n {2}.+/,
    `Source repo:\n  ${requireValue(repositories.sourceRepo, "source repo")}`,
    "source repo",
  );
  nextManifest = replaceOne(
    nextManifest,
    /Local repo:\n {2}.+/,
    `Local repo:\n  ${requireValue(repositories.localRepo, "local repo")}`,
    "local repo",
  );
  nextManifest = replaceOne(
    nextManifest,
    / {2}Product name: .+/,
    `  Product name: ${paths.productName}`,
    "product name",
  );
  nextManifest = replaceOne(
    nextManifest,
    / {2}Bundle identifier: .+/,
    `  Bundle identifier: ${paths.appId}`,
    "bundle identifier",
  );
  nextManifest = replaceOne(
    nextManifest,
    / {2}packaged path: .+\/Contents\/Resources\/hermes-agent-bundle/,
    `  packaged path: ${paths.appFileName}/Contents/Resources/hermes-agent-bundle`,
    "packaged Hermes path",
  );

  nextManifest = replaceAllRequired(
    nextManifest,
    /dist\/mac-[^/\n]+\/[^\n]+\.app/g,
    paths.appRelativePath,
    "app path references",
  );
  nextManifest = replaceAllRequired(
    nextManifest,
    /dist\/[^\s]+\.dmg/g,
    paths.dmgRelativePath,
    "DMG path references",
  );
  nextManifest = replaceAllRequired(
    nextManifest,
    /dist\/[^\n]+\.zip/g,
    paths.zipRelativePath,
    "ZIP path references",
  );
  nextManifest = replaceAllRequired(
    nextManifest,
    /\/Volumes\/YatVerify\/[^\n]+\.app/g,
    `/Volumes/YatVerify/${paths.appFileName}`,
    "mounted app path references",
  );
  nextManifest = replaceOne(
    nextManifest,
    /Verification already performed:\n(?: {2}.+\n)+\nMounted DMG verification:/,
    [
      "Verification already performed:",
      ...releaseVerificationCommands(paths).map((command) => `  ${command}`),
      "",
      "Mounted DMG verification:",
    ].join("\n"),
    "verification commands",
  );
  nextManifest = replaceOne(
    nextManifest,
    /^ {2}mountpoint contained [^/\n]+\.app and Applications symlink$/m,
    `  mountpoint contained ${paths.appFileName} and Applications symlink`,
    "mounted app file name",
  );
  nextManifest = replaceOne(
    nextManifest,
    /^ {2}mounted app CFBundleDisplayName: .+$/m,
    `  mounted app CFBundleDisplayName: ${paths.productName}`,
    "mounted app display name",
  );
  nextManifest = replaceOne(
    nextManifest,
    /^ {2}mounted app CFBundleIdentifier: .+$/m,
    `  mounted app CFBundleIdentifier: ${paths.appId}`,
    "mounted app bundle identifier",
  );
  nextManifest = replaceOne(
    nextManifest,
    /^ {2}mounted app size: .+$/m,
    `  mounted app size: ${requireValue(repositories.mountedAppSize, "mounted app size")}`,
    "mounted app size",
  );
  nextManifest = replaceOne(
    nextManifest,
    /^ {2}mounted Hermes bundle size: .+$/m,
    `  mounted Hermes bundle size: ${requireValue(repositories.mountedBundleSize, "mounted Hermes bundle size")}`,
    "mounted Hermes bundle size",
  );
  nextManifest = replaceOne(
    nextManifest,
    /^ {2}mounted app codesign verification: .+$/m,
    "  mounted app codesign verification: valid on disk, satisfies designated requirement",
    "mounted app codesign verification",
  );
  nextManifest = replaceOne(
    nextManifest,
    /^ {4}[^/\n]+\.app\/Contents\/Info\.plist$/m,
    `    ${paths.appFileName}/Contents/Info.plist`,
    "ZIP required Info.plist entry",
  );
  nextManifest = replaceOne(
    nextManifest,
    /^ {4}[^/\n]+\.app\/Contents\/Resources\/hermes-agent-bundle\/hermes-agent\/pyproject\.toml$/m,
    `    ${paths.appFileName}/Contents/Resources/hermes-agent-bundle/hermes-agent/pyproject.toml`,
    "ZIP required Hermes pyproject entry",
  );
  nextManifest = replaceOne(
    nextManifest,
    /^ {4}[^/\n]+\.app\/Contents\/Resources\/hermes-agent-bundle\/hermes-bundle\.json$/m,
    `    ${paths.appFileName}/Contents/Resources/hermes-agent-bundle/hermes-bundle.json`,
    "ZIP required Hermes metadata entry",
  );
  nextManifest = replaceOne(
    nextManifest,
    /^ {4}[^/\n]+\.app\/Contents\/Resources\/uv\/macos-arm64\/uv$/m,
    `    ${paths.appFileName}/Contents/Resources/uv/macos-arm64/uv`,
    "ZIP required bundled uv entry",
  );
  nextManifest = replaceOne(
    nextManifest,
    /^ {4}[^/\n]+\.app\/Contents\/Resources\/python\/macos-arm64\/cpython-3\.11\.15-macos-aarch64-none\/bin\/python3\.11$/m,
    `    ${paths.appFileName}/Contents/Resources/python/macos-arm64/cpython-3.11.15-macos-aarch64-none/bin/python3.11`,
    "ZIP required bundled Python entry",
  );
  nextManifest = replaceOne(
    nextManifest,
    /^ {4}[^/\n]+\.app\/Contents\/_CodeSignature\/CodeResources$/m,
    `    ${paths.appFileName}/Contents/_CodeSignature/CodeResources`,
    "ZIP required CodeResources entry",
  );
  return nextManifest;
}

export function refreshManifestText(
  manifest,
  values,
  paths = readPackageReleasePaths(root),
) {
  let nextManifest = normalizeReleasePaths(manifest, paths, {
    generatedDate: values.generatedDate,
    mountedAppSize: values.appSize,
    mountedBundleSize: values.bundleSize,
    sourceRepo: values.sourceRepo,
    localRepo: values.localRepo,
  });
  nextManifest = replaceOne(
    nextManifest,
    new RegExp(`${escapeRegExp(paths.appRelativePath)}\\n {4}size: .+`),
    `${paths.appRelativePath}\n    size: ${values.appSize}`,
    "app size",
  );
  nextManifest = replaceOne(
    nextManifest,
    new RegExp(
      `${escapeRegExp(paths.dmgRelativePath)}\\n {4}size: .+\\n {4}sha256: [a-f0-9]{64}`,
    ),
    `${paths.dmgRelativePath}\n    size: ${values.dmgSize}\n    sha256: ${values.dmgSha}`,
    "DMG size and SHA-256",
  );
  nextManifest = replaceOne(
    nextManifest,
    new RegExp(
      `${escapeRegExp(paths.zipRelativePath)}\\n {4}size: .+\\n {4}sha256: [a-f0-9]{64}`,
    ),
    `${paths.zipRelativePath}\n    size: ${values.zipSize}\n    sha256: ${values.zipSha}`,
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
  const releasePaths = readPackageReleasePaths(root);
  const appPath = join(root, releasePaths.appRelativePath);
  const dmgPath = join(root, releasePaths.dmgRelativePath);
  const zipPath = join(root, releasePaths.zipRelativePath);
  const metadata = JSON.parse(readFileSync(bundleMetadataPath, "utf8"));
  const manifest = refreshManifestText(
    readFileSync(docsManifestPath, "utf8"),
    {
      appSize: duSize(appPath),
      dmgSize: duSize(dmgPath),
      dmgSha: sha256(dmgPath),
      zipSize: duSize(zipPath),
      zipSha: sha256(zipPath),
      bundleSize: duSize(bundleRootPath),
      metadata,
      metadataSha: sha256(bundleMetadataPath),
      generatedDate: localDateStamp(),
      sourceRepo: run("git", ["config", "--get", "remote.origin.url"]),
      localRepo: root,
      zipInfo: parseZipInfo(zipPath),
      zipFileSize: statSize(zipPath),
    },
    releasePaths,
  );

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
