import { existsSync, unlinkSync, readFileSync } from "fs";
import { join } from "path";
import { app } from "electron";
import { execSync } from "child_process";
import managementServerContent from "./hermes-manage-server.py";

function makeServiceUnit(username: string): string {
  return `[Unit]
Description=Hermes Management Server
After=network.target

[Service]
User=${username}
ExecStart=/usr/bin/python3 /home/${username}/hermes-manage-server.py
Restart=always
RestartSec=5
StandardOutput=append:/home/${username}/hermes-manage.log
StandardError=append:/home/${username}/hermes-manage.log

[Install]
WantedBy=multi-user.target
`;
}

type SshCfg = { host: string; port: number; username: string; password: string };

function connectSsh(cfg: SshCfg): Promise<import("ssh2").Client> {
  return new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Client } = require("ssh2") as typeof import("ssh2");
    const conn = new Client();
    const t = setTimeout(() => { conn.end(); reject(new Error("Connection timed out (10s)")); }, 12000);
    conn.on("ready", () => { clearTimeout(t); resolve(conn); });
    conn.on("error", (e: Error) => { clearTimeout(t); reject(e); });
    conn.connect({ host: cfg.host, port: cfg.port, username: cfg.username, password: cfg.password, readyTimeout: 10000 });
  });
}

function sshExec(
  client: import("ssh2").Client,
  command: string,
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    client.exec(command, (err, stream) => {
      if (err) return reject(err);
      let out = "";
      let err2 = "";
      stream.on("data", (d: Buffer) => (out += d.toString()));
      stream.stderr.on("data", (d: Buffer) => (err2 += d.toString()));
      stream.on("close", (code: number) => resolve({ stdout: out, stderr: err2, code: code ?? 0 }));
    });
  });
}

function sftpWrite(client: import("ssh2").Client, content: string, remotePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    client.sftp((err, sftp) => {
      if (err) return reject(err);
      const ws = sftp.createWriteStream(remotePath);
      ws.on("close", resolve);
      ws.on("error", reject);
      ws.end(Buffer.from(content, "utf-8"));
    });
  });
}

export async function testSshPasswordConnection(
  host: string, port: number, username: string, password: string,
): Promise<{ success: boolean; error?: string }> {
  let conn: import("ssh2").Client | null = null;
  try {
    conn = await connectSsh({ host, port, username, password });
    conn.end();
    return { success: true };
  } catch (e) {
    try { conn?.end(); } catch {}
    return { success: false, error: (e as Error).message };
  }
}

export type DeployStep = { step: number; total: number; label: string; error?: string };

export async function deployManagementServer(
  host: string, port: number, username: string, password: string,
  onStep: (s: DeployStep) => void,
): Promise<{ success: boolean; apiKey: string; error?: string }> {
  const total = 5;
  let conn: import("ssh2").Client | null = null;
  const sudo = (cmd: string) => `echo ${JSON.stringify(password)} | sudo -S sh -c ${JSON.stringify(cmd)} 2>&1`;

  try {
    onStep({ step: 1, total, label: "Connecting to server…" });
    conn = await connectSsh({ host, port, username, password });

    onStep({ step: 2, total, label: "Uploading management server…" });
    await sftpWrite(conn, managementServerContent, `/home/${username}/hermes-manage-server.py`);

    onStep({ step: 3, total, label: "Installing system service…" });
    const serviceContent = makeServiceUnit(username);
    await sftpWrite(conn, serviceContent, "/tmp/hermes-manage.service");
    const svcRes = await sshExec(conn,
      sudo("mv /tmp/hermes-manage.service /etc/systemd/system/ && systemctl daemon-reload && systemctl enable hermes-manage"),
    );
    if (svcRes.code !== 0) throw new Error(`Service setup failed: ${svcRes.stdout || svcRes.stderr}`);

    onStep({ step: 4, total, label: "Starting service…" });
    await sshExec(conn, sudo("systemctl restart hermes-manage"));
    await new Promise(r => setTimeout(r, 2500));
    const statusRes = await sshExec(conn, "systemctl is-active hermes-manage");
    if (statusRes.stdout.trim() !== "active") {
      const logRes = await sshExec(conn, `tail -5 /home/${username}/hermes-manage.log 2>/dev/null || true`);
      throw new Error(`Service not active (${statusRes.stdout.trim()}). Log: ${logRes.stdout.trim()}`);
    }

    onStep({ step: 5, total, label: "Reading API key…" });
    const keyRes = await sshExec(conn, `grep -m1 'API_SERVER_KEY' ~/.hermes/.env 2>/dev/null | cut -d= -f2 | tr -d "\"' \\n" || true`);
    const apiKey = keyRes.stdout.trim();

    conn.end();
    return { success: true, apiKey };
  } catch (e) {
    try { conn?.end(); } catch {}
    return { success: false, apiKey: "", error: (e as Error).message };
  }
}

export async function generateAndInstallSshKey(
  host: string, port: number, username: string, password: string,
): Promise<{ success: boolean; keyPath: string; error?: string }> {
  const keyPath = join(app.getPath("userData"), "hermes-remote.key");
  const pubKeyPath = keyPath + ".pub";

  // Generate fresh ed25519 key pair
  try {
    if (existsSync(keyPath)) unlinkSync(keyPath);
    if (existsSync(pubKeyPath)) unlinkSync(pubKeyPath);
    execSync(`ssh-keygen -t ed25519 -f "${keyPath}" -N ""`, { stdio: "ignore", timeout: 15000 });
  } catch (e) {
    return { success: false, keyPath: "", error: `ssh-keygen failed: ${(e as Error).message}` };
  }

  const pubKey = readFileSync(pubKeyPath, "utf-8").trim();

  let conn: import("ssh2").Client | null = null;
  try {
    conn = await connectSsh({ host, port, username, password });

    // Get remote home directory
    const homeRes = await sshExec(conn, "echo $HOME");
    const homeDir = homeRes.stdout.trim() || `/home/${username}`;

    // Get existing authorized_keys content
    const existingRes = await sshExec(conn, "cat ~/.ssh/authorized_keys 2>/dev/null || true");
    const existing = existingRes.stdout;

    if (!existing.includes(pubKey)) {
      const newContent = existing.trimEnd() + "\n" + pubKey + "\n";
      await sshExec(conn, "mkdir -p ~/.ssh && chmod 700 ~/.ssh");
      await sftpWrite(conn, newContent, `${homeDir}/.ssh/authorized_keys`);
      await sshExec(conn, "chmod 600 ~/.ssh/authorized_keys");
    }

    conn.end();
    return { success: true, keyPath };
  } catch (e) {
    try { conn?.end(); } catch {}
    return { success: false, keyPath: "", error: (e as Error).message };
  }
}

export async function configureCloudflareIngress(
  apiToken: string,
  tunnelToken: string,
  hostname: string,
): Promise<{ success: boolean; publicUrl: string; accountId: string; tunnelId: string; error?: string }> {
  try {
    const parts = tunnelToken.split(".");
    if (parts.length < 2) throw new Error("Invalid tunnel token — expected JWT format");
    const padded = parts[1] + "=".repeat((4 - (parts[1].length % 4)) % 4);
    const payload = JSON.parse(Buffer.from(padded, "base64").toString("utf-8")) as Record<string, string>;
    const accountId = payload.a || payload.account_id;
    const tunnelId = payload.t || payload.tunnel_id;
    if (!accountId || !tunnelId) throw new Error("Tunnel token missing account/tunnel ID");

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { net } = require("electron") as typeof import("electron");
    const ingress = hostname.trim()
      ? [{ hostname: hostname.trim(), service: "http://localhost:8644" }, { service: "http_status:404" }]
      : [{ service: "http://localhost:8644" }];

    const res = await net.fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/cfd_tunnel/${tunnelId}/configurations`,
      {
        method: "PUT",
        headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ config: { ingress } }),
      },
    );
    const data = await res.json() as { success: boolean; errors?: { message: string }[] };
    if (!data.success) throw new Error(data.errors?.[0]?.message || "Cloudflare API error");

    const publicUrl = hostname.trim() ? `https://${hostname.trim()}` : "";
    return { success: true, publicUrl, accountId, tunnelId };
  } catch (e) {
    return { success: false, publicUrl: "", accountId: "", tunnelId: "", error: (e as Error).message };
  }
}

export async function installCloudflaredService(
  host: string, port: number, username: string, password: string, tunnelToken: string,
): Promise<{ success: boolean; error?: string }> {
  let conn: import("ssh2").Client | null = null;
  const sudo = (cmd: string) => `echo ${JSON.stringify(password)} | sudo -S sh -c ${JSON.stringify(cmd)} 2>&1`;
  try {
    conn = await connectSsh({ host, port, username, password });

    // Check if cloudflared is installed
    const checkRes = await sshExec(conn, "which cloudflared 2>/dev/null || true");
    if (!checkRes.stdout.trim()) {
      // Install cloudflared from official release
      const installRes = await sshExec(conn, sudo(
        "curl -fsSL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared && chmod +x /usr/local/bin/cloudflared"
      ));
      if (installRes.code !== 0) throw new Error(`Install failed: ${installRes.stdout}`);
    }

    // Install and start cloudflared as a system service with the tunnel token
    await sshExec(conn, sudo(`cloudflared service install ${tunnelToken}`));
    await sshExec(conn, sudo("systemctl enable cloudflared && systemctl restart cloudflared"));
    conn.end();
    return { success: true };
  } catch (e) {
    try { conn?.end(); } catch {}
    return { success: false, error: (e as Error).message };
  }
}
