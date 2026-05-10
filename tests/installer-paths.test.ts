import { join } from "path";
import { describe, expect, it } from "vitest";
import { resolveHermesPython } from "../src/main/installer";

describe("installer path resolution", () => {
  it("prefers the Windows virtualenv Python path on Windows", () => {
    const venv = "C:\\Users\\test\\.hermes\\hermes-agent\\venv";

    expect(resolveHermesPython(venv, "win32", () => true)).toBe(
      join(venv, "Scripts", "python.exe"),
    );
  });

  it("falls back to the POSIX virtualenv Python path on non-Windows platforms", () => {
    const venv = "/home/test/.hermes/hermes-agent/venv";

    expect(resolveHermesPython(venv, "linux", () => true)).toBe(
      join(venv, "bin", "python"),
    );
  });

  it("selects the first existing candidate", () => {
    const venv = "C:\\Users\\test\\.hermes\\hermes-agent\\venv";
    const binPython = join(venv, "bin", "python");

    expect(
      resolveHermesPython(
        venv,
        "win32",
        (candidate) => candidate === binPython,
      ),
    ).toBe(binPython);
  });
});
