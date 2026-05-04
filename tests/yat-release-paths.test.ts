import { describe, expect, it } from "vitest";

const { releasePathsForPackage } =
  await import("../scripts/yat-release-paths.mjs");

describe("releasePathsForPackage", () => {
  it("derives macOS release artifact paths from package name and version", () => {
    expect(
      releasePathsForPackage({
        name: "yat",
        version: "0.4.0",
      }),
    ).toEqual({
      arch: "arm64",
      productName: "Yat",
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
