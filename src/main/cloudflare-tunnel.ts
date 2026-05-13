import { ChildProcess, spawn } from "child_process";
import { EventEmitter } from "events";

export type TunnelStatus = "idle" | "starting" | "active" | "error";

export interface TunnelState {
  status: TunnelStatus;
  url: string | null;
  error?: string;
}

export interface TunnelConfig {
  mode: "quick" | "named";
  tunnelName: string;
  hostname: string;
}

const events = new EventEmitter();

let proc: ChildProcess | null = null;
let tunnelUrl: string | null = null;
let currentStatus: TunnelStatus = "idle";
let stopped = false;
let currentPort = 0;

function emit(state: TunnelState): void {
  currentStatus = state.status;
  tunnelUrl = state.url ?? null;
  events.emit("status", state);
}

function extractUrl(text: string): string | null {
  const m = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
  return m ? m[0] : null;
}

function spawnQuickTunnel(port: number): void {
  emit({ status: "starting", url: null });

  proc = spawn("cloudflared", ["tunnel", "--url", `http://127.0.0.1:${port}`], {
    stdio: ["ignore", "pipe", "pipe"],
  });

  const onData = (chunk: Buffer): void => {
    const text = chunk.toString();
    if (!tunnelUrl) {
      const url = extractUrl(text);
      if (url) emit({ status: "active", url });
    }
  };

  proc.stdout?.on("data", onData);
  proc.stderr?.on("data", onData);

  proc.on("exit", (code) => {
    proc = null;
    if (!stopped) {
      emit({ status: "error", url: null, error: `cloudflared exited (${code})` });
    } else {
      emit({ status: "idle", url: null });
    }
  });

  proc.on("error", (err) => {
    proc = null;
    const isNotFound = (err as NodeJS.ErrnoException).code === "ENOENT";
    const msg = isNotFound
      ? "cloudflared not found — install it first (winget install Cloudflare.cloudflared)"
      : err.message;
    emit({ status: "error", url: null, error: msg });
  });
}

function spawnNamedTunnel(port: number, config: TunnelConfig): void {
  emit({ status: "starting", url: null });

  // Fetch the tunnel token, then run
  const tokenProc = spawn(
    "cloudflared",
    ["tunnel", "token", config.tunnelName],
    { stdio: ["ignore", "pipe", "pipe"] },
  );

  let token = "";
  tokenProc.stdout?.on("data", (d: Buffer) => { token += d.toString(); });

  tokenProc.on("exit", (code) => {
    if (stopped) return;
    if (code !== 0 || !token.trim()) {
      emit({ status: "error", url: null, error: `Failed to get tunnel token for "${config.tunnelName}"` });
      return;
    }

    const url = config.hostname
      ? `https://${config.hostname}`
      : `https://${config.tunnelName}.cfargotunnel.com`;
    emit({ status: "active", url });

    proc = spawn(
      "cloudflared",
      [
        "tunnel",
        "--protocol", "http2",
        "run",
        "--token", token.trim(),
        "--url", `http://127.0.0.1:${port}`,
      ],
      { stdio: "ignore" },
    );

    proc.on("exit", () => {
      proc = null;
      if (!stopped) {
        setTimeout(() => {
          if (!stopped && currentPort) spawnNamedTunnel(currentPort, config);
        }, 5000);
      } else {
        emit({ status: "idle", url: null });
      }
    });

    proc.on("error", (err) => {
      proc = null;
      emit({ status: "error", url: null, error: err.message });
    });
  });

  tokenProc.on("error", (err) => {
    const isNotFound = (err as NodeJS.ErrnoException).code === "ENOENT";
    const msg = isNotFound
      ? "cloudflared not found — install it first (winget install Cloudflare.cloudflared)"
      : err.message;
    emit({ status: "error", url: null, error: msg });
  });
}

export function start(port: number, config: TunnelConfig): void {
  stop();
  stopped = false;
  currentPort = port;

  if (config.mode === "named" && config.tunnelName) {
    spawnNamedTunnel(port, config);
  } else {
    spawnQuickTunnel(port);
  }
}

export function stop(): void {
  stopped = true;
  if (proc) {
    proc.kill();
    proc = null;
  }
  emit({ status: "idle", url: null });
}

export function restart(port: number, config: TunnelConfig): void {
  stop();
  setTimeout(() => start(port, config), 500);
}

export function getStatus(): TunnelState {
  return { status: currentStatus, url: tunnelUrl };
}

export { events };
