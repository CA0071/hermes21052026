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
import { pathToFileURL } from "node:url";
import {
  readPackageReleasePaths,
  releaseVerificationCommands,
} from "./yat-release-paths.mjs";

const root = resolve(new URL("..", import.meta.url).pathname);
const docsManifestPath = join(root, "docs", "YAT_RELEASE_MANIFEST.txt");
const distManifestPath = join(root, "dist", "YAT_RELEASE_MANIFEST.txt");
const bundleRootPath = join(root, "resources", "hermes-agent-bundle");
const bundleMetadataPath = join(
  root,
  "resources",
  "hermes-agent-bundle",
  "hermes-bundle.json",
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
  try {
    return execFileSync(command, args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      ...options,
    }).trim();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const stderr =
      typeof error === "object" &&
      error !== null &&
      "stderr" in error &&
      Buffer.isBuffer(error.stderr)
        ? error.stderr.toString("utf8").trim()
        : "";
    const detail = stderr ? `${message}\n${stderr}` : message;
    throw new Error(`${command} ${args.join(" ")} failed\n${detail}`);
  }
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

function duSize(path) {
  return run("du", ["-sh", path]).split(/\s+/)[0];
}

function localDateStamp(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function requirePath(path, label) {
  assert(existsSync(path), `${label} missing at ${path}`);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatMetadataValue(value) {
  if (Array.isArray(value)) {
    return value.join(", ");
  }
  return String(value);
}

const hermesMetadataFields = [
  "name",
  "source",
  "commit",
  "shortCommit",
  "ref",
  "bundledAt",
];

export function assertHermesMetadataMatches(actual, expected, label) {
  for (const field of hermesMetadataFields) {
    assert(
      actual?.[field] === expected?.[field],
      `${label} ${field} expected ${formatMetadataValue(expected?.[field])}, got ${formatMetadataValue(actual?.[field])}`,
    );
  }

  assert(
    Array.isArray(actual?.excludes),
    `${label} excludes expected an array, got ${formatMetadataValue(actual?.excludes)}`,
  );
  assert(
    Array.isArray(expected?.excludes),
    `${label} expected excludes must be an array`,
  );
  assert(
    actual.excludes.join("\n") === expected.excludes.join("\n"),
    `${label} excludes expected ${expected.excludes.join(", ")}, got ${actual.excludes.join(", ")}`,
  );
}

function verifyPlistValue(appInfoPath, key, expected) {
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

function verifyMountedDmg({ dmgPath, releasePaths }) {
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

    const mountedAppPath = join(mountPoint, releasePaths.appFileName);
    const mountedInfoPath = join(mountedAppPath, "Contents", "Info.plist");
    const mountedBundlePath = join(
      mountedAppPath,
      "Contents",
      "Resources",
      "hermes-agent-bundle",
    );

    requirePath(mountedAppPath, `Mounted ${releasePaths.appFileName}`);
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
    assert(
      duSize(mountedAppPath) === releasePaths.expectedMountedAppSize,
      `Mounted app size expected ${releasePaths.expectedMountedAppSize}, got ${duSize(mountedAppPath)}`,
    );
    assert(
      duSize(mountedBundlePath) === releasePaths.expectedMountedBundleSize,
      `Mounted Hermes bundle size expected ${releasePaths.expectedMountedBundleSize}, got ${duSize(mountedBundlePath)}`,
    );
    assertHermesMetadataMatches(
      JSON.parse(
        readFileSync(join(mountedBundlePath, "hermes-bundle.json"), "utf8"),
      ),
      releasePaths.bundleMetadata,
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
      displayName === releasePaths.productName,
      `Mounted CFBundleDisplayName expected ${releasePaths.productName}, got ${displayName}`,
    );
    assert(
      bundleId === releasePaths.appId,
      `Mounted CFBundleIdentifier expected ${releasePaths.appId}, got ${bundleId}`,
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

export function parseReleaseManifest(
  manifest,
  paths = readPackageReleasePaths(root),
) {
  const sourceRepoSection = sectionBetween(
    manifest,
    "Source repo:",
    "Local repo:",
  );
  const localRepoSection = sectionBetween(
    manifest,
    "Local repo:",
    "Application identity:",
  );
  const dmgSection = sectionBetween(
    manifest,
    paths.dmgRelativePath,
    paths.zipRelativePath,
  );
  const zipSection = sectionBetween(
    manifest,
    paths.zipRelativePath,
    "Bundled Hermes Agent:",
  );
  const identitySection = sectionBetween(
    manifest,
    "Application identity:",
    "Artifacts:",
  );
  const artifactsSection = sectionBetween(
    manifest,
    "Artifacts:",
    "Bundled Hermes Agent:",
  );
  const bundleSection = sectionBetween(
    manifest,
    "Bundled Hermes Agent:",
    "Verification already performed:",
  );
  const performedSection = sectionBetween(
    manifest,
    "Verification already performed:",
    "Mounted DMG verification:",
  );
  const mountedDmgSection = sectionBetween(
    manifest,
    "Mounted DMG verification:",
    "ZIP verification:",
  );
  const zipVerificationSection = sectionBetween(
    manifest,
    "ZIP verification:",
    undefined,
  );

  return {
    titleProductName: matchOne(
      manifest,
      /^(.+) [^\s]+ macOS release manifest$/m,
      "manifest title product name",
    ),
    titleVersion: matchOne(
      manifest,
      /^.+ ([^\s]+) macOS release manifest$/m,
      "manifest title version",
    ),
    generatedDate: matchOne(
      manifest,
      /^Generated: (\d{4}-\d{2}-\d{2})$/m,
      "manifest generated date",
    ),
    sourceRepo: matchOne(
      sourceRepoSection,
      /^ {2}(.+)$/m,
      "manifest source repo",
    ),
    localRepo: matchOne(localRepoSection, /^ {2}(.+)$/m, "manifest local repo"),
    productName: matchOne(
      identitySection,
      /^ {2}Product name: (.+)$/m,
      "manifest product name",
    ),
    bundleIdentifier: matchOne(
      identitySection,
      /^ {2}Bundle identifier: (.+)$/m,
      "manifest bundle identifier",
    ),
    appRelativePath: matchOne(
      artifactsSection,
      /^ {2}(dist\/mac-[^\n]+\/[^\n]+\.app)$/m,
      "manifest app path",
    ),
    appSize: matchOne(
      artifactsSection,
      new RegExp(
        `^ {2}${escapeRegExp(paths.appRelativePath)}\\n {4}size: (.+)$`,
        "m",
      ),
      "manifest app size",
    ),
    dmgSize: matchOne(dmgSection, /^ {4}size: (.+)$/m, "manifest DMG size"),
    zipSize: matchOne(zipSection, /^ {4}size: (.+)$/m, "manifest ZIP size"),
    bundlePath: matchOne(
      bundleSection,
      /^ {2}bundle path: (.+)$/m,
      "Hermes bundle path",
    ),
    packagedBundlePath: matchOne(
      bundleSection,
      /^ {2}packaged path: (.+)$/m,
      "packaged Hermes bundle path",
    ),
    bundleSource: matchOne(
      bundleSection,
      /^ {2}source: (.+)$/m,
      "Hermes source",
    ),
    bundleCommit: matchOne(
      bundleSection,
      /^ {2}commit: (.+)$/m,
      "Hermes commit",
    ),
    bundleShortCommit: matchOne(
      bundleSection,
      /^ {2}short commit: (.+)$/m,
      "Hermes short commit",
    ),
    bundleRef: matchOne(bundleSection, /^ {2}ref: (.+)$/m, "Hermes ref"),
    bundleSize: matchOne(
      bundleSection,
      /^ {2}size: (.+)$/m,
      "Hermes bundle size",
    ),
    verificationCommands: [...performedSection.matchAll(/^ {2}(.+)$/gm)].map(
      (match) => match[1],
    ),
    mountedAppFileName: matchOne(
      mountedDmgSection,
      /^ {2}mountpoint contained ([^/\n]+\.app) and Applications symlink$/m,
      "mounted app file name",
    ),
    mountedDisplayName: matchOne(
      mountedDmgSection,
      /^ {2}mounted app CFBundleDisplayName: (.+)$/m,
      "mounted app display name",
    ),
    mountedBundleIdentifier: matchOne(
      mountedDmgSection,
      /^ {2}mounted app CFBundleIdentifier: (.+)$/m,
      "mounted app bundle identifier",
    ),
    mountedAppSize: matchOne(
      mountedDmgSection,
      /^ {2}mounted app size: (.+)$/m,
      "mounted app size",
    ),
    mountedBundleSize: matchOne(
      mountedDmgSection,
      /^ {2}mounted Hermes bundle size: (.+)$/m,
      "mounted Hermes bundle size",
    ),
    mountedCodesignVerification: matchOne(
      mountedDmgSection,
      /^ {2}mounted app codesign verification: (.+)$/m,
      "mounted app codesign verification",
    ),
    dmgSha: matchOne(dmgSection, /sha256: ([a-f0-9]{64})/, "DMG sha256"),
    zipSha: matchOne(zipSection, /sha256: ([a-f0-9]{64})/, "ZIP sha256"),
    metadataSha: matchOne(
      bundleSection,
      /metadata sha256: ([a-f0-9]{64})/,
      "Hermes metadata sha256",
    ),
    zipUnzipResult: matchOne(
      zipVerificationSection,
      /^ {2}unzip test result: (.+)$/m,
      "ZIP unzip test result",
    ),
    zipEntries: Number(
      matchOne(
        zipVerificationSection,
        /^ {2}entries: (\d+)$/m,
        "ZIP entry count",
      ),
    ),
    zipFileSize: Number(
      matchOne(
        zipVerificationSection,
        /^ {2}zip file size: (\d+) bytes$/m,
        "ZIP file size",
      ),
    ),
    zipUncompressed: Number(
      matchOne(
        zipVerificationSection,
        /^ {2}uncompressed total: (\d+) bytes$/m,
        "ZIP uncompressed total",
      ),
    ),
    zipCompressed: Number(
      matchOne(
        zipVerificationSection,
        /^ {2}compressed total: (\d+) bytes$/m,
        "ZIP compressed total",
      ),
    ),
    zipCompressionRatio: matchOne(
      zipVerificationSection,
      /^ {2}compression ratio: ([0-9.]+%)$/m,
      "ZIP compression ratio",
    ),
    zipRequiredEntries: matchOne(
      zipVerificationSection,
      /^ {2}required entries found:\n((?: {4}.+(?:\n|$))+)/m,
      "ZIP required entries",
    )
      .split("\n")
      .map((entry) => entry.trim())
      .filter(Boolean),
  };
}

function printFailure(error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error("Yat Studio release verification failed");
  console.error(message);

  if (message.includes("hdiutil attach")) {
    console.error(
      [
        "",
        "The failure happened while mounting the DMG.",
        "If hdiutil/diskutil report DiskManagement or DiskArbitration as unavailable,",
        "run the non-mounting checks with:",
        "  npm run verify:release:no-mount",
      ].join("\n"),
    );
  }
}

function main() {
  const releasePaths = readPackageReleasePaths(root);
  const appPath = join(root, releasePaths.appRelativePath);
  const appInfoPath = join(appPath, "Contents", "Info.plist");
  const dmgPath = join(root, releasePaths.dmgRelativePath);
  const zipPath = join(root, releasePaths.zipRelativePath);
  const bundleMetadata = JSON.parse(readFileSync(bundleMetadataPath, "utf8"));
  const releaseConfig = {
    ...releasePaths,
    bundleMetadata,
  };
  const packagedBundleRoot = join(
    appPath,
    "Contents",
    "Resources",
    "hermes-agent-bundle",
  );
  const packagedMetadataPath = join(packagedBundleRoot, "hermes-bundle.json");
  const packagedUvPath = join(appPath, "Contents", "Resources", "uv", "macos-arm64", "uv");
  const docsManifest = readFileSync(docsManifestPath, "utf8");
  const distManifest = readFileSync(distManifestPath, "utf8");
  const today = localDateStamp();
  const sourceRepo = run("git", ["config", "--get", "remote.origin.url"]);

  assert(
    docsManifest === distManifest,
    "docs/YAT_RELEASE_MANIFEST.txt and dist/YAT_RELEASE_MANIFEST.txt differ",
  );

  const expected = parseReleaseManifest(docsManifest, releasePaths);
  assert(
    expected.titleProductName === releasePaths.productName,
    `Manifest title product name expected ${releasePaths.productName}, got ${expected.titleProductName}`,
  );
  assert(
    expected.titleVersion === releasePaths.version,
    `Manifest title version expected ${releasePaths.version}, got ${expected.titleVersion}`,
  );
  assert(
    expected.generatedDate === today,
    `Manifest generated date expected ${today}, got ${expected.generatedDate}`,
  );
  assert(
    expected.sourceRepo === sourceRepo,
    `Manifest source repo expected ${sourceRepo}, got ${expected.sourceRepo}`,
  );
  assert(
    expected.localRepo === root,
    `Manifest local repo expected ${root}, got ${expected.localRepo}`,
  );
  assert(
    expected.productName === releasePaths.productName,
    `Manifest product name expected ${releasePaths.productName}, got ${expected.productName}`,
  );
  assert(
    expected.bundleIdentifier === releasePaths.appId,
    `Manifest bundle identifier expected ${releasePaths.appId}, got ${expected.bundleIdentifier}`,
  );
  assert(
    expected.appRelativePath === releasePaths.appRelativePath,
    `Manifest app path expected ${releasePaths.appRelativePath}, got ${expected.appRelativePath}`,
  );
  assert(
    expected.bundlePath === "resources/hermes-agent-bundle",
    `Manifest Hermes bundle path expected resources/hermes-agent-bundle, got ${expected.bundlePath}`,
  );
  assert(
    expected.packagedBundlePath ===
      `${releasePaths.appFileName}/Contents/Resources/hermes-agent-bundle`,
    `Manifest packaged Hermes bundle path expected ${releasePaths.appFileName}/Contents/Resources/hermes-agent-bundle, got ${expected.packagedBundlePath}`,
  );
  requirePath(join(root, "resources", "uv", "macos-arm64", "uv"), "Bundled uv binary");
  assert(
    run(join(root, "resources", "uv", "macos-arm64", "uv"), ["--version"]).startsWith("uv "),
    "Bundled uv binary did not report a uv version",
  );
  assert(
    run("file", [join(root, "resources", "uv", "macos-arm64", "uv")]).includes("arm64"),
    "Bundled uv binary is expected to be macOS arm64",
  );
  assert(
    expected.bundleSource === bundleMetadata.source,
    `Manifest Hermes source expected ${bundleMetadata.source}, got ${expected.bundleSource}`,
  );
  assert(
    expected.bundleCommit === bundleMetadata.commit,
    `Manifest Hermes commit expected ${bundleMetadata.commit}, got ${expected.bundleCommit}`,
  );
  assert(
    expected.bundleShortCommit === bundleMetadata.shortCommit,
    `Manifest Hermes short commit expected ${bundleMetadata.shortCommit}, got ${expected.bundleShortCommit}`,
  );
  assert(
    expected.bundleRef === bundleMetadata.ref,
    `Manifest Hermes ref expected ${bundleMetadata.ref}, got ${expected.bundleRef}`,
  );
  assert(
    expected.mountedAppFileName === releasePaths.appFileName,
    `Manifest mounted app file name expected ${releasePaths.appFileName}, got ${expected.mountedAppFileName}`,
  );
  assert(
    expected.mountedDisplayName === releasePaths.productName,
    `Manifest mounted app display name expected ${releasePaths.productName}, got ${expected.mountedDisplayName}`,
  );
  assert(
    expected.mountedBundleIdentifier === releasePaths.appId,
    `Manifest mounted app bundle identifier expected ${releasePaths.appId}, got ${expected.mountedBundleIdentifier}`,
  );
  assert(
    expected.mountedCodesignVerification ===
      "valid on disk, satisfies designated requirement",
    `Manifest mounted app codesign verification expected valid on disk, satisfies designated requirement, got ${expected.mountedCodesignVerification}`,
  );
  const expectedVerificationCommands =
    releaseVerificationCommands(releasePaths);
  assert(
    expected.verificationCommands.join("\n") ===
      expectedVerificationCommands.join("\n"),
    `Manifest verification commands expected ${expectedVerificationCommands.join(" | ")}, got ${expected.verificationCommands.join(" | ")}`,
  );

  for (const [path, label] of [
    [appPath, releasePaths.appFileName],
    [appInfoPath, `${releasePaths.productName} Info.plist`],
    [dmgPath, "DMG"],
    [zipPath, "ZIP"],
    [bundleRootPath, "Hermes bundle"],
    [bundleMetadataPath, "Hermes metadata"],
    [packagedMetadataPath, "Packaged Hermes metadata"],
    [packagedUvPath, "Packaged uv binary"],
  ]) {
    requirePath(path, label);
  }

  const appSize = duSize(appPath);
  const dmgSize = duSize(dmgPath);
  const zipSize = duSize(zipPath);
  const bundleSize = duSize(bundleRootPath);
  assert(
    expected.appSize === appSize,
    `Manifest app size expected ${appSize}, got ${expected.appSize}`,
  );
  assert(
    expected.dmgSize === dmgSize,
    `Manifest DMG size expected ${dmgSize}, got ${expected.dmgSize}`,
  );
  assert(
    expected.zipSize === zipSize,
    `Manifest ZIP size expected ${zipSize}, got ${expected.zipSize}`,
  );
  assert(
    expected.bundleSize === bundleSize,
    `Manifest Hermes bundle size expected ${bundleSize}, got ${expected.bundleSize}`,
  );
  assert(
    expected.mountedAppSize === appSize,
    `Manifest mounted app size expected ${appSize}, got ${expected.mountedAppSize}`,
  );
  assert(
    expected.mountedBundleSize === bundleSize,
    `Manifest mounted Hermes bundle size expected ${bundleSize}, got ${expected.mountedBundleSize}`,
  );
  releaseConfig.expectedMountedAppSize = expected.mountedAppSize;
  releaseConfig.expectedMountedBundleSize = expected.mountedBundleSize;

  assertHermesMetadataMatches(
    JSON.parse(readFileSync(packagedMetadataPath, "utf8")),
    bundleMetadata,
    "Packaged Hermes metadata",
  );

  assert(
    sha256(dmgPath) === expected.dmgSha,
    "DMG SHA-256 does not match manifest",
  );
  assert(
    sha256(zipPath) === expected.zipSha,
    "ZIP SHA-256 does not match manifest",
  );
  assert(
    sha256(bundleMetadataPath) === expected.metadataSha,
    "Hermes metadata SHA-256 does not match manifest",
  );
  assert(
    sha256(packagedMetadataPath) === expected.metadataSha,
    "Packaged Hermes metadata SHA-256 does not match manifest",
  );

  verifyPlistValue(
    appInfoPath,
    "CFBundleDisplayName",
    releasePaths.productName,
  );
  verifyPlistValue(appInfoPath, "CFBundleIdentifier", releasePaths.appId);
  verifyPlistValue(appInfoPath, "CFBundleExecutable", releasePaths.productName);
  verifyPlistValue(
    appInfoPath,
    "LSMinimumSystemVersion",
    releasePaths.minimumMacos,
  );

  const archInfo = run("lipo", [
    "-info",
    join(appPath, "Contents", "MacOS", releasePaths.productName),
  ]);
  assert(
    archInfo.includes("arm64"),
    `Expected arm64 app executable, got: ${archInfo}`,
  );

  run("codesign", ["--verify", "--deep", "--strict", "--verbose=2", appPath]);
  run("hdiutil", ["verify", dmgPath]);

  const unzipOutput = run("unzip", ["-t", zipPath]);
  const unzipSummary = unzipOutput.split("\n").at(-1) ?? "";
  assert(
    unzipSummary.startsWith(`${expected.zipUnzipResult} of `),
    `ZIP unzip test result expected ${expected.zipUnzipResult}, got ${unzipSummary}`,
  );

  const zipInfo = run("zipinfo", ["-t", zipPath]);
  const zipInfoMatch = zipInfo.match(
    /^(\d+) files, (\d+) bytes uncompressed, (\d+) bytes compressed:\s+([0-9.]+%)$/,
  );
  assert(zipInfoMatch, `Could not parse zipinfo output: ${zipInfo}`);
  assert(
    Number(zipInfoMatch[1]) === expected.zipEntries,
    "ZIP entry count does not match manifest",
  );
  assert(
    Number(zipInfoMatch[2]) === expected.zipUncompressed,
    "ZIP uncompressed total does not match manifest",
  );
  assert(
    Number(zipInfoMatch[3]) === expected.zipCompressed,
    "ZIP compressed total does not match manifest",
  );
  assert(
    zipInfoMatch[4] === expected.zipCompressionRatio,
    "ZIP compression ratio does not match manifest",
  );
  assert(
    statSync(zipPath).size === expected.zipFileSize,
    "ZIP file size does not match manifest",
  );

  const zipEntries = run("zipinfo", ["-1", zipPath]);
  const expectedZipRequiredEntries = [
    `${releasePaths.appFileName}/Contents/Info.plist`,
    `${releasePaths.appFileName}/Contents/Resources/hermes-agent-bundle/hermes-agent/pyproject.toml`,
    `${releasePaths.appFileName}/Contents/Resources/hermes-agent-bundle/hermes-bundle.json`,
    `${releasePaths.appFileName}/Contents/Resources/uv/macos-arm64/uv`,
    `${releasePaths.appFileName}/Contents/Resources/python/macos-arm64/cpython-3.11.15-macos-aarch64-none/bin/python3.11`,
    `${releasePaths.appFileName}/Contents/_CodeSignature/CodeResources`,
  ];
  assert(
    expected.zipRequiredEntries.join("\n") ===
      expectedZipRequiredEntries.join("\n"),
    `Manifest ZIP required entries expected ${expectedZipRequiredEntries.join(", ")}, got ${expected.zipRequiredEntries.join(", ")}`,
  );
  for (const requiredEntry of expectedZipRequiredEntries) {
    assert(
      zipEntries.split("\n").includes(requiredEntry),
      `ZIP required entry missing: ${requiredEntry}`,
    );
  }

  if (skipMount) {
    console.warn(
      "Mounted DMG verification skipped because --skip-mount was set",
    );
  } else {
    verifyMountedDmg({ dmgPath, releasePaths: releaseConfig });
  }

  console.log("Yat Studio release verification passed");
  console.log(`DMG SHA-256: ${expected.dmgSha}`);
  console.log(`ZIP SHA-256: ${expected.zipSha}`);
  console.log(`Hermes metadata SHA-256: ${expected.metadataSha}`);
}

const isCli =
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isCli) {
  try {
    main();
  } catch (error) {
    printFailure(error);
    process.exitCode = 1;
  }
}
