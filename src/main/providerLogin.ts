import { execFile, spawn, type ChildProcess } from "child_process";
import { homedir } from "os";
import { shell } from "electron";
import {
  HERMES_HOME,
  HERMES_REPO,
  HERMES_SCRIPT,
  getEnhancedPath,
  getHermesPython,
} from "./installer";
import { stripAnsi } from "./utils";

export type ProviderLoginStatus = "starting" | "waiting" | "success" | "error";

export interface ProviderLoginProgress {
  provider: string;
  status: ProviderLoginStatus;
  detail: string;
  log: string;
  verificationUrl?: string;
  userCode?: string;
}

export interface ProviderAuthStatus {
  provider: string;
  authenticated: boolean;
  detail: string;
}

const OAUTH_LOGIN_PROVIDERS = new Set(["nous", "openai-codex"]);
let providerLoginProcess: ChildProcess | null = null;
let providerLoginCancelled = false;

function hermesEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PATH: getEnhancedPath(),
    HOME: homedir(),
    HERMES_HOME,
    NO_COLOR: "1",
    FORCE_COLOR: "0",
    PYTHONIOENCODING: "utf-8",
    PYTHONUNBUFFERED: "1",
    TERM: "dumb",
  };
}

export function parseProviderLoginOutput(text: string): {
  verificationUrl?: string;
  userCode?: string;
} {
  const clean = stripAnsi(text);
  const urlMatch = clean.match(/https?:\/\/[^\s)]+/i);
  const verificationUrl = urlMatch?.[0].replace(/[.,]+$/, "");
  const lines = clean.split(/\r?\n/);
  let userCode: string | undefined;

  for (let i = 0; i < lines.length; i += 1) {
    if (!/enter (this )?code|if prompt.*code/i.test(lines[i])) continue;
    for (let j = i + 1; j < lines.length; j += 1) {
      const candidate = lines[j].trim().replace(/\s+/g, "");
      if (!candidate) continue;
      if (/^[A-Z0-9][A-Z0-9-]{3,}$/.test(candidate)) {
        userCode = candidate;
      }
      break;
    }
  }

  return { verificationUrl, userCode };
}

export function isProviderAuthenticated(detail: string): boolean {
  return /^[^:\n]+:\s*logged in\b/im.test(stripAnsi(detail));
}

export function getProviderLoginArgs(provider: string): string[] {
  return [
    HERMES_SCRIPT,
    "auth",
    "add",
    provider,
    "--type",
    "oauth",
    "--no-browser",
  ];
}

export function mergeProviderLoginProgress(
  current: ProviderLoginProgress,
  update: Partial<ProviderLoginProgress>,
): ProviderLoginProgress {
  const next = { ...current, ...update };
  if (update.status === "success" || update.status === "error") {
    delete next.verificationUrl;
    delete next.userCode;
  }
  return next;
}

export async function getProviderAuthStatus(
  provider: string,
): Promise<ProviderAuthStatus> {
  if (!OAUTH_LOGIN_PROVIDERS.has(provider)) {
    return {
      provider,
      authenticated: false,
      detail: `Unsupported login provider: ${provider}`,
    };
  }

  return new Promise((resolve) => {
    execFile(
      getHermesPython(),
      [HERMES_SCRIPT, "auth", "status", provider],
      {
        cwd: HERMES_REPO,
        env: hermesEnv(),
        timeout: 15000,
      },
      (_error, stdout, stderr) => {
        const detail = stripAnsi(`${stdout || ""}${stderr || ""}`).trim();
        resolve({
          provider,
          authenticated: isProviderAuthenticated(detail),
          detail,
        });
      },
    );
  });
}

export async function startProviderLogin(
  provider: string,
  onProgress: (progress: ProviderLoginProgress) => void,
): Promise<void> {
  if (!OAUTH_LOGIN_PROVIDERS.has(provider)) {
    throw new Error(`Unsupported login provider: ${provider}`);
  }
  if (providerLoginProcess) {
    throw new Error("A provider sign-in flow is already running.");
  }

  let current: ProviderLoginProgress = {
    provider,
    status: "starting",
    detail: "Starting sign-in...",
    log: "",
  };
  let browserOpened = false;
  providerLoginCancelled = false;

  function emit(update: Partial<ProviderLoginProgress>): void {
    current = mergeProviderLoginProgress(current, update);
    onProgress(current);
  }

  function handleOutput(raw: Buffer): void {
    const text = stripAnsi(raw.toString("utf-8"));
    const log = current.log + text;
    const parsed = parseProviderLoginOutput(log);
    const detail = parsed.userCode
      ? "Browser opened. Enter the code, then finish sign-in."
      : "Requesting a sign-in code...";

    emit({
      status: parsed.userCode ? "waiting" : "starting",
      detail,
      log,
      ...parsed,
    });

    if (parsed.verificationUrl && !browserOpened) {
      browserOpened = true;
      void shell.openExternal(parsed.verificationUrl);
    }
  }

  emit(current);

  await new Promise<void>((resolve, reject) => {
    const args = getProviderLoginArgs(provider);
    const proc = spawn(getHermesPython(), args, {
      cwd: HERMES_REPO,
      env: hermesEnv(),
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    providerLoginProcess = proc;

    proc.stdout.on("data", handleOutput);
    proc.stderr.on("data", handleOutput);

    proc.on("close", (code) => {
      providerLoginProcess = null;
      if (code === 0) {
        emit({
          status: "success",
          detail: "Signed in. You can continue.",
          log: `${current.log}\nSign-in complete.\n`,
        });
        resolve();
      } else {
        const detail = providerLoginCancelled
          ? "Sign-in cancelled."
          : code === null
            ? "Sign-in stopped before it finished."
            : `Sign-in failed (exit code ${code}).`;
        emit({
          status: "error",
          detail,
          log: `${current.log}\n${detail}\n`,
        });
        reject(new Error(detail));
      }
    });

    proc.on("error", (err) => {
      providerLoginProcess = null;
      emit({
        status: "error",
        detail: `Failed to start sign-in: ${err.message}`,
        log: `${current.log}\n${err.message}\n`,
      });
      reject(err);
    });
  });
}

export function cancelProviderLogin(): boolean {
  if (!providerLoginProcess) return false;
  providerLoginCancelled = true;
  providerLoginProcess.kill();
  providerLoginProcess = null;
  return true;
}
