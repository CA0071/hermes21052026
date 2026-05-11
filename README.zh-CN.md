# Erzy Office

<p align="center">
  <a href="https://github.com/deniel666/Erzy-desktop-agent/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" alt="License: MIT"></a>
  <a href="https://github.com/deniel666/Erzy-desktop-agent/releases/"><img src="https://img.shields.io/badge/Download-Releases-FF6600?style=for-the-badge" alt="Releases"></a>
</p>

> **正在积极开发中。** 功能可能变更，某些场景可能会失效。如果遇到问题，欢迎在 [issues](https://github.com/deniel666/Erzy-desktop-agent/issues) 中反馈。

**Erzy Office** 是面向中小企业的桌面 AI 助手——帮会计、行政、运营把重复的纸面工作从办公桌上拿走。安装一次、对准你日常的工作流，让它接管录入、合并和分流。

它运行在你的电脑本地，可以接入 OpenAI、Anthropic，或通过 Ollama / LM Studio 使用你自己的离线模型。你提供"大脑"，Erzy Office 在桌面上给它"手和眼睛"。

Erzy Office 构建在开源的 [Hermes Agent](https://github.com/NousResearch/hermes-agent)（MIT 许可）之上——Erzy 在其之上增加了面向中小企业的产品层、品牌与工作流。

## 语言

- 英文：`README.md`
- 简体中文：`README.zh-CN.md`

## 安装

从 [Releases](https://github.com/deniel666/Erzy-desktop-agent/releases/) 页面下载最新版本。

| 平台           | 文件                    |
| -------------- | ----------------------- |
| macOS          | `.dmg`                  |
| Linux（通用）  | `.AppImage`             |
| Linux（Debian） | `.deb`                  |
| Linux（Fedora） | `.rpm`                  |
| Windows        | `.exe`（NSIS 安装包）   |

### Windows

从 Releases 页面下载 `.exe`。安装包尚未代码签名，Windows SmartScreen 在首次启动时会提示——点击 **更多信息 → 仍要运行**。

### macOS

应用尚未公证。首次启动时，执行：

```bash
xattr -cr "/Applications/Erzy Office.app"
```

或在应用上右键 → **打开** → 在确认对话框中点击 **打开**。

### Fedora（RPM）

```bash
sudo dnf install ./erzy-office-<version>.rpm
```

如果你的系统强制校验签名，可追加 `--nogpgcheck`。`.rpm` 暂不支持自动更新——升级请重新安装。

## 主要能力

- **与你的电脑对话。** 让助手读文件、改 Excel、扫邮件、起草文档、跑脚本。需要时也能看屏幕并自动点击。
- **定时任务。** 设置一个每日任务："每天早上 8 点把当天的发票导出录入到会计系统。" 它会在你休息时自动跑。
- **消息平台。** 接入 Telegram、WhatsApp、Slack、Email、SMS、iMessage 等十余个平台——助手可代你收发消息。
- **技能系统。** 通过 Anthropic Skills 风格的技能包，把公司专属的工作流教给助手。
- **记忆。** 跨会话记住团队、客户、供应商、文件路径、个人偏好。
- **多家大模型可选。** 支持 OpenAI、Anthropic Claude、Google Gemini、xAI Grok、OpenRouter（200+ 模型），也可以通过 Ollama / LM Studio / vLLM / llama.cpp 完全离线运行。

## 适合谁

- 在多个系统之间手动录入数据的会计
- 负责重复邮件分流和文档准备的行政人员
- 想自动化后台工作、又不想招软件团队的中小企业主
- 每天早上要重复点 50 下鼠标的所有人

## 工作原理

首次启动时，应用会询问是 **本地运行**（在你的硬件上完整安装）还是连接 **远程服务器**（指向已有的 Erzy Office API 端点）。本地模式会将底层代理安装在 `~/.hermes`、配置所选的大模型供应商，并启动工作区。对话与工具调用通过 `127.0.0.1:8642` 流式传输。

## 界面

| 界面         | 用途                                                                  |
| ------------ | --------------------------------------------------------------------- |
| **Chat**     | 流式对话，支持斜杠命令、工具进度、Token 统计                          |
| **Office**   | 桌面自动化的可视化工作区（基于 Claw3d）                               |
| **Sessions** | 浏览、搜索、恢复历史会话                                              |
| **Agents**   | 创建并切换不同的代理画像                                              |
| **Skills**   | 安装与管理工作流技能                                                  |
| **Models**   | 跨供应商的模型配置管理                                                |
| **Memory**   | 长期记忆条目与记忆提供方                                              |
| **Soul**     | 编辑代理的人格与语气                                                  |
| **Tools**    | 启用/禁用单个工具能力                                                 |
| **Schedules**| Cron 风格的任务调度器，支持 15 种交付目标                             |
| **Gateway**  | 消息平台集成（Telegram、WhatsApp、Slack、Email、SMS 等）              |
| **Settings** | 供应商配置、备份、日志查看、主题、网络设置                            |

## 开发

### 前置依赖

- Node.js 与 npm
- 类 Unix shell（macOS / Linux / Windows WSL）用于首次启动安装器
- 首次安装需要网络

### 安装依赖

```bash
npm install
```

### 启动开发模式

```bash
npm run dev
```

### 构建对应平台

```bash
npm run build:mac
npm run build:win
npm run build:linux
npm run build:rpm
```

## 技术栈

- **Electron** 39、**React** 19、**TypeScript** 5.9
- **Tailwind CSS** 4
- **better-sqlite3**（含 FTS5）用于会话存储与全文检索
- **Vitest** 用于测试
- **i18next** 用于本地化

## 致谢

Erzy Office 是构建在 [Hermes Agent](https://github.com/NousResearch/hermes-agent)（Nous Research，MIT）之上的下游产品，并从 [hermes-desktop](https://github.com/fathah/hermes-desktop)（fathah，MIT）派生而来。两个上游项目均保持 MIT 许可，会在应用内 About 页面及项目 [LICENSE](LICENSE) 中注明。

## 许可证

MIT —— 详见 [LICENSE](LICENSE)。
