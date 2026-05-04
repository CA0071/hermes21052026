import { describe, expect, it } from "vitest";

const { parseElectronBuilderIdentity, releasePathsForPackage } =
  await import("../scripts/yat-release-paths.mjs");

describe("parseElectronBuilderIdentity", () => {
  it("reads product identity from electron-builder YAML", () => {
    expect(
      parseElectronBuilderIdentity(
        'appId: "dev.example.app"\nproductName: "Example App"\n',
      ),
    ).toEqual({
      appId: "dev.example.app",
      productName: "Example App",
    });
  });
});

describe("releasePathsForPackage", () => {
  it("derives macOS release artifact paths from package name and version", () => {
    expect(
      releasePathsForPackage({
        name: "yat",
        version: "0.4.0",
      }),
    ).toEqual({
      appId: "dev.yat.desktop",
      arch: "arm64",
      minimumMacos: "12.0",
      packageName: "yat",
      productName: "Yat",
      version: "0.4.0",
      appFileName: "Yat.app",
      appRelativePath: "dist/mac-arm64/Yat.app",
      dmgRelativePath: "dist/yat-0.4.0.dmg",
      zipRelativePath: "dist/Yat-0.4.0-arm64-mac.zip",
    });
  });

  it("rejects package path separators in generated artifact names", () => {
    expect(() =>
      releasePathsForPackage({
        name: "../yat",
        version: "0.4.0",
      }),
    ).toThrow("package.json name must not contain path separators");
  });
});
