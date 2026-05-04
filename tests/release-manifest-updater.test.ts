import { describe, expect, it } from "vitest";

const { parseZipInfoOutput, refreshManifestText } =
  await import("../scripts/update-yat-release-manifest.mjs");

const paths = {
  appId: "dev.yat.desktop",
  productName: "Yat",
  version: "0.4.0",
  appFileName: "Yat.app",
  appRelativePath: "dist/mac-arm64/Yat.app",
  dmgRelativePath: "dist/yat-0.4.0.dmg",
  zipRelativePath: "dist/Yat-0.4.0-arm64-mac.zip",
};

const manifest = `Yat 0.3.2 macOS release manifest
Generated: 2026-01-02

Source repo:
  old-source-repo

Local repo:
  /old/local/repo

Application identity:
  Product name: OldYat
  Bundle identifier: dev.old.desktop

Artifacts:
  dist/mac-arm64/Yat.app
    size: old-app

  dist/yat-0.3.2.dmg
    size: old-dmg
    sha256: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa

  dist/Yat-0.3.2-arm64-mac.zip
    size: old-zip
    sha256: bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb

Bundled Hermes Agent:
  bundle path: resources/hermes-agent-bundle
  packaged path: Yat.app/Contents/Resources/hermes-agent-bundle
  size: old-bundle
  source: old-source
  commit: old-commit
  short commit: old-short
  ref: old-ref
  metadata sha256: cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc

Verification already performed:
  hdiutil verify dist/yat-0.3.2.dmg
  hdiutil attach dist/yat-0.3.2.dmg -readonly -nobrowse -mountpoint /Volumes/YatVerify
  codesign --verify --deep --strict --verbose=2 /Volumes/YatVerify/Yat.app
  unzip -t dist/Yat-0.3.2-arm64-mac.zip
  zipinfo -t dist/Yat-0.3.2-arm64-mac.zip

Mounted DMG verification:
  mountpoint contained OldYat.app and Applications symlink
  mounted app CFBundleDisplayName: OldYat
  mounted app CFBundleIdentifier: dev.old.desktop
  mounted app size: old-mounted-app
  mounted Hermes bundle size: old-mounted-bundle
  mounted app codesign verification: old-codesign-result

ZIP verification:
  entries: 1
  zip file size: 2 bytes
  uncompressed total: 3 bytes
  compressed total: 4 bytes
  compression ratio: 5.0%
  required entries found:
    OldYat.app/Contents/Info.plist
    OldYat.app/Contents/Resources/hermes-agent-bundle/hermes-agent/pyproject.toml
    OldYat.app/Contents/Resources/hermes-agent-bundle/hermes-bundle.json
    OldYat.app/Contents/_CodeSignature/CodeResources
`;

const values = {
  appSize: "392M",
  generatedDate: "2026-05-04",
  sourceRepo: "https://github.com/fathah/hermes-desktop.git",
  localRepo: "/Users/yat/hermes-desktop-yat",
  dmgSize: "155M",
  dmgSha: "f6096993966b59c8cf52d633e73988b44d7a45f4daab971db08fa85e0f03938c",
  zipSize: "151M",
  zipSha: "593cab28f5d43532b2beb9a71c0fe27820299a8d53127185cb3c1650d6d10dc4",
  bundleSize: "74M",
  metadata: {
    source: "/Users/yat/.hermes/hermes-agent",
    commit: "5d3be898a8671eb9fb99cf18f43165502f54e7f4",
    shortCommit: "5d3be898a867",
    ref: "v2026.4.30-188-g5d3be898a-dirty",
  },
  metadataSha:
    "9c2cdbcb9e08635b5c6564c680dee423341f02806318bc9b2fdcdf4d76dd86a0",
  zipInfo: {
    entries: 4182,
    uncompressed: 403784826,
    compressed: 157688391,
    ratio: "60.9%",
  },
  zipFileSize: 158837969,
};

describe("parseZipInfoOutput", () => {
  it("parses zipinfo totals", () => {
    expect(
      parseZipInfoOutput(
        "4182 files, 403784826 bytes uncompressed, 157688391 bytes compressed:  60.9%",
      ),
    ).toEqual({
      entries: 4182,
      uncompressed: 403784826,
      compressed: 157688391,
      ratio: "60.9%",
    });
  });

  it("throws when zipinfo output is not recognized", () => {
    expect(() => parseZipInfoOutput("not zipinfo")).toThrow(
      "Could not parse zipinfo output",
    );
  });
});

describe("refreshManifestText", () => {
  it("updates artifact, metadata, and ZIP statistics fields", () => {
    const refreshed = refreshManifestText(manifest, values, paths);
    expect(refreshed).toContain("Yat 0.4.0 macOS release manifest");
    expect(refreshed).toContain("Generated: 2026-05-04");
    expect(refreshed).toContain(
      "Source repo:\n  https://github.com/fathah/hermes-desktop.git",
    );
    expect(refreshed).toContain("Local repo:\n  /Users/yat/hermes-desktop-yat");
    expect(refreshed).toContain("  Product name: Yat");
    expect(refreshed).toContain("  Bundle identifier: dev.yat.desktop");
    expect(refreshed).toContain("dist/mac-arm64/Yat.app\n    size: 392M");
    expect(refreshed).toContain(
      "dist/yat-0.4.0.dmg\n    size: 155M\n    sha256: f6096993966b59c8cf52d633e73988b44d7a45f4daab971db08fa85e0f03938c",
    );
    expect(refreshed).toContain(
      "dist/Yat-0.4.0-arm64-mac.zip\n    size: 151M\n    sha256: 593cab28f5d43532b2beb9a71c0fe27820299a8d53127185cb3c1650d6d10dc4",
    );
    expect(refreshed).toContain("  source: /Users/yat/.hermes/hermes-agent");
    expect(refreshed).toContain("  entries: 4182");
    expect(refreshed).toContain("  zip file size: 158837969 bytes");
    expect(refreshed).toContain("  compressed total: 157688391 bytes");
    expect(refreshed).toContain("hdiutil verify dist/yat-0.4.0.dmg");
    expect(refreshed).toContain("zipinfo -t dist/Yat-0.4.0-arm64-mac.zip");
    expect(refreshed).toContain(
      "Mounted DMG verification:\n  mountpoint contained Yat.app and Applications symlink\n  mounted app CFBundleDisplayName: Yat\n  mounted app CFBundleIdentifier: dev.yat.desktop\n  mounted app size: 392M\n  mounted Hermes bundle size: 74M\n  mounted app codesign verification: valid on disk, satisfies designated requirement",
    );
    expect(refreshed).toContain(
      "required entries found:\n    Yat.app/Contents/Info.plist\n    Yat.app/Contents/Resources/hermes-agent-bundle/hermes-agent/pyproject.toml\n    Yat.app/Contents/Resources/hermes-agent-bundle/hermes-bundle.json\n    Yat.app/Contents/_CodeSignature/CodeResources",
    );
    expect(refreshed).not.toContain("dist/yat-0.3.2.dmg");
    expect(refreshed).not.toContain("dist/Yat-0.3.2-arm64-mac.zip");
    expect(refreshed).not.toContain("OldYat");
    expect(refreshed).not.toContain("dev.old.desktop");
  });

  it("throws a targeted error when a manifest field is missing", () => {
    const brokenManifest = manifest.replace(
      "dist/mac-arm64/Yat.app\n    size: old-app",
      "dist/mac-arm64/Yat.app",
    );
    expect(() => refreshManifestText(brokenManifest, values, paths)).toThrow(
      "Could not update manifest field: app size",
    );
  });

  it("throws a targeted error when repository values are missing", () => {
    expect(() =>
      refreshManifestText(
        manifest,
        {
          ...values,
          sourceRepo: "",
        },
        paths,
      ),
    ).toThrow("Manifest source repo value is required");
  });

  it("throws a targeted error when generated date is missing", () => {
    expect(() =>
      refreshManifestText(
        manifest,
        {
          ...values,
          generatedDate: "",
        },
        paths,
      ),
    ).toThrow("Manifest generated date value is required");
  });

  it("throws a targeted error when mounted app file name is missing", () => {
    const brokenManifest = manifest.replace(
      "  mountpoint contained OldYat.app and Applications symlink\n",
      "",
    );
    expect(() => refreshManifestText(brokenManifest, values, paths)).toThrow(
      "Could not update manifest field: mounted app file name",
    );
  });

  it("throws a targeted error when a ZIP required entry is missing", () => {
    const brokenManifest = manifest.replace(
      "    OldYat.app/Contents/Resources/hermes-agent-bundle/hermes-bundle.json\n",
      "",
    );
    expect(() => refreshManifestText(brokenManifest, values, paths)).toThrow(
      "Could not update manifest field: ZIP required Hermes metadata entry",
    );
  });
});
