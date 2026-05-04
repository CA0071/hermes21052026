# Yat Delivery Notes

This repo is the Yat-branded build of `fathah/hermes-desktop`.

## Source

- Base repo: `https://github.com/fathah/hermes-desktop.git`
- Local repo: `/Users/yat/hermes-desktop-yat`
- Product name: `Yat`
- Bundle identifier: `dev.yat.desktop`
- Version: `0.3.2`

## Built Artifacts

- App: `/Users/yat/hermes-desktop-yat/dist/mac-arm64/Yat.app`
- DMG: `/Users/yat/hermes-desktop-yat/dist/yat-0.3.2.dmg`
- ZIP: `/Users/yat/hermes-desktop-yat/dist/Yat-0.3.2-arm64-mac.zip`

## Bundled Hermes Agent

Hermes Agent source is prepared by:

```sh
npm run prepare:hermes
```

The bundle is written to:

```text
resources/hermes-agent-bundle/
```

The packaged app includes it at:

```text
Yat.app/Contents/Resources/hermes-agent-bundle/
```

Bundle metadata from the verified build:

- Source: `/Users/yat/.hermes/hermes-agent`
- Commit: `5d3be898a8671eb9fb99cf18f43165502f54e7f4`
- Ref: `v2026.4.30-188-g5d3be898a-dirty`
- Size: about `74M`

Excluded from the bundle:

- `.git`
- `venv`
- `.venv`
- `node_modules`
- `__pycache__`
- `.pytest_cache`
- `.mypy_cache`
- `.ruff_cache`
- `temp_vision_images`

## First-Run Runtime Setup

`src/main/installer.ts` now tries the packaged Hermes Agent source first:

1. Find `hermes-agent-bundle/hermes-agent`.
2. Copy it into `~/.hermes/hermes-agent`.
3. Create a Hermes virtual environment with `uv venv venv --python 3.11`.
4. Install dependencies with `uv pip install -e .[all]`.
5. Fall back to the official online Hermes install script only if bundled setup is unavailable or fails.

## UI Direction

The renderer has been restyled as a Codex-inspired desktop workbench:

- Dark left rail
- Light main workspace
- Compact navigation
- Yat brand block with `Hermes Agent inside`
- Cleaner chat empty state and composer
- Session list cards tuned for scanning

Main touched UI files:

- `src/renderer/src/assets/main.css`
- `src/renderer/src/screens/Layout/Layout.tsx`
- `src/renderer/src/components/common/HermesLogo.tsx`

## Verification

Commands run successfully on the final build:

```sh
npm run typecheck
npm run test
codesign --verify --deep --strict --verbose=2 dist/mac-arm64/Yat.app
hdiutil verify dist/yat-0.3.2.dmg
```

Observed verification results:

- TypeScript typecheck passed.
- Vitest passed: `8` test files, `244` tests.
- Codesign verification reported `valid on disk` and satisfies its designated requirement.
- DMG verification reported checksum `VALID`.
- `Info.plist` reports `CFBundleDisplayName=Yat`, `CFBundleExecutable=Yat`, and `CFBundleIdentifier=dev.yat.desktop`.
- Computer Use verified the packaged app opens with window title `Yat`, app id `dev.yat.desktop`, and sidebar brand `Yat / Hermes Agent inside`.
- The DMG was mounted read-only at `/Volumes/YatVerify`; its `Yat.app` reported `CFBundleDisplayName=Yat`, `CFBundleIdentifier=dev.yat.desktop`, contained the `74M` Hermes bundle, and passed deep strict codesign verification from the mounted volume.
- The ZIP was tested with `unzip -t` and reported no compressed-data errors; `zipinfo` reports `4182` entries and required entries for `Info.plist`, `hermes-bundle.json`, Hermes `pyproject.toml`, and `_CodeSignature/CodeResources`.

## Build Commands

Prepare Hermes bundle only:

```sh
npm run prepare:hermes
```

Build renderer/main only:

```sh
npm run build
```

Build macOS distributables:

```sh
npm run build:mac
```
