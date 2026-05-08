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
        name: "yat-studio",
        version: "0.4.0",
      }),
    ).toEqual({
      appId: "studio.yat.desktop",
      arch: "arm64",
      minimumMacos: "12.0",
      packageName: "yat-studio",
      productName: "Yat Studio",
      version: "0.4.0",
      appFileName: "Yat Studio.app",
      appRelativePath: "dist/mac-arm64/Yat Studio.app",
      dmgRelativePath: "dist/yat-studio-0.4.0.dmg",
      zipRelativePath: "dist/Yat Studio-0.4.0-arm64-mac.zip",
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


import { readFileSync } from "fs";

describe("Yat Studio release UX", () => {
  it("hides the Office module from the sidebar", () => {
    const layout = readFileSync("src/renderer/src/screens/Layout/Layout.tsx", "utf-8");
    expect(layout).not.toContain('view: "office"');
    expect(layout).not.toContain('from "../Office/Office"');
  });

  it("shows app version and update status in the sidebar footer", () => {
    const layout = readFileSync("src/renderer/src/screens/Layout/Layout.tsx", "utf-8");
    expect(layout).toContain("getAppVersion");
    expect(layout).toContain("sidebar-version-btn");
    expect(layout).toContain("sidebar-version-status");
  });
});
