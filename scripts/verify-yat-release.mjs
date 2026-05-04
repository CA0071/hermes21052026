import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const docsManifestPath = join(root, "docs", "YAT_RELEASE_MANIFEST.txt");
const distManifestPath = join(root, "dist", "YAT_RELEASE_MANIFEST.txt");
const appPath = join(root, "dist", "mac-arm64", "Yat.app");
const appInfoPath = join(appPath, "Contents", "Info.plist");
const dmgPath = join(root, "dist", "yat-0.3.2.dmg");
const zipPath = join(root, "dist", "Yat-0.3.2-arm64-mac.zip");
const bundleMetadataPath = join(
  root,
  "resources",
  "hermes-agent-bundle",
  "hermes-bundle.json",
);
const packagedBundleRoot = join(
  appPath,
  "Contents",
  "Resources",
  "hermes-agent-bundle",
);
const packagedMetadataPath = join(packagedBundleRoot, "hermes-bundle.json");
const packagedHermesPyprojectPath = join(
  packagedBundleRoot,
  "hermes-agent",
  "pyproject.toml",
);
const skipMount = process.argv.includes("--skip-mount");

function sectionBetween(text, start, end) {
  const startIndex = text.indexOf(start);
  if (startIndex === -1) {
    throw new Error(`Manifest section not found: ${start}`);
  }
  const endIndex = end ? text.indexOf(end, startIndex) : -1;
  return text.slice(startIndex, endIndex === -1 ? undefined : endIndex);
}

function matchOne(text, pattern, label) {
  const match = text.match(pattern);
  if (!match) {
    throw new Error(`Could not read ${label}`);
  }
  return match[1];
}

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  }).trim();
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function sha256(path) {
  const hash = createHash("sha256");
  hash.update(readFileSync(path));
  return hash.digest("hex");
}

function requirePath(path, label) {
  assert(existsSync(path), `${label} missing at ${path}`);
}

function verifyPlistValue(key, expected) {
  const actual = run("plutil", [
    "-extract",
    key,
    "raw",
    "-o",
    "-",
    appInfoPath,
  ]);
  assert(actual === expected, `${key} expected ${expected}, got ${actual}`);
}

function verifyMountedDmg() {
  const mountPoint = mkdtempSync(join(tmpdir(), "yat-release-verify-"));
  let attached = false;

  try {
    run("hdiutil", [
      "attach",
      dmgPath,
      "-readonly",
      "-nobrowse",
      "-mountpoint",
      mountPoint,
    ]);
    attached = true;

    const mountedAppPath = join(mountPoint, "Yat.app");
    const mountedInfoPath = join(mountedAppPath, "Contents", "Info.plist");
    const mountedBundlePath = join(
      mountedAppPath,
      "Contents",
      "Resources",
      "hermes-agent-bundle",
    );

    requirePath(mountedAppPath, "Mounted Yat.app");
    requirePath(
      join(mountPoint, "Applications"),
      "Mounted Applications symlink",
    );
    requirePath(
      join(mountedBundlePath, "hermes-agent", "pyproject.toml"),
      "Mounted Hermes pyproject",
    );
    requirePath(
      join(mountedBundlePath, "hermes-bundle.json"),
      "Mounted Hermes metadata",
    );

    const displayName = run("plutil", [
      "-extract",
      "CFBundleDisplayName",
      "raw",
      "-o",
      "-",
      mountedInfoPath,
    ]);
    const bundleId = run("plutil", [
      "-extract",
      "CFBundleIdentifier",
      "raw",
      "-o",
      "-",
      mountedInfoPath,
    ]);

    assert(
      displayName === "Yat",
      `Mounted CFBundleDisplayName expected Yat, got ${displayName}`,
    );
    assert(
      bundleId === "dev.yat.desktop",
      `Mounted CFBundleIdentifier expected dev.yat.desktop, got ${bundleId}`,
    );
    run("codesign", [
      "--verify",
      "--deep",
      "--strict",
      "--verbose=2",
      mountedAppPath,
    ]);
  } finally {
    if (attached) {
      run("hdiutil", ["detach", mountPoint]);
    }
    rmSync(mountPoint, { recursive: true, force: true });
  }
}

const docsManifest = readFileSync(docsManifestPath, "utf8");
const distManifest = readFileSync(distManifestPath, "utf8");

assert(
  docsManifest === distManifest,
  "docs/YAT_RELEASE_MANIFEST.txt and dist/YAT_RELEASE_MANIFEST.txt differ",
);

const dmgSection = sectionBetween(
  docsManifest,
  "dist/yat-0.3.2.dmg",
  "dist/Yat-0.3.2-arm64-mac.zip",
);
const zipSection = sectionBetween(
  docsManifest,
  "dist/Yat-0.3.2-arm64-mac.zip",
  "Bundled Hermes Agent:",
);
const bundleSection = sectionBetween(
  docsManifest,
  "Bundled Hermes Agent:",
  "Verification already performed:",
);
const zipVerificationSection = sectionBetween(
  docsManifest,
  "ZIP verification:",
  undefined,
);

const expectedDmgSha = matchOne(
  dmgSection,
  /sha256: ([a-f0-9]{64})/,
  "DMG sha256",
);
const expectedZipSha = matchOne(
  zipSection,
  /sha256: ([a-f0-9]{64})/,
  "ZIP sha256",
);
const expectedMetadataSha = matchOne(
  bundleSection,
  /metadata sha256: ([a-f0-9]{64})/,
  "Hermes metadata sha256",
);
const expectedZipEntries = Number(
  matchOne(zipVerificationSection, /^ {2}entries: (\d+)$/m, "ZIP entry count"),
);
const expectedZipFileSize = Number(
  matchOne(
    zipVerificationSection,
    /^ {2}zip file size: (\d+) bytes$/m,
    "ZIP file size",
  ),
);
const expectedZipUncompressed = Number(
  matchOne(
    zipVerificationSection,
    /^ {2}uncompressed total: (\d+) bytes$/m,
    "ZIP uncompressed total",
  ),
);
const expectedZipCompressed = Number(
  matchOne(
    zipVerificationSection,
    /^ {2}compressed total: (\d+) bytes$/m,
    "ZIP compressed total",
  ),
);

for (const [path, label] of [
  [appPath, "Yat.app"],
  [appInfoPath, "Yat Info.plist"],
  [dmgPath, "DMG"],
  [zipPath, "ZIP"],
  [bundleMetadataPath, "Hermes metadata"],
  [packagedMetadataPath, "Packaged Hermes metadata"],
  [packagedHermesPyprojectPath, "Packaged Hermes pyproject"],
]) {
  requirePath(path, label);
}

assert(
  sha256(dmgPath) === expectedDmgSha,
  "DMG SHA-256 does not match manifest",
);
assert(
  sha256(zipPath) === expectedZipSha,
  "ZIP SHA-256 does not match manifest",
);
assert(
  sha256(bundleMetadataPath) === expectedMetadataSha,
  "Hermes metadata SHA-256 does not match manifest",
);
assert(
  sha256(packagedMetadataPath) === expectedMetadataSha,
  "Packaged Hermes metadata SHA-256 does not match manifest",
);

verifyPlistValue("CFBundleDisplayName", "Yat");
verifyPlistValue("CFBundleIdentifier", "dev.yat.desktop");
verifyPlistValue("CFBundleExecutable", "Yat");
verifyPlistValue("LSMinimumSystemVersion", "12.0");

const archInfo = run("lipo", [
  "-info",
  join(appPath, "Contents", "MacOS", "Yat"),
]);
assert(
  archInfo.includes("arm64"),
  `Expected arm64 app executable, got: ${archInfo}`,
);

run("codesign", ["--verify", "--deep", "--strict", "--verbose=2", appPath]);
run("hdiutil", ["verify", dmgPath]);

const zipInfo = run("zipinfo", ["-t", zipPath]);
const zipInfoMatch = zipInfo.match(
  /^(\d+) files, (\d+) bytes uncompressed, (\d+) bytes compressed:/,
);
assert(zipInfoMatch, `Could not parse zipinfo output: ${zipInfo}`);
assert(
  Number(zipInfoMatch[1]) === expectedZipEntries,
  "ZIP entry count does not match manifest",
);
assert(
  Number(zipInfoMatch[2]) === expectedZipUncompressed,
  "ZIP uncompressed total does not match manifest",
);
assert(
  Number(zipInfoMatch[3]) === expectedZipCompressed,
  "ZIP compressed total does not match manifest",
);
assert(
  statSync(zipPath).size === expectedZipFileSize,
  "ZIP file size does not match manifest",
);

const zipEntries = run("zipinfo", ["-1", zipPath]);
for (const requiredEntry of [
  "Yat.app/Contents/Info.plist",
  "Yat.app/Contents/Resources/hermes-agent-bundle/hermes-agent/pyproject.toml",
  "Yat.app/Contents/Resources/hermes-agent-bundle/hermes-bundle.json",
  "Yat.app/Contents/_CodeSignature/CodeResources",
]) {
  assert(
    zipEntries.split("\n").includes(requiredEntry),
    `ZIP required entry missing: ${requiredEntry}`,
  );
}

if (skipMount) {
  console.warn("Mounted DMG verification skipped because --skip-mount was set");
} else {
  verifyMountedDmg();
}

console.log("Yat release verification passed");
console.log(`DMG SHA-256: ${expectedDmgSha}`);
console.log(`ZIP SHA-256: ${expectedZipSha}`);
console.log(`Hermes metadata SHA-256: ${expectedMetadataSha}`);
