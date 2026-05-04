import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import { homedir } from "node:os";

const root = resolve(new URL("..", import.meta.url).pathname);
const source =
  process.env.HERMES_AGENT_SOURCE ||
  join(homedir(), ".hermes", "hermes-agent");
const bundleRoot = join(root, "resources", "hermes-agent-bundle");
const bundledAgentDir = join(bundleRoot, "hermes-agent");
const metadataPath = join(bundleRoot, "hermes-bundle.json");

if (!existsSync(join(source, "pyproject.toml"))) {
  throw new Error(
    `Hermes Agent source not found at ${source}. Set HERMES_AGENT_SOURCE to a checked out hermes-agent repo.`,
  );
}

function git(args) {
  try {
    return execFileSync("git", ["-C", source, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

rmSync(bundledAgentDir, { recursive: true, force: true });
mkdirSync(bundleRoot, { recursive: true });

cpSync(source, bundledAgentDir, {
  recursive: true,
  verbatimSymlinks: true,
  filter(src) {
    const rel = src.slice(source.length).replace(/^[/\\]/, "");
    if (!rel) return true;
    const parts = rel.split(/[\\/]/);
    const excluded = new Set([
      ".git",
      "venv",
      "node_modules",
      "__pycache__",
      ".pytest_cache",
      ".mypy_cache",
      ".ruff_cache",
      ".venv",
      "temp_vision_images",
    ]);
    return !parts.some((part) => excluded.has(part));
  },
});

const metadata = {
  name: "hermes-agent",
  source,
  commit: git(["rev-parse", "HEAD"]),
  shortCommit: git(["rev-parse", "--short=12", "HEAD"]),
  ref: git(["describe", "--tags", "--always", "--dirty"]),
  bundledAt: new Date().toISOString(),
  excludes: [
    ".git",
    "venv",
    "node_modules",
    "__pycache__",
    ".pytest_cache",
    ".mypy_cache",
    ".ruff_cache",
    ".venv",
    "temp_vision_images",
  ],
};

writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, {
  mode: 0o644,
});

console.log(
  `Bundled Hermes Agent ${metadata.ref ?? metadata.shortCommit ?? "unknown"} into ${bundledAgentDir}`,
);
