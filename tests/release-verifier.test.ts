import { describe, expect, it } from "vitest";

const { assertHermesMetadataMatches, parseReleaseManifest } =
  await import("../scripts/verify-yat-release.mjs");

const paths = {
  productName: "Yat",
  appId: "dev.yat.desktop",
  appRelativePath: "dist/mac-arm64/Yat.app",
  appFileName: "Yat.app",
  dmgRelativePath: "dist/yat-0.4.0.dmg",
  zipRelativePath: "dist/Yat-0.4.0-arm64-mac.zip",
};

const manifest = `Yat 0.4.0 macOS release manifest

Source repo:
  https://github.com/fathah/hermes-desktop.git

Local repo:
  /Users/yat/hermes-desktop-yat

Application identity:
  Product name: Yat
  Bundle identifier: dev.yat.desktop

Artifacts:
  dist/mac-arm64/Yat.app
    size: 392M

  dist/yat-0.4.0.dmg
    size: 155M
    sha256: f6096993966b59c8cf52d633e73988b44d7a45f4daab971db08fa85e0f03938c

  dist/Yat-0.4.0-arm64-mac.zip
    size: 151M
    sha256: 593cab28f5d43532b2beb9a71c0fe27820299a8d53127185cb3c1650d6d10dc4

Bundled Hermes Agent:
  bundle path: resources/hermes-agent-bundle
  packaged path: Yat.app/Contents/Resources/hermes-agent-bundle
  size: 74M
  source: /Users/yat/.hermes/hermes-agent
  commit: 5d3be898a8671eb9fb99cf18f43165502f54e7f4
  short commit: 5d3be898a867
  ref: v2026.4.30-188-g5d3be898a-dirty
  metadata sha256: 9c2cdbcb9e08635b5c6564c680dee423341f02806318bc9b2fdcdf4d76dd86a0

Verification already performed:
  npm run typecheck
  npm run test
  codesign --verify --deep --strict --verbose=2 dist/mac-arm64/Yat.app
  hdiutil verify dist/yat-0.4.0.dmg
  Computer Use smoke check on packaged Yat.app
  hdiutil attach dist/yat-0.4.0.dmg -readonly -nobrowse -mountpoint /Volumes/YatVerify
  codesign --verify --deep --strict --verbose=2 /Volumes/YatVerify/Yat.app
  hdiutil detach /Volumes/YatVerify
  unzip -t dist/Yat-0.4.0-arm64-mac.zip
  zipinfo -t dist/Yat-0.4.0-arm64-mac.zip

Mounted DMG verification:
  mountpoint contained Yat.app and Applications symlink
  mounted app CFBundleDisplayName: Yat
  mounted app CFBundleIdentifier: dev.yat.desktop
  mounted app size: 392M
  mounted Hermes bundle size: 74M
  mounted app codesign verification: valid on disk, satisfies designated requirement

ZIP verification:
  unzip test result: No errors detected in compressed data
  entries: 4182
  zip file size: 158837969 bytes
  uncompressed total: 403784826 bytes
  compressed total: 157688391 bytes
  compression ratio: 60.9%
  required entries found:
    Yat.app/Contents/Info.plist
    Yat.app/Contents/Resources/hermes-agent-bundle/hermes-agent/pyproject.toml
    Yat.app/Contents/Resources/hermes-agent-bundle/hermes-bundle.json
    Yat.app/Contents/_CodeSignature/CodeResources
`;

describe("parseReleaseManifest", () => {
  it("parses release hashes and ZIP statistics", () => {
    expect(parseReleaseManifest(manifest, paths)).toEqual({
      titleProductName: "Yat",
      titleVersion: "0.4.0",
      sourceRepo: "https://github.com/fathah/hermes-desktop.git",
      localRepo: "/Users/yat/hermes-desktop-yat",
      productName: "Yat",
      bundleIdentifier: "dev.yat.desktop",
      appRelativePath: "dist/mac-arm64/Yat.app",
      appSize: "392M",
      dmgSize: "155M",
      zipSize: "151M",
      bundlePath: "resources/hermes-agent-bundle",
      packagedBundlePath: "Yat.app/Contents/Resources/hermes-agent-bundle",
      bundleSource: "/Users/yat/.hermes/hermes-agent",
      bundleCommit: "5d3be898a8671eb9fb99cf18f43165502f54e7f4",
      bundleShortCommit: "5d3be898a867",
      bundleRef: "v2026.4.30-188-g5d3be898a-dirty",
      bundleSize: "74M",
      verificationCommands: [
        "npm run typecheck",
        "npm run test",
        "codesign --verify --deep --strict --verbose=2 dist/mac-arm64/Yat.app",
        "hdiutil verify dist/yat-0.4.0.dmg",
        "Computer Use smoke check on packaged Yat.app",
        "hdiutil attach dist/yat-0.4.0.dmg -readonly -nobrowse -mountpoint /Volumes/YatVerify",
        "codesign --verify --deep --strict --verbose=2 /Volumes/YatVerify/Yat.app",
        "hdiutil detach /Volumes/YatVerify",
        "unzip -t dist/Yat-0.4.0-arm64-mac.zip",
        "zipinfo -t dist/Yat-0.4.0-arm64-mac.zip",
      ],
      mountedAppFileName: "Yat.app",
      mountedDisplayName: "Yat",
      mountedBundleIdentifier: "dev.yat.desktop",
      mountedAppSize: "392M",
      mountedBundleSize: "74M",
      mountedCodesignVerification:
        "valid on disk, satisfies designated requirement",
      dmgSha:
        "f6096993966b59c8cf52d633e73988b44d7a45f4daab971db08fa85e0f03938c",
      zipSha:
        "593cab28f5d43532b2beb9a71c0fe27820299a8d53127185cb3c1650d6d10dc4",
      metadataSha:
        "9c2cdbcb9e08635b5c6564c680dee423341f02806318bc9b2fdcdf4d76dd86a0",
      zipUnzipResult: "No errors detected in compressed data",
      zipEntries: 4182,
      zipFileSize: 158837969,
      zipUncompressed: 403784826,
      zipCompressed: 157688391,
      zipCompressionRatio: "60.9%",
      zipRequiredEntries: [
        "Yat.app/Contents/Info.plist",
        "Yat.app/Contents/Resources/hermes-agent-bundle/hermes-agent/pyproject.toml",
        "Yat.app/Contents/Resources/hermes-agent-bundle/hermes-bundle.json",
        "Yat.app/Contents/_CodeSignature/CodeResources",
      ],
    });
  });

  it("does not read compressed total from the uncompressed total line", () => {
    const parsed = parseReleaseManifest(manifest, paths);
    expect(parsed.zipUncompressed).not.toBe(parsed.zipCompressed);
    expect(parsed.zipCompressed).toBe(157688391);
  });

  it("throws a targeted error when a ZIP statistic is missing", () => {
    const brokenManifest = manifest.replace(
      "  compressed total: 157688391 bytes\n",
      "",
    );
    expect(() => parseReleaseManifest(brokenManifest, paths)).toThrow(
      "Could not read ZIP compressed total",
    );
  });

  it("throws a targeted error when the ZIP unzip result is missing", () => {
    const brokenManifest = manifest.replace(
      "  unzip test result: No errors detected in compressed data\n",
      "",
    );
    expect(() => parseReleaseManifest(brokenManifest, paths)).toThrow(
      "Could not read ZIP unzip test result",
    );
  });

  it("throws a targeted error when the ZIP compression ratio is missing", () => {
    const brokenManifest = manifest.replace("  compression ratio: 60.9%\n", "");
    expect(() => parseReleaseManifest(brokenManifest, paths)).toThrow(
      "Could not read ZIP compression ratio",
    );
  });

  it("throws a targeted error when release identity is missing", () => {
    const brokenManifest = manifest.replace(
      "  Bundle identifier: dev.yat.desktop\n",
      "",
    );
    expect(() => parseReleaseManifest(brokenManifest, paths)).toThrow(
      "Could not read manifest bundle identifier",
    );
  });

  it("throws a targeted error when source repo is missing", () => {
    const brokenManifest = manifest.replace(
      "  https://github.com/fathah/hermes-desktop.git\n",
      "",
    );
    expect(() => parseReleaseManifest(brokenManifest, paths)).toThrow(
      "Could not read manifest source repo",
    );
  });

  it("throws a targeted error when local repo is missing", () => {
    const brokenManifest = manifest.replace(
      "  /Users/yat/hermes-desktop-yat\n",
      "",
    );
    expect(() => parseReleaseManifest(brokenManifest, paths)).toThrow(
      "Could not read manifest local repo",
    );
  });

  it("throws a targeted error when the manifest app path is missing", () => {
    const brokenManifest = manifest.replace("  dist/mac-arm64/Yat.app\n", "");
    expect(() => parseReleaseManifest(brokenManifest, paths)).toThrow(
      "Could not read manifest app path",
    );
  });

  it("throws a targeted error when the manifest app size is missing", () => {
    const brokenManifest = manifest.replace("    size: 392M\n\n", "\n");
    expect(() => parseReleaseManifest(brokenManifest, paths)).toThrow(
      "Could not read manifest app size",
    );
  });

  it("throws a targeted error when Hermes bundle metadata is missing", () => {
    const brokenManifest = manifest.replace(
      "  commit: 5d3be898a8671eb9fb99cf18f43165502f54e7f4\n",
      "",
    );
    expect(() => parseReleaseManifest(brokenManifest, paths)).toThrow(
      "Could not read Hermes commit",
    );
  });

  it("throws a targeted error when mounted app size is missing", () => {
    const brokenManifest = manifest.replace("  mounted app size: 392M\n", "");
    expect(() => parseReleaseManifest(brokenManifest, paths)).toThrow(
      "Could not read mounted app size",
    );
  });

  it("throws a targeted error when mounted codesign verification is missing", () => {
    const brokenManifest = manifest.replace(
      "  mounted app codesign verification: valid on disk, satisfies designated requirement\n",
      "",
    );
    expect(() => parseReleaseManifest(brokenManifest, paths)).toThrow(
      "Could not read mounted app codesign verification",
    );
  });

  it("throws a targeted error when mounted DMG identity is missing", () => {
    const brokenManifest = manifest.replace(
      "  mounted app CFBundleIdentifier: dev.yat.desktop\n",
      "",
    );
    expect(() => parseReleaseManifest(brokenManifest, paths)).toThrow(
      "Could not read mounted app bundle identifier",
    );
  });

  it("returns an empty command list when performed verification commands are missing", () => {
    const brokenManifest = manifest.replace(
      `  npm run typecheck
  npm run test
  codesign --verify --deep --strict --verbose=2 dist/mac-arm64/Yat.app
  hdiutil verify dist/yat-0.4.0.dmg
  Computer Use smoke check on packaged Yat.app
  hdiutil attach dist/yat-0.4.0.dmg -readonly -nobrowse -mountpoint /Volumes/YatVerify
  codesign --verify --deep --strict --verbose=2 /Volumes/YatVerify/Yat.app
  hdiutil detach /Volumes/YatVerify
  unzip -t dist/Yat-0.4.0-arm64-mac.zip
  zipinfo -t dist/Yat-0.4.0-arm64-mac.zip
`,
      "",
    );
    expect(parseReleaseManifest(brokenManifest, paths)).toMatchObject({
      verificationCommands: [],
    });
  });

  it("throws a targeted error when the manifest title is missing", () => {
    const brokenManifest = manifest.replace(
      "Yat 0.4.0 macOS release manifest",
      "Yat release notes",
    );
    expect(() => parseReleaseManifest(brokenManifest, paths)).toThrow(
      "Could not read manifest title product name",
    );
  });

  it("throws a targeted error when ZIP required entries are missing", () => {
    const brokenManifest = manifest.replace(
      `  required entries found:
    Yat.app/Contents/Info.plist
    Yat.app/Contents/Resources/hermes-agent-bundle/hermes-agent/pyproject.toml
    Yat.app/Contents/Resources/hermes-agent-bundle/hermes-bundle.json
    Yat.app/Contents/_CodeSignature/CodeResources
`,
      "",
    );
    expect(() => parseReleaseManifest(brokenManifest, paths)).toThrow(
      "Could not read ZIP required entries",
    );
  });
});

const hermesMetadata = {
  name: "hermes-agent",
  source: "/Users/yat/.hermes/hermes-agent",
  commit: "5d3be898a8671eb9fb99cf18f43165502f54e7f4",
  shortCommit: "5d3be898a867",
  ref: "v2026.4.30-188-g5d3be898a-dirty",
  bundledAt: "2026-05-04T01:35:24.257Z",
  excludes: [".git", "venv", "node_modules"],
};

describe("assertHermesMetadataMatches", () => {
  it("accepts matching Hermes metadata", () => {
    expect(() =>
      assertHermesMetadataMatches(
        hermesMetadata,
        hermesMetadata,
        "Packaged Hermes metadata",
      ),
    ).not.toThrow();
  });

  it("throws a targeted error when a Hermes metadata field differs", () => {
    expect(() =>
      assertHermesMetadataMatches(
        {
          ...hermesMetadata,
          commit: "bad-commit",
        },
        hermesMetadata,
        "Packaged Hermes metadata",
      ),
    ).toThrow(
      "Packaged Hermes metadata commit expected 5d3be898a8671eb9fb99cf18f43165502f54e7f4, got bad-commit",
    );
  });

  it("throws a targeted error when Hermes metadata excludes differ", () => {
    expect(() =>
      assertHermesMetadataMatches(
        {
          ...hermesMetadata,
          excludes: [".git", "venv"],
        },
        hermesMetadata,
        "Packaged Hermes metadata",
      ),
    ).toThrow(
      "Packaged Hermes metadata excludes expected .git, venv, node_modules, got .git, venv",
    );
  });
});
