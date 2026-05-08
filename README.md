# Yat Studio

Yat is a Yat Studio-branded macOS build of [`fathah/hermes-desktop`](https://github.com/fathah/hermes-desktop) with Hermes Agent source bundled into the app package.

This repository is not the upstream Hermes Desktop release channel. It is the local Yat Studio build workspace used to package:

- `dist/mac-arm64/Yat Studio.app`
- `dist/yat-studio-0.3.2.dmg`
- `dist/Yat Studio-0.3.2-arm64-mac.zip`

## Identity

- Product name: `Yat Studio`
- Bundle identifier: `studio.yat.desktop`
- Version: `0.3.2`
- Platform: macOS
- Architecture: Apple Silicon only (`arm64`)
- Minimum macOS version: `12.0`

## Bundled Hermes Agent

The build includes Hermes Agent source from:

```text
/Users/yat/.hermes/hermes-agent
```

Current bundled metadata:

- Commit: `5d3be898a8671eb9fb99cf18f43165502f54e7f4`
- Ref: `v2026.4.30-188-g5d3be898a-dirty`
- Bundle path: `resources/hermes-agent-bundle`
- Packaged path: `Yat Studio.app/Contents/Resources/hermes-agent-bundle`

On first-run setup, Yat looks for the packaged Hermes source first, copies it to `~/.hermes/hermes-agent`, uses the bundled macOS arm64 `uv` binary if available, creates a Python 3.11 environment with `uv`, and installs Hermes dependencies with `uv pip install -e .[all]`. It falls back to installing `uv` online only if the bundled binary is missing or unusable, then falls back to the official online installer only if the bundled Hermes setup is unavailable or fails.

## Install

Use the local release artifacts:

```text
/Users/yat/hermes-desktop-yat/dist/yat-studio-0.3.2.dmg
/Users/yat/hermes-desktop-yat/dist/Yat Studio-0.3.2-arm64-mac.zip
```

Expected SHA-256:

```text
DMG  f6096993966b59c8cf52d633e73988b44d7a45f4daab971db08fa85e0f03938c
ZIP  593cab28f5d43532b2beb9a71c0fe27820299a8d53127185cb3c1650d6d10dc4
```

The app is locally signed but not Apple-notarized. On another Mac, Gatekeeper may block the first launch. Use Finder's right-click `Open` flow, or notarize the app with an Apple Developer account before wider distribution.

See [docs/YAT_INSTALL.md](docs/YAT_INSTALL.md) for installation notes and [docs/YAT_RELEASE_MANIFEST.txt](docs/YAT_RELEASE_MANIFEST.txt) for the full artifact manifest.

## Verify

Run the full release verification when macOS DiskManagement/DiskArbitration is available:

```sh
npm run verify:release
```

If only DMG mounting is unavailable on the current machine, run the non-mounting checks:

```sh
npm run verify:release:no-mount
```

The non-mounting verifier still checks manifest consistency, artifact hashes, app identity, `arm64` architecture, codesign, DMG checksum, ZIP statistics, and required ZIP entries.

Core quality gates:

```sh
npm run lint
npm run typecheck
npm run test
```

Use the command output as the source of truth for the current test count.

## Build

Install dependencies:

```sh
npm install
```

Prepare the bundled Hermes source:

```sh
npm run prepare:hermes
```

Build macOS distributables:

```sh
npm run build:mac
```

## Main Changes From Upstream

- Product identity changed to `Yat Studio`.
- Bundle identifier changed to `studio.yat.desktop`.
- Hermes Agent source is bundled into the app resources.
- First-run installer prefers the bundled Hermes source before falling back online.
- Renderer styling was adjusted toward a Codex-like desktop workbench.
- Release notes, install docs, manifests, and verifier scripts were added for the Yat artifact set.

## Related Projects

- Upstream desktop app: https://github.com/fathah/hermes-desktop
- Hermes Agent: https://github.com/NousResearch/hermes-agent
