# Erzy Office

<p align="center">
  <a href="https://github.com/deniel666/Erzy-desktop-agent/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" alt="License: MIT"></a>
  <a href="https://github.com/deniel666/Erzy-desktop-agent/releases/"><img src="https://img.shields.io/badge/Download-Releases-FF6600?style=for-the-badge" alt="Releases"></a>
</p>

> **Active development.** Features may change, and some things may break. Open an [issue](https://github.com/deniel666/Erzy-desktop-agent/issues) if something goes wrong.

**Erzy Office** is a desktop AI agent for small and medium businesses — designed to take the repetitive paperwork off the desks of accountants, admins, and operations staff. Install it once, point it at your daily workflows, and let it handle the keying, the merging, the triaging.

It runs locally on your computer. It can talk to OpenAI, Anthropic, or your own offline model (via Ollama / LM Studio). You bring the brain, Erzy Office gives it hands and eyes on your desktop.

Erzy Office is built on top of the open-source [Hermes Agent](https://github.com/NousResearch/hermes-agent) (MIT-licensed) — Erzy adds the SME-focused product layer, branding, and workflows.

## Install

Download the latest build from the [Releases](https://github.com/deniel666/Erzy-desktop-agent/releases/) page.

| Platform       | File                    |
| -------------- | ----------------------- |
| macOS          | `.dmg`                  |
| Linux (any)    | `.AppImage`             |
| Linux (Debian) | `.deb`                  |
| Linux (Fedora) | `.rpm`                  |
| Windows        | `.exe` (NSIS installer) |

### Windows

Download the `.exe` from the Releases page. The installer is not yet code-signed, so Windows SmartScreen will warn on first launch — click **More info → Run anyway**.

### macOS

The app is not yet notarized. On first launch, run:

```bash
xattr -cr "/Applications/Erzy Office.app"
```

Or right-click the app → **Open** → click **Open** in the confirmation dialog.

### Fedora (RPM)

```bash
sudo dnf install ./erzy-office-<version>.rpm
```

If your system enforces signature checking, append `--nogpgcheck`. Auto-update is not supported for `.rpm` builds — reinstall to update.

## What it does

- **Chat with your computer.** Ask the agent to read files, edit Excels, scan emails, draft documents, run scripts. It can see your screen and click around when you tell it to.
- **Scheduled tasks.** Set up a daily job: "every morning at 8 AM, take today's invoice export and key it into our accounting system." It runs while you sleep.
- **Messaging.** Connect Telegram, WhatsApp, Slack, Email, SMS, iMessage, and 10+ other platforms — the agent can answer or send messages on your behalf.
- **Skills system.** Drop in pre-built skills (the same format used by Anthropic's Skills) to teach the agent your company's specific workflows.
- **Memory.** It remembers your team, your suppliers, your customers, your file paths, your preferences — across sessions.
- **Multi-provider brains.** Use OpenAI, Anthropic Claude, Google Gemini, xAI Grok, OpenRouter (200+ models), or run fully offline with Ollama / LM Studio / vLLM / llama.cpp.

## Who it's for

- Accountants drowning in manual data entry across systems
- Admin staff handling repetitive email triage and document prep
- SME owners who want to automate back-office work without hiring a software team
- Anyone who's tired of doing the same 50 clicks every morning

## How it works

On first launch the app asks whether you want to run **locally** (full setup, runs on your hardware) or connect to a **remote** server (you point it at an existing Erzy Office API endpoint). Local mode installs the underlying agent in `~/.hermes`, configures the LLM provider you pick, and launches the workspace. Chat and tool calls stream over `127.0.0.1:8642`.

## Screens

| Screen        | What it does                                                                  |
| ------------- | ----------------------------------------------------------------------------- |
| **Chat**      | Streaming conversation with slash commands, tool progress, token tracking     |
| **Office**    | Visual workspace for desktop automation (powered by Claw3d)                   |
| **Sessions**  | Browse, search, and resume past conversations                                 |
| **Agents**    | Create and switch between agent profiles                                      |
| **Skills**    | Install and manage workflow skills                                            |
| **Models**    | Saved model configurations across providers                                   |
| **Memory**    | Long-term memory entries and providers                                        |
| **Soul**      | Edit the agent's personality and tone                                         |
| **Tools**     | Enable/disable individual tool capabilities                                   |
| **Schedules** | Cron-style job scheduler with 15 delivery targets                             |
| **Gateway**   | Messaging platform integrations (Telegram, WhatsApp, Slack, Email, SMS, etc.) |
| **Settings**  | Provider config, backup, log viewer, themes, network settings                 |

## Development

### Prerequisites

- Node.js and npm
- A Unix-like shell (macOS, Linux, or WSL on Windows) for the first-run installer
- Network access for the first-run setup

### Install dependencies

```bash
npm install
```

### Start in development

```bash
npm run dev
```

### Build for your platform

```bash
npm run build:mac
npm run build:win
npm run build:linux
npm run build:rpm
```

## Tech stack

- **Electron** 39, **React** 19, **TypeScript** 5.9
- **Tailwind CSS** 4 for UI
- **better-sqlite3** with FTS5 for session storage and full-text search
- **Vitest** for tests
- **i18next** for localization

## Credits

Erzy Office is a downstream product built on [Hermes Agent](https://github.com/NousResearch/hermes-agent) (Nous Research, MIT) and forked from [hermes-desktop](https://github.com/fathah/hermes-desktop) (fathah, MIT). Both upstream projects remain MIT-licensed and are credited in the in-app About screen and the project [LICENSE](LICENSE).

## License

MIT — see [LICENSE](LICENSE).
