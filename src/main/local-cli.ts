import { spawn, spawnSync } from "child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "fs";
import { homedir, tmpdir } from "os";
import { delimiter, join } from "path";
import { stripAnsi } from "./utils";
import { getEnhancedPath } from "./installer";
import type { LocalCliConfig, LocalCliPreset } from "./config";

export const LOCAL_CLI_PROVIDER = "cli";

type ChatHistoryMessage = {
  role?: string;
  content?: string;
};

type LocalCliCallbacks = {
  onChunk?: (chunk: string) => void;
  onDone?: (sessionId?: string) => void;
  onError?: (error: string) => void;
};

export type LocalCliHandle = {
  abort: () => void;
};

export type LocalCliCommand = {
  command: string;
  shell: boolean;
};

function getLocalCliPath(config: LocalCliConfig): string {
  const basePath =
    process.platform === "win32" ? process.env.PATH || "" : getEnhancedPath();
  if (process.platform === "win32" && config.preset === "codex") {
    return [
      join(homedir(), "AppData", "Local", "OpenAI", "Codex", "bin"),
      basePath,
    ].join(delimiter);
  }
  return basePath;
}

export function normalizeLocalCliCommand(command?: string): string {
  const trimmed = command?.trim() || "";
  if (!trimmed) return "";

  const unquoted =
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
      ? trimmed.slice(1, -1).trim()
      : trimmed;

  if (!unquoted || /[\r\n<>|&;`]/.test(unquoted)) return "";
  return unquoted;
}

export function resolveLocalCliCommand(
  command: string,
  envPath = process.env.PATH || "",
): LocalCliCommand {
  const normalized = normalizeLocalCliCommand(command);
  if (!normalized) {
    throw new Error(
      "Local CLI command is empty or contains unsupported shell characters.",
    );
  }

  if (process.platform !== "win32") {
    return { command: normalized, shell: false };
  }

  const hasPathSeparator =
    /[\\/]/.test(normalized) || /^[a-zA-Z]:/.test(normalized);
  if (hasPathSeparator) {
    return {
      command: normalized,
      shell: /\.(cmd|bat)$/i.test(normalized),
    };
  }

  const result = spawnSync("where.exe", [normalized], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: envPath,
    },
    windowsHide: true,
  });

  const candidates = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const exe = candidates.find((candidate) =>
    candidate.toLowerCase().endsWith(".exe"),
  );
  if (exe) {
    return { command: exe, shell: false };
  }

  const cmd = candidates.find((candidate) => /\.(cmd|bat)$/i.test(candidate));
  if (cmd) {
    return { command: cmd, shell: true };
  }

  return { command: normalized, shell: false };
}

export function buildLocalCliArgs(
  config: Pick<LocalCliConfig, "preset">,
  outputPath: string,
  model?: string,
): string[] {
  if (config.preset === "codex") {
    const args = [
      "exec",
      "--skip-git-repo-check",
      "--ephemeral",
      "--sandbox",
      "read-only",
      "--color",
      "never",
      "--output-last-message",
      outputPath,
    ];

    const trimmedModel = normalizeLocalCliModel(config.preset, model);
    if (trimmedModel) {
      args.push("-m", trimmedModel);
    }

    args.push("-");
    return args;
  }

  return [];
}

export function normalizeLocalCliModel(
  preset: LocalCliPreset,
  model?: string,
): string | undefined {
  const trimmed = model?.trim();
  if (!trimmed) return undefined;

  // Hermes' default config may use "codex" as a placeholder. Codex CLI treats
  // that as a literal model id, which fails for ChatGPT-backed accounts.
  if (preset === "codex" && trimmed.toLowerCase() === "codex") {
    return undefined;
  }

  return trimmed;
}

export function buildLocalCliPrompt(
  message: string,
  history?: ChatHistoryMessage[],
): string {
  const recentHistory = (history ?? [])
    .filter((entry) => entry.content?.trim())
    .slice(-12)
    .map((entry) => {
      const role =
        entry.role === "assistant" || entry.role === "agent"
          ? "assistant"
          : "user";
      return `${role}: ${entry.content?.trim()}`;
    });

  if (recentHistory.length === 0) {
    return message;
  }

  return [
    "You are responding inside Hermes Desktop chat.",
    "Use the previous conversation only as context, then answer the latest user message.",
    "",
    "Previous conversation:",
    recentHistory.join("\n\n"),
    "",
    "Latest user message:",
    message,
  ].join("\n");
}

export function sendMessageViaLocalCli(
  message: string,
  callbacks: LocalCliCallbacks,
  options: {
    config: LocalCliConfig;
    model?: string;
    history?: ChatHistoryMessage[];
  },
): LocalCliHandle {
  const workDir = mkdtempSync(join(tmpdir(), "hermes-cli-"));
  const outputPath = join(workDir, "last-message.txt");
  const envPath = getLocalCliPath(options.config);
  const prompt = buildLocalCliPrompt(message, options.history);

  let command: LocalCliCommand;
  try {
    command = resolveLocalCliCommand(options.config.command, envPath);
  } catch (error) {
    rmSync(workDir, { recursive: true, force: true });
    callbacks.onError?.((error as Error).message);
    return { abort: () => undefined };
  }

  const args = buildLocalCliArgs(options.config, outputPath, options.model);

  let stdoutBuffer = "";
  let stderrBuffer = "";
  let settled = false;
  let aborted = false;

  const cleanup = (): void => {
    rmSync(workDir, { recursive: true, force: true });
  };

  const finishError = (error: string): void => {
    if (settled) return;
    settled = true;
    cleanup();
    callbacks.onError?.(error);
  };

  const child = spawn(command.command, args, {
    cwd: workDir,
    env: {
      ...process.env,
      PATH: envPath,
      HOME: process.env.HOME || homedir(),
      NO_COLOR: "1",
      TERM: "dumb",
    },
    shell: command.shell,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });

  child.stdout?.on("data", (data: Buffer) => {
    stdoutBuffer += stripAnsi(data.toString());
  });

  child.stderr?.on("data", (data: Buffer) => {
    stderrBuffer += stripAnsi(data.toString());
  });

  child.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") {
      finishError(
        `Local CLI command was not found: ${options.config.command}. Install it or add it to PATH.`,
      );
      return;
    }

    finishError(error.message);
  });

  child.on("close", (code) => {
    if (settled) return;
    settled = true;

    if (aborted) {
      cleanup();
      callbacks.onError?.("Local CLI request was cancelled.");
      return;
    }

    const fileOutput = existsSync(outputPath)
      ? readFileSync(outputPath, "utf8").trim()
      : "";
    const fallbackOutput = stdoutBuffer.trim();
    cleanup();

    if (code === 0) {
      const response = fileOutput || fallbackOutput;
      if (!response) {
        callbacks.onError?.("Local CLI finished without a response.");
        return;
      }

      callbacks.onChunk?.(response);
      callbacks.onDone?.();
      return;
    }

    const details = (stderrBuffer || fallbackOutput).trim();
    callbacks.onError?.(
      `Local CLI exited with code ${code}${details ? `: ${details}` : "."}`,
    );
  });

  child.stdin?.on("error", () => {
    // The child process may close stdin immediately on startup failure.
  });
  child.stdin?.end(prompt);

  return {
    abort: () => {
      aborted = true;
      child.kill();
    },
  };
}
