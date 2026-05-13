import { useState, useEffect, useRef } from "react";
import HermesLogo from "../../components/common/HermesLogo";
import { ArrowRight, Spinner } from "../../assets/icons";
import { CheckCircle, XCircle, Circle, ChevronLeft } from "lucide-react";

interface RemoteSetupProps {
  onBack: () => void;
  onComplete: () => void;
}

type Step = 1 | 2 | 3 | 4;

type DeployStepData = { step: number; total: number; label: string; done: boolean; error?: string };

function field(label: string, input: React.ReactNode, hint?: string): React.JSX.Element {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 5, color: "var(--text-muted)" }}>
        {label}
      </label>
      {input}
      {hint && <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "4px 0 0" }}>{hint}</p>}
    </div>
  );
}

const inp = {
  className: "welcome-remote-input",
  style: { width: "100%", boxSizing: "border-box" as const },
};

export default function RemoteSetup({ onBack, onComplete }: RemoteSetupProps): React.JSX.Element {
  const [step, setStep] = useState<Step>(1);

  // Step 1 — SSH credentials
  const [host, setHost] = useState("");
  const [port, setPort] = useState("22");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [testing, setTesting] = useState(false);
  const [testOk, setTestOk] = useState(false);
  const [testErr, setTestErr] = useState<string | null>(null);

  // Step 2 — Deploy progress
  const [deploySteps, setDeploySteps] = useState<DeployStepData[]>([]);
  const [deployDone, setDeployDone] = useState(false);
  const [deployErr, setDeployErr] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");
  const deployStarted = useRef(false);

  // Step 3 — Tunnel
  const [tunnelTab, setTunnelTab] = useState<"ssh" | "manual" | "cloudflare" | null>(null);
  const [manualUrl, setManualUrl] = useState("");
  const [cfApiToken, setCfApiToken] = useState("");
  const [cfTunnelToken, setCfTunnelToken] = useState("");
  const [cfHostname, setCfHostname] = useState("");
  const [cfInstallCloudflared, setCfInstallCloudflared] = useState(false);
  const [tunnelWorking, setTunnelWorking] = useState(false);
  const [tunnelErr, setTunnelErr] = useState<string | null>(null);
  const [publicUrl, setPublicUrl] = useState("");

  // Subscribe to deploy-progress events
  useEffect(() => {
    const unsub = window.hermesAPI.onDeployProgress((data) => {
      setDeploySteps(prev => {
        const next = [...prev];
        const existing = next.findIndex(s => s.step === data.step);
        const entry: DeployStepData = { ...data, done: !data.error };
        if (existing >= 0) next[existing] = entry;
        else next.push(entry);
        return next;
      });
      if (data.error) setDeployErr(data.error);
    });
    return unsub;
  }, []);

  // Auto-start deploy when entering step 2
  useEffect(() => {
    if (step !== 2 || deployStarted.current) return;
    deployStarted.current = true;

    window.hermesAPI.deployRemoteServer(host, parseInt(port) || 22, username, password).then((res) => {
      if (res.success) {
        setApiKey(res.apiKey);
        setDeployDone(true);
        setTimeout(() => setStep(3), 800);
      } else {
        setDeployErr(res.error || "Deployment failed");
      }
    });
  }, [step, host, port, username, password]);

  async function handleTestSsh(): Promise<void> {
    setTesting(true);
    setTestOk(false);
    setTestErr(null);
    const res = await window.hermesAPI.testSshPassword(host, parseInt(port) || 22, username, password);
    setTesting(false);
    if (res.success) {
      setTestOk(true);
    } else {
      setTestErr(res.error || "Connection failed");
    }
  }

  async function handleSetupSshTunnel(): Promise<void> {
    setTunnelWorking(true);
    setTunnelErr(null);

    const keyRes = await window.hermesAPI.setupRemoteSshKey(host, parseInt(port) || 22, username, password);
    if (!keyRes.success) {
      setTunnelWorking(false);
      setTunnelErr(`SSH key setup failed: ${keyRes.error}`);
      return;
    }

    await window.hermesAPI.setSshConfig(host, parseInt(port) || 22, username, keyRes.keyPath, 8642, 18642);
    await window.hermesAPI.setConnectionConfig("ssh", "", "");
    setTunnelWorking(false);
    setPublicUrl(`${username}@${host}`);
    setStep(4);
  }

  async function handleConnectManual(): Promise<void> {
    const url = manualUrl.trim();
    if (!url) { setTunnelErr("Please enter the server URL"); return; }
    setTunnelWorking(true);
    setTunnelErr(null);
    const ok = await window.hermesAPI.testRemoteConnection(url, apiKey);
    setTunnelWorking(false);
    if (ok) {
      setPublicUrl(url);
      setStep(4);
      await window.hermesAPI.setConnectionConfig("remote", url, apiKey);
    } else {
      setTunnelErr("Cannot reach server at this URL. Make sure the Cloudflare tunnel is running and the URL is correct.");
    }
  }

  async function handleConfigureCloudflare(): Promise<void> {
    if (!cfApiToken.trim() || !cfTunnelToken.trim()) {
      setTunnelErr("API token and tunnel token are required");
      return;
    }
    setTunnelWorking(true);
    setTunnelErr(null);

    // Configure Cloudflare ingress
    const cfRes = await window.hermesAPI.configureCloudflare(cfApiToken.trim(), cfTunnelToken.trim(), cfHostname.trim());
    if (!cfRes.success) {
      setTunnelWorking(false);
      setTunnelErr(`Cloudflare API: ${cfRes.error}`);
      return;
    }

    // Optionally install cloudflared on remote
    if (cfInstallCloudflared) {
      const instRes = await window.hermesAPI.installCloudflared(
        host, parseInt(port) || 22, username, password, cfTunnelToken.trim(),
      );
      if (!instRes.success) {
        setTunnelWorking(false);
        setTunnelErr(`cloudflared install: ${instRes.error}`);
        return;
      }
    }

    // Test connection
    const url = cfRes.publicUrl || manualUrl.trim();
    if (url) {
      const ok = await window.hermesAPI.testRemoteConnection(url, apiKey);
      setTunnelWorking(false);
      if (ok) {
        setPublicUrl(url);
        setStep(4);
        await window.hermesAPI.setConnectionConfig("remote", url, apiKey);
      } else {
        setTunnelErr("Cloudflare configured, but cannot reach server yet. The tunnel may take a minute to propagate — try the manual URL option.");
      }
    } else {
      setTunnelWorking(false);
      setPublicUrl("");
      setStep(4);
      await window.hermesAPI.setConnectionConfig("remote", "", apiKey);
    }
  }

  const card: React.CSSProperties = {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 10,
    padding: "20px 24px",
    width: "100%",
    maxWidth: 480,
  };

  // ── Step 1: SSH ─────────────────────────────────────────────────────────────
  if (step === 1) return (
    <div className="screen welcome-screen">
      <HermesLogo size={34} />
      <h1 className="welcome-title" style={{ fontSize: 22 }}>Setup Remote Server</h1>
      <p className="welcome-subtitle" style={{ marginBottom: 20 }}>
        Connect to your Linux machine over SSH. The app will install the management server automatically.
      </p>

      <div style={card}>
        <div style={{ display: "flex", gap: 8, marginBottom: 0 }}>
          <div style={{ flex: 3 }}>
            {field("Server address", <input {...inp} type="text" placeholder="192.168.1.100" value={host} onChange={e => { setHost(e.target.value); setTestOk(false); }} autoFocus />)}
          </div>
          <div style={{ flex: 1 }}>
            {field("SSH port", <input {...inp} type="number" placeholder="22" value={port} onChange={e => { setPort(e.target.value); setTestOk(false); }} />)}
          </div>
        </div>
        {field("Username", <input {...inp} type="text" placeholder="ubuntu" value={username} onChange={e => { setUsername(e.target.value); setTestOk(false); }} />)}
        {field("Password",
          <input {...inp} type="password" placeholder="••••••••" value={password} onChange={e => { setPassword(e.target.value); setTestOk(false); }}
            onKeyDown={e => e.key === "Enter" && !testing && host && username && handleTestSsh()} />,
          "Password is only used during setup and is never stored."
        )}

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            className="btn btn-secondary"
            onClick={handleTestSsh}
            disabled={testing || !host.trim() || !username.trim() || !password}
            style={{ flex: 1 }}
          >
            {testing ? <><Spinner size={13} className="animate-spin" /> Testing…</> : "Test Connection"}
          </button>
          <button
            className="btn btn-primary"
            onClick={() => setStep(2)}
            disabled={!testOk}
            style={{ flex: 2 }}
          >
            Install Remote Server <ArrowRight size={15} />
          </button>
        </div>

        {testOk && (
          <p style={{ color: "var(--success, #22c55e)", fontSize: 13, marginTop: 10, display: "flex", alignItems: "center", gap: 6 }}>
            <CheckCircle size={14} /> Connected successfully
          </p>
        )}
        {testErr && (
          <p style={{ color: "var(--error, #ef4444)", fontSize: 13, marginTop: 10 }}>
            {testErr}
          </p>
        )}
      </div>

      <button className="btn-ghost" onClick={onBack}
        style={{ marginTop: 12, fontSize: 13, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 4 }}>
        <ChevronLeft size={14} /> Back
      </button>
    </div>
  );

  // ── Step 2: Deploy progress ─────────────────────────────────────────────────
  if (step === 2) return (
    <div className="screen welcome-screen">
      <HermesLogo size={34} />
      <h1 className="welcome-title" style={{ fontSize: 22 }}>Installing…</h1>
      <p className="welcome-subtitle" style={{ marginBottom: 20 }}>
        Setting up the management server on <strong>{host}</strong>
      </p>

      <div style={{ ...card, maxWidth: 400 }}>
        {(["Connecting to server", "Uploading management server", "Installing system service", "Starting service", "Reading API key"] as const).map((label, i) => {
          const n = i + 1;
          const ds = deploySteps.find(s => s.step === n);
          const isDone = ds?.done;
          const isErr = ds?.error;
          const isActive = !ds && deploySteps.length === i;

          return (
            <div key={n} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: i < 4 ? "1px solid var(--border)" : "none" }}>
              {isErr
                ? <XCircle size={20} style={{ color: "var(--error, #ef4444)", flexShrink: 0 }} />
                : isDone
                  ? <CheckCircle size={20} style={{ color: "var(--success, #22c55e)", flexShrink: 0 }} />
                  : isActive
                    ? <Spinner size={18} className="animate-spin" style={{ flexShrink: 0, color: "var(--accent)" }} />
                    : <Circle size={20} style={{ color: "var(--border)", flexShrink: 0 }} />
              }
              <span style={{ fontSize: 13, color: isErr ? "var(--error, #ef4444)" : isDone ? "var(--text)" : "var(--text-muted)" }}>
                {ds?.label || label}
              </span>
            </div>
          );
        })}

        {deployDone && (
          <p style={{ color: "var(--success, #22c55e)", fontSize: 13, marginTop: 12, textAlign: "center" }}>
            ✓ Server installed successfully!
          </p>
        )}

        {deployErr && (
          <div style={{ marginTop: 12 }}>
            <p style={{ color: "var(--error, #ef4444)", fontSize: 13 }}>{deployErr}</p>
            <button className="btn btn-secondary" onClick={() => { setStep(1); deployStarted.current = false; setDeploySteps([]); setDeployErr(null); }}
              style={{ marginTop: 8, width: "100%" }}>
              ← Try Again
            </button>
          </div>
        )}
      </div>
    </div>
  );

  // ── Step 3a: Choose connection method ───────────────────────────────────────
  if (step === 3 && tunnelTab === null) {
    const optionCard = (
      key: "ssh" | "cloudflare" | "manual",
      icon: string,
      title: string,
      desc: string,
      badge?: string,
    ): React.JSX.Element => (
      <button
        key={key}
        onClick={() => { setTunnelTab(key); setTunnelErr(null); }}
        style={{
          display: "flex", alignItems: "center", gap: 16,
          width: "100%", textAlign: "left",
          background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: 10, padding: "16px 18px", cursor: "pointer",
          transition: "border-color 0.15s",
        }}
        onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--accent)")}
        onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border)")}
      >
        <span style={{ fontSize: 28, flexShrink: 0 }}>{icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
            <strong style={{ fontSize: 14 }}>{title}</strong>
            {badge && (
              <span style={{
                fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
                background: "var(--accent)", color: "#fff", textTransform: "uppercase", letterSpacing: "0.05em",
              }}>{badge}</span>
            )}
          </div>
          <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0, lineHeight: 1.4 }}>{desc}</p>
        </div>
        <ArrowRight size={16} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
      </button>
    );

    return (
      <div className="screen welcome-screen">
        <HermesLogo size={34} />
        <h1 className="welcome-title" style={{ fontSize: 22 }}>Choose Connection Method</h1>
        <p className="welcome-subtitle" style={{ marginBottom: 20 }}>
          How should this app reach your Linux server?
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%", maxWidth: 460 }}>
          {optionCard("ssh", "🔐", "SSH Tunnel", `Encrypted tunnel to ${username}@${host} — no open ports or public URL needed.`, "Recommended")}
          {optionCard("cloudflare", "☁️", "Cloudflare Tunnel", "Configure Cloudflare Zero Trust to expose the server via a public HTTPS URL.")}
          {optionCard("manual", "🔗", "Enter URL manually", "Already have a tunnel URL (Cloudflare, ngrok, etc.)? Paste it in.")}
        </div>

        <button className="btn-ghost" onClick={() => setStep(1)}
          style={{ marginTop: 16, fontSize: 13, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 4 }}>
          <ChevronLeft size={14} /> Back
        </button>
      </div>
    );
  }

  // ── Step 3b: Connection method form ─────────────────────────────────────────
  if (step === 3) return (
    <div className="screen welcome-screen">
      <HermesLogo size={34} />

      {tunnelTab === "ssh" && (
        <>
          <h1 className="welcome-title" style={{ fontSize: 22 }}>SSH Tunnel</h1>
          <p className="welcome-subtitle" style={{ marginBottom: 20 }}>
            A permanent SSH key will be generated and installed on your server.
          </p>
          <div style={{ ...card, maxWidth: 460 }}>
            <div style={{ background: "var(--surface-2)", borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 13 }}>
              <strong>{username}@{host}</strong>
              <span style={{ color: "var(--text-muted)", marginLeft: 8 }}>SSH port {port}</span>
              <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "6px 0 0" }}>
                The password is only used during this setup and will not be stored.
                After setup the app connects via SSH key automatically.
              </p>
            </div>
            <button className="btn btn-primary" onClick={handleSetupSshTunnel}
              disabled={tunnelWorking} style={{ width: "100%" }}>
              {tunnelWorking
                ? <><Spinner size={13} className="animate-spin" /> Setting up SSH tunnel…</>
                : <>Set Up SSH Tunnel <ArrowRight size={15} /></>}
            </button>
            {tunnelErr && (
              <p style={{ color: "var(--error, #ef4444)", fontSize: 13, marginTop: 12 }}>{tunnelErr}</p>
            )}
          </div>
        </>
      )}

      {tunnelTab === "cloudflare" && (
        <>
          <h1 className="welcome-title" style={{ fontSize: 22 }}>Cloudflare Tunnel</h1>
          <p className="welcome-subtitle" style={{ marginBottom: 20 }}>
            Configure Cloudflare Zero Trust to expose the management server.
          </p>
          <div style={{ ...card, maxWidth: 480 }}>
            {field("Cloudflare API token",
              <input {...inp} type="password" placeholder="cfut_…" value={cfApiToken}
                onChange={e => { setCfApiToken(e.target.value); setTunnelErr(null); }} autoFocus />,
              "dash.cloudflare.com → My Profile → API Tokens → Create Token"
            )}
            {field("Tunnel token",
              <input {...inp} type="password" placeholder="eyJh…" value={cfTunnelToken}
                onChange={e => { setCfTunnelToken(e.target.value); setTunnelErr(null); }} />,
              "Zero Trust → Networks → Tunnels → your tunnel → Configure → Install connector token"
            )}
            {field("Public hostname (optional)",
              <input {...inp} type="text" placeholder="hermes.yourdomain.com" value={cfHostname}
                onChange={e => { setCfHostname(e.target.value); setTunnelErr(null); }} />,
              "Leave empty to use the existing catch-all tunnel URL."
            )}
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 16, cursor: "pointer" }}>
              <input type="checkbox" checked={cfInstallCloudflared} onChange={e => setCfInstallCloudflared(e.target.checked)} />
              Also install/update cloudflared on the remote server
            </label>
            <button className="btn btn-primary" onClick={handleConfigureCloudflare}
              disabled={tunnelWorking || !cfApiToken.trim() || !cfTunnelToken.trim()} style={{ width: "100%" }}>
              {tunnelWorking
                ? <><Spinner size={13} className="animate-spin" /> Configuring…</>
                : <>Configure Cloudflare <ArrowRight size={15} /></>}
            </button>
            {tunnelErr && (
              <p style={{ color: "var(--error, #ef4444)", fontSize: 13, marginTop: 12, whiteSpace: "pre-line" }}>{tunnelErr}</p>
            )}
          </div>
        </>
      )}

      {tunnelTab === "manual" && (
        <>
          <h1 className="welcome-title" style={{ fontSize: 22 }}>Enter Server URL</h1>
          <p className="welcome-subtitle" style={{ marginBottom: 20 }}>
            The URL must reach the management server (port 8644) from this machine.
          </p>
          <div style={{ ...card, maxWidth: 460 }}>
            {field("Public server URL",
              <input {...inp} type="url" placeholder="https://hermes.yourdomain.com" value={manualUrl}
                onChange={e => { setManualUrl(e.target.value); setTunnelErr(null); }}
                onKeyDown={e => e.key === "Enter" && handleConnectManual()} autoFocus />,
              "Must be accessible from this Windows computer."
            )}
            {apiKey && field("API key (auto-filled)",
              <input {...inp} type="password" value={apiKey} readOnly style={{ opacity: 0.7 }} />
            )}
            <button className="btn btn-primary" onClick={handleConnectManual}
              disabled={tunnelWorking || !manualUrl.trim()} style={{ width: "100%" }}>
              {tunnelWorking
                ? <><Spinner size={13} className="animate-spin" /> Connecting…</>
                : <>Test & Connect <ArrowRight size={15} /></>}
            </button>
            {tunnelErr && (
              <p style={{ color: "var(--error, #ef4444)", fontSize: 13, marginTop: 12 }}>{tunnelErr}</p>
            )}
          </div>
        </>
      )}

      <button className="btn-ghost" onClick={() => { setTunnelTab(null); setTunnelErr(null); }}
        style={{ marginTop: 12, fontSize: 13, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 4 }}>
        <ChevronLeft size={14} /> Back
      </button>
    </div>
  );

  // ── Step 4: Success ─────────────────────────────────────────────────────────
  return (
    <div className="screen welcome-screen">
      <HermesLogo size={34} />
      <h1 className="welcome-title" style={{ fontSize: 22 }}>Ready!</h1>
      <p className="welcome-subtitle" style={{ marginBottom: 20 }}>
        Your remote Hermes server is set up and connected.
      </p>

      <div style={{ ...card, maxWidth: 400, textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
        {publicUrl && (
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
            {publicUrl.startsWith("ssh://") || publicUrl.includes("@")
              ? <>Connected via SSH tunnel to <strong style={{ color: "var(--text)" }}>{publicUrl}</strong></>
              : <>Connected to: <strong style={{ color: "var(--text)" }}>{publicUrl}</strong></>}
          </p>
        )}
        <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 20 }}>
          {tunnelTab === "ssh"
            ? "The app will connect to your Linux machine via SSH — encrypted, no open ports."
            : "From now on, this app will connect to your Linux machine through the public URL — no local installation needed."}
        </p>
        <button className="btn btn-primary" onClick={onComplete} style={{ width: "100%" }}>
          Start using Hermes <ArrowRight size={15} />
        </button>
      </div>
    </div>
  );
}
