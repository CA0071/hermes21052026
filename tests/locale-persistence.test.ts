import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

let testHome: string;

async function loadLocaleModule(): Promise<typeof import("../src/main/locale")> {
  vi.resetModules();
  vi.doMock("../src/main/installer", () => ({ HERMES_HOME: testHome }));
  return await import("../src/main/locale");
}

describe("locale persistence", () => {
  beforeEach(() => {
    testHome = mkdtempSync(join(tmpdir(), "hermes-locale-"));
  });

  afterEach(() => {
    vi.doUnmock("../src/main/installer");
    rmSync(testHome, { recursive: true, force: true });
  });

  it("persists selected locale in desktop.json", async () => {
    const { getAppLocale, setAppLocale } = await loadLocaleModule();

    expect(setAppLocale("zh-CN")).toBe("zh-CN");

    const desktopPath = join(testHome, "desktop.json");
    expect(existsSync(desktopPath)).toBe(true);
    expect(JSON.parse(readFileSync(desktopPath, "utf-8"))).toMatchObject({
      locale: "zh-CN",
    });
    expect(getAppLocale()).toBe("zh-CN");
  });
});
