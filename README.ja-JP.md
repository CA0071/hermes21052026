<img width="100%" alt="HERMES DESKTOP" src="https://github.com/user-attachments/assets/80585955-3bae-4aee-af90-a1e61757ccb8" />

<br/>
<p align="center">
  <a href="https://hermes-agent.nousresearch.com/docs/"><img src="https://img.shields.io/badge/Docs-hermes--agent.nousresearch.com-FFD700?style=for-the-badge" alt="Documentation"></a>
  <a href="https://discord.gg/NousResearch"><img src="https://img.shields.io/badge/Discord-5865F2?style=for-the-badge&logo=discord&logoColor=white" alt="Discord"></a>
  <a href="https://github.com/fathah/hermes-desktop/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" alt="License: MIT"></a>
  <a href="https://github.com/fathah/hermes-desktop/releases/"><img src="https://img.shields.io/badge/Download-Releases-FF6600?style=for-the-badge" alt="Releases"></a>
<a href="https://github.com/fathah/hermes-desktop/stargazers">
  <img src="https://img.shields.io/github/stars/fathah/hermes-desktop?style=for-the-badge&color=FFD700&label=Stars" alt="Stars">
</a>
  <a href="https://github.com/fathah/hermes-desktop/releases/">
  <img src="https://img.shields.io/github/downloads/fathah/hermes-desktop/total?style=for-the-badge&color=00B496&label=Total%20Downloads" alt="Downloads">
</a>
</p>

> **本プロジェクトは現在も活発に開発中です。** 機能は変更される可能性があり、一部が動作しなくなることもあります。問題に遭遇した場合や、アイデアがある場合は[Issue を作成してください](https://github.com/fathah/hermes-desktop/issues)。コントリビューションも歓迎しています！

## 言語

- English: `README.md`
- 简体中文: `README.zh-CN.md`
- 日本語: `README.ja-JP.md`

Hermes Desktop は、[Hermes Agent](https://github.com/NousResearch/hermes-agent)（ツール使用、マルチプラットフォームメッセージング、クローズドな学習ループを備えた、自己改善型 AI アシスタント）のインストール・設定・チャットを行うためのネイティブデスクトップアプリです。

CLI を手作業で管理する代わりに、本アプリではインストール、プロバイダのセットアップ、日常的な利用までを一箇所でガイドします。公式の Hermes インストールスクリプトを使用し、Hermes を `~/.hermes` に保存し、チャット、セッション、プロファイル、メモリ、スキル、ツール、スケジューリング、メッセージングゲートウェイなどを GUI で操作できます。

## インストール

[Releases](https://github.com/fathah/hermes-desktop/releases/) ページから最新ビルドをダウンロードしてください。

| プラットフォーム | ファイル                  |
| ---------------- | ------------------------- |
| macOS            | `.dmg`                    |
| Linux (汎用)     | `.AppImage`               |
| Linux (Debian)   | `.deb`                    |
| Linux (Fedora)   | `.rpm`                    |
| Windows          | `.exe` (NSIS インストーラ) |

### Windows (winget)

マニフェストが [`microsoft/winget-pkgs`](https://github.com/microsoft/winget-pkgs) に受理されると、以下のコマンドでインストールできます。

```powershell
winget install NousResearch.HermesDesktop
```

それまでは、Releases ページから `.exe` をダウンロードしてください。

> **Windows ユーザーへ:** インストーラはコード署名されていません。初回起動時に Windows SmartScreen の警告が表示されます。「詳細情報」→「実行」をクリックしてください。

### Fedora (RPM)

```bash
sudo dnf install ./hermes-desktop-<version>.rpm
```

> **Fedora ユーザーへ:** `.rpm` は GPG 署名されていません。署名検証を強制する設定の場合は、インストールコマンドに `--nogpgcheck` を追加してください。`.rpm` ビルドは自動アップデートに対応していません（`electron-updater` の制約）。アップデートする場合は新しい `.rpm` を再インストールしてください。

### macOS

> **macOS ユーザーへ:** 本アプリはコード署名や notarize がされていません。初回起動時に macOS によりブロックされます。インストール後、以下を実行してください。
>
> ```bash
> xattr -cr "/Applications/Hermes Agent.app"
> ```
>
> もしくはアプリを右クリック →「**開く**」→ 確認ダイアログで「**開く**」をクリックしてください。

## 機能

- **初回起動時のガイド付きインストール** — Hermes Agent のインストールを進捗表示と依存関係解決付きで案内します
- **ローカル / リモートバックエンド** — Hermes をローカル (`127.0.0.1:8642`) で実行するか、URL + API キーを使ってリモートの Hermes API サーバーに接続できます
- **マルチプロバイダ対応** — OpenRouter, Anthropic, OpenAI, Google (Gemini), xAI (Grok), Nous Portal, Qwen, MiniMax, Hugging Face, Groq、そしてローカルの OpenAI 互換エンドポイント (LM Studio, Ollama, vLLM, llama.cpp)
- **ストリーミングチャット UI** — SSE ストリーミング、ツール進捗インジケータ、Markdown レンダリング、シンタックスハイライト対応
- **トークン使用量のトラッキング** — プロンプト / 出力トークン数とコストをチャットフッターにリアルタイム表示。`/usage` スラッシュコマンドも利用可能
- **22 種類のスラッシュコマンド** — `/new`, `/clear`, `/fast`, `/web`, `/image`, `/browse`, `/code`, `/shell`, `/usage`, `/help`, `/tools`, `/skills`, `/model`, `/memory`, `/persona`, `/version`, `/compact`, `/compress`, `/undo`, `/retry`, `/debug`, `/status` など
- **セッション管理** — 全文検索 (SQLite FTS5)、日付別の履歴表示、会話の再開と横断検索
- **プロファイル切り替え** — Hermes 環境を分離した状態で作成・削除・切り替え可能
- **14 のツールセット** — Web、ブラウザ、ターミナル、ファイル、コード実行、ビジョン、画像生成、TTS、スキル、メモリ、セッション検索、Clarify、Delegation、MoA、タスクプランニング
- **メモリシステム** — メモリエントリの閲覧 / 編集、ユーザープロファイルメモリ、容量トラッキング、検出可能なメモリプロバイダ (Honcho, Hindsight, Mem0, RetainDB, Supermemory, ByteRover) に対応
- **ペルソナエディタ** — エージェントの SOUL.md パーソナリティを編集・リセット可能
- **保存済みモデル** — プロバイダごとのモデル設定を CRUD で管理
- **スケジュールタスク** — 分単位 / 時間単位 / 日単位 / 週単位 / カスタム cron に対応する cron ジョブビルダー（15 種類の配信先）
- **16 種類のメッセージングゲートウェイ** — Telegram, Discord, Slack, WhatsApp, Signal, Matrix, Mattermost, Email (IMAP/SMTP), SMS (Twilio/Vonage), iMessage (BlueBubbles), DingTalk, Feishu/Lark, WeCom, WeChat (iLink Bot), Webhooks, Home Assistant
- **Hermes Office (Claw3d)** — ビジュアルな 3D インターフェース。開発サーバーとアダプタの管理機能を備える
- **バックアップ、インポート、デバッグダンプ** — 設定画面からデータの完全なバックアップ / リストアとシステム診断が可能
- **ログビューア** — ゲートウェイとエージェントのログを設定画面から直接閲覧
- **自動アップデーター** — electron-updater を使ったアップデートチェックとインストール
- **i18n 対応** — 全画面に対応する英語ロケールを含む国際化フレームワーク。コミュニティ翻訳の受け入れ準備済み
- **テストスイート** — SSE パーサ、IPC ハンドラ、preload API サーフェス、インストーラユーティリティ、定数バリデーションを Vitest で検証

## プレビュー

<table>
<tr>
<td width="50%" align="center"><b>Office</b><br/><img width="100%" alt="Office" src="https://github.com/user-attachments/assets/214bfa60-48ec-4449-be40-370628205147" /></td>
<td width="50%" align="center"><b>Chat</b><br/><img width="100%" alt="Chat" src="https://github.com/user-attachments/assets/ca84a56c-4d14-4775-96bb-c725069988be" /></td>
</tr>
<tr>
<td width="50%" align="center"><b>Profiles</b><br/><img width="100%" alt="Profiles" src="https://github.com/user-attachments/assets/bd812e4a-bbdc-4141-b3a8-1ab5b0e561d4" /></td>
<td width="50%" align="center"><b>Tools</b><br/><img width="100%" alt="Tools" src="https://github.com/user-attachments/assets/ad051fbe-055d-40d2-b6dd-959c522412d2" /></td>
</tr>
<tr>
<td width="50%" align="center"><b>Settings</b><br/><img width="100%" alt="Settings" src="https://github.com/user-attachments/assets/b3f7e0d8-b087-4935-b57c-f8db30491f2e" /></td>
<td width="50%" align="center"><b>Skills</b><br/><img width="100%" alt="Skills" src="https://github.com/user-attachments/assets/508c3501-52eb-419d-8cfd-06268875ff62" /></td>
</tr>
</table>

## 動作の仕組み

初回起動時、アプリは次の手順で動作します。

1. Hermes を**ローカル**で動かすか、**リモート**の Hermes API サーバーに接続するかを尋ねます。
2. **ローカルモード:** `~/.hermes` に Hermes が既にインストールされているかを確認します。なければ、依存関係 (Git, uv, Python 3.11+) を解決しつつ公式インストーラを実行します。
3. **リモートモード:** リモート API の URL と API キーを入力させ、接続を検証し、ローカルインストールをスキップします。
4. API プロバイダまたはローカルモデルのエンドポイントを尋ねます。
5. プロバイダ設定と API キーを Hermes の設定ファイルに保存します。
6. セットアップが完了するとメインのワークスペースを起動します。

ローカルモードでは、チャットリクエストは `http://127.0.0.1:8642` 経由で SSE ストリーミングされます。リモートモードでは、設定したリモート URL に対して同じストリーミングプロトコルで通信します。デスクトップアプリはストリームをリアルタイムで解析し、ツール進捗、Markdown コンテンツ、トークン使用量を順次レンダリングします。

## 画面構成

| 画面          | 説明                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------ |
| **Chat**      | ストリーミング会話 UI。スラッシュコマンド、ツール進捗、トークントラッキングに対応         |
| **Sessions**  | 過去の会話の閲覧、検索、再開                                                               |
| **Agents**    | Hermes プロファイルの作成、削除、切り替え                                                  |
| **Skills**    | バンドル済み / インストール済みスキルの閲覧、インストール、管理                            |
| **Models**    | プロバイダごとに保存されたモデル設定の管理                                                 |
| **Memory**    | メモリエントリとユーザープロファイルの閲覧 / 編集、メモリプロバイダの設定                  |
| **Soul**      | アクティブなプロファイルのペルソナ (SOUL.md) を編集                                        |
| **Tools**     | 個別のツールセットを有効化 / 無効化                                                        |
| **Schedules** | 配信先付きの cron ジョブを作成・管理                                                       |
| **Gateway**   | メッセージングプラットフォーム統合の設定と制御                                             |
| **Office**    | Claw3d ビジュアルインターフェースのセットアップと管理                                      |
| **Settings**  | プロバイダ設定、認証情報プール、バックアップ / インポート、ログビューア、ネットワーク、テーマ |

## 対応プロバイダ

### LLM プロバイダ

| プロバイダ          | 備考                                            |
| ------------------- | ----------------------------------------------- |
| **OpenRouter**      | 単一 API で 200 以上のモデルを利用可能（推奨） |
| **Anthropic**       | Claude に直接アクセス                           |
| **OpenAI**          | GPT に直接アクセス                              |
| **Google (Gemini)** | Google AI Studio                                |
| **xAI (Grok)**      | Grok モデル                                     |
| **Nous Portal**     | 無料枠あり                                      |
| **Qwen**            | QwenAI モデル                                   |
| **MiniMax**         | グローバル / 中国向けエンドポイント             |
| **Hugging Face**    | HF Inference 経由で 20 以上のオープンモデル     |
| **Groq**            | 高速推論 (Voice/STT)                            |
| **Local/Custom**    | 任意の OpenAI 互換エンドポイント                |

LM Studio、Ollama、vLLM、llama.cpp 用のローカルプリセットが付属しています。

### メッセージングプラットフォーム

Telegram、Discord、Slack、WhatsApp、Signal、Matrix/Element、Mattermost、Email (IMAP/SMTP)、SMS (Twilio & Vonage)、iMessage (BlueBubbles)、DingTalk、Feishu/Lark、WeCom、WeChat (iLink Bot)、Webhooks、Home Assistant。

### ツール統合

Exa Search、Parallel API、Tavily、Firecrawl、FAL.ai (画像生成)、Honcho、Browserbase、Weights & Biases、Tinker。

## 開発

### 前提条件

- Node.js と npm
- Hermes インストーラ用の Unix 系シェル環境
- 初回起動時に Hermes をダウンロードするためのネットワークアクセス

### 依存関係のインストール

```bash
npm install
```

### 開発モードでアプリを起動

```bash
npm run dev
```

### チェック実行

```bash
npm run lint
npm run typecheck
```

### テスト実行

```bash
npm run test
npm run test:watch
```

### デスクトップアプリのビルド

```bash
npm run build
```

プラットフォーム別パッケージング:

```bash
npm run build:mac
npm run build:win
npm run build:linux
npm run build:rpm    # Fedora/RHEL .rpm のみ
```

## 初回セットアップ

アプリを初めて開くと、既存の Hermes インストールを検出するか、インストールを提案します。

UI でサポートされているセットアップパス:

- `OpenRouter`
- `Anthropic`
- `OpenAI`
- OpenAI 互換 base URL を使った `Local LLM`

以下のローカルプリセットが付属しています。

- LM Studio
- Ollama
- vLLM
- llama.cpp

Hermes のファイルは以下の場所で管理されます。

- `~/.hermes`
- `~/.hermes/.env`
- `~/.hermes/config.yaml`
- `~/.hermes/hermes-agent`
- `~/.hermes/profiles/` — 名前付きプロファイルディレクトリ
- `~/.hermes/state.db` — セッション履歴データベース
- `~/.hermes/cron/jobs.json` — スケジュールタスク

## 技術スタック

- **Electron** 39 — クロスプラットフォームのデスクトップシェル
- **React** 19 — UI フレームワーク
- **TypeScript** 5.9 — main / renderer プロセス間で型安全性を確保
- **Tailwind CSS** 4 — ユーティリティファーストのスタイリング
- **Vite** 7 + electron-vite — 高速な開発サーバーとビルドツール
- **better-sqlite3** — FTS5 全文検索付きのローカルセッションストレージ
- **i18next** — 国際化フレームワーク
- **Vitest** — テストランナー

## 補足

- 本デスクトップアプリはエージェントの動作やツール実行を上流の Hermes Agent プロジェクトに依存しています。
- 内蔵インストーラは公式の Hermes インストールスクリプトを `--skip-setup` 付きで実行し、その後 GUI でプロバイダ設定を完了します。
- ローカルモデルプロバイダには API キーは不要ですが、互換サーバーが事前に起動している必要があります。
- ネットワーク制限のある環境向けに、代替の npm レジストリ経路をサポートしています。

## コントリビューション

コントリビューションを歓迎します！始め方は[コントリビューションガイド](CONTRIBUTING.md)をご覧ください。どこから手を付ければよいか分からない場合は、[Open Issues](https://github.com/NousResearch/hermes-desktop/issues) を確認してください。バグを見つけた、または機能要望がある場合は [Issue を作成してください](https://github.com/NousResearch/hermes-desktop/issues/new)。

## 関連プロジェクト

コアエージェント、ドキュメント、CLI ワークフローについては、Hermes Agent 本体のリポジトリを参照してください。

- https://github.com/NousResearch/hermes-agent
