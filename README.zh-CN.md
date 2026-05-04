# Yat

Yat 是基于 [`fathah/hermes-desktop`](https://github.com/fathah/hermes-desktop) 做的 Yat 品牌版 macOS 构建，并把 Hermes Agent 源码打进了 App 包内。

这个仓库不是上游 Hermes Desktop 的官方发布通道，而是本机 Yat 构建工作区。当前产物是：

- `dist/mac-arm64/Yat.app`
- `dist/yat-0.3.2.dmg`
- `dist/Yat-0.3.2-arm64-mac.zip`

## 应用身份

- 产品名：`Yat`
- Bundle identifier：`dev.yat.desktop`
- 版本：`0.3.2`
- 平台：macOS
- 架构：仅 Apple Silicon (`arm64`)
- 最低 macOS 版本：`12.0`

## 内置 Hermes Agent

构建时会从这里复制 Hermes Agent 源码：

```text
/Users/yat/.hermes/hermes-agent
```

当前内置元数据：

- Commit：`5d3be898a8671eb9fb99cf18f43165502f54e7f4`
- Ref：`v2026.4.30-188-g5d3be898a-dirty`
- Bundle 路径：`resources/hermes-agent-bundle`
- App 内路径：`Yat.app/Contents/Resources/hermes-agent-bundle`

首次设置时，Yat 会优先使用 App 包内的 Hermes 源码，复制到 `~/.hermes/hermes-agent`，通过 `uv` 创建 Python 3.11 环境，并执行 `uv pip install -e .[all]` 安装依赖。只有当包内 Hermes 不可用或安装失败时，才回退到官方在线安装脚本。

## 安装

使用本地构建产物：

```text
/Users/yat/hermes-desktop-yat/dist/yat-0.3.2.dmg
/Users/yat/hermes-desktop-yat/dist/Yat-0.3.2-arm64-mac.zip
```

预期 SHA-256：

```text
DMG  f6096993966b59c8cf52d633e73988b44d7a45f4daab971db08fa85e0f03938c
ZIP  593cab28f5d43532b2beb9a71c0fe27820299a8d53127185cb3c1650d6d10dc4
```

App 已做本地签名并通过校验，但没有 Apple notarization。复制到另一台 Mac 后，Gatekeeper 可能会阻止首次启动。可通过 Finder 右键 `Open` 打开，或在正式分发前使用 Apple Developer 账号做 notarization。

安装细节见 [docs/YAT_INSTALL.md](docs/YAT_INSTALL.md)，完整产物清单见 [docs/YAT_RELEASE_MANIFEST.txt](docs/YAT_RELEASE_MANIFEST.txt)。

## 验证

当 macOS DiskManagement / DiskArbitration 正常可用时，运行完整发布验证：

```sh
npm run verify:release
```

如果当前机器只有 DMG 挂载不可用，可以运行不挂载 DMG 的验证：

```sh
npm run verify:release:no-mount
```

不挂载版本仍会校验 manifest 一致性、产物哈希、App 身份、`arm64` 架构、codesign、DMG checksum、ZIP 统计和 ZIP 必需条目。

核心质量门：

```sh
npm run lint
npm run typecheck
npm run test
```

当前测试数量以命令输出为准。

## 构建

安装依赖：

```sh
npm install
```

准备内置 Hermes 源码：

```sh
npm run prepare:hermes
```

构建 macOS 发布产物：

```sh
npm run build:mac
```

## 相比上游的主要改动

- 产品身份改为 `Yat`。
- Bundle identifier 改为 `dev.yat.desktop`。
- Hermes Agent 源码被打进 App resources。
- 首次安装优先使用包内 Hermes 源码，再回退在线安装。
- 渲染层样式调整为更接近 Codex 的桌面工作台。
- 增加了 Yat 专用交付说明、安装说明、发布清单和发布验证脚本。

## 相关项目

- 上游桌面应用：https://github.com/fathah/hermes-desktop
- Hermes Agent：https://github.com/NousResearch/hermes-agent
