# Yat Studio Install Notes

## Compatibility

- Platform: macOS
- Architecture: Apple Silicon only (`arm64`)
- Minimum macOS version from `Info.plist`: `12.0`
- Bundle identifier: `studio.yat.desktop`
- App name: `Yat`

This build is not universal. It will not run natively on Intel Macs without a separate x64 build.

## Install From DMG

Use:

```text
/Users/yat/hermes-desktop-yat/dist/yat-studio-0.3.2.dmg
```

Expected SHA-256:

```text
f6096993966b59c8cf52d633e73988b44d7a45f4daab971db08fa85e0f03938c
```

Open the DMG, then drag `Yat Studio.app` to `Applications`.

The DMG was verified by mounting it read-only and checking:

- It contains `Yat Studio.app`.
- It contains an `Applications` symlink.
- Mounted `Yat Studio.app` reports `CFBundleDisplayName=Yat Studio`.
- Mounted `Yat Studio.app` reports `CFBundleIdentifier=studio.yat.desktop`.
- Mounted `Yat Studio.app` contains `Yat Studio.app/Contents/Resources/hermes-agent-bundle`.
- Mounted `Yat Studio.app` passes deep strict codesign verification.

## Install From ZIP

Use:

```text
/Users/yat/hermes-desktop-yat/dist/Yat Studio-0.3.2-arm64-mac.zip
```

Expected SHA-256:

```text
593cab28f5d43532b2beb9a71c0fe27820299a8d53127185cb3c1650d6d10dc4
```

Extract the ZIP, then move `Yat Studio.app` to `Applications`.

The ZIP was verified with `unzip -t`; no compressed-data errors were detected. Required entries were found for:

- `Yat Studio.app/Contents/Info.plist`
- `Yat Studio.app/Contents/Resources/hermes-agent-bundle/hermes-agent/pyproject.toml`
- `Yat Studio.app/Contents/Resources/hermes-agent-bundle/hermes-bundle.json`
- `Yat Studio.app/Contents/_CodeSignature/CodeResources`

## Release Manifest

The full artifact manifest is available at:

```text
/Users/yat/hermes-desktop-yat/docs/YAT_RELEASE_MANIFEST.txt
/Users/yat/hermes-desktop-yat/dist/YAT_RELEASE_MANIFEST.txt
```

Both manifest files are expected to contain the same release hashes and ZIP statistics.

## First Launch

Yat includes Hermes Agent source inside the app bundle. On first-run setup, it:

1. Looks for `Yat Studio.app/Contents/Resources/hermes-agent-bundle/hermes-agent`.
2. Copies that source into `~/.hermes/hermes-agent`.
3. Uses the bundled macOS arm64 `uv` binary from `Yat Studio.app/Contents/Resources/uv/macos-arm64/uv` when available. `uv` is Astral's fast Python package/environment manager; Yat uses it to create the Hermes Python environment. If the bundled binary is missing or unusable, Yat falls back to any system `uv`, then installs it from `https://astral.sh/uv/install.sh` as a last resort.
4. Creates a Python 3.11 virtual environment with `uv`.
5. Installs Hermes dependencies with `uv pip install -e .[all]`.
6. Falls back to the official online Hermes installer only if the bundled setup is not available or fails.

Practical requirements:

- `uv` is bundled for macOS arm64, so the target Mac should not need to download `uv` during first launch. Network access is only needed for the last-resort online `uv` bootstrap if the bundled binary cannot run.
- Python 3.11 must be installable or available to `uv`.
- Internet access may still be needed on first launch for dependency resolution unless the package cache is already warm.

## Gatekeeper

The app has been locally codesigned and verified, but it has not been Apple-notarized. On another Mac, macOS may block the first launch.

If that happens, use Finder's right-click `Open` flow, or notarize the app with an Apple Developer account before wider distribution.

## Local Verification Commands

From `/Users/yat/hermes-desktop-yat`:

```sh
shasum -a 256 dist/yat-studio-0.3.2.dmg dist/Yat Studio-0.3.2-arm64-mac.zip
hdiutil verify dist/yat-studio-0.3.2.dmg
unzip -t dist/Yat Studio-0.3.2-arm64-mac.zip
codesign --verify --deep --strict --verbose=2 dist/mac-arm64/Yat Studio.app
plutil -extract CFBundleDisplayName raw dist/mac-arm64/Yat Studio.app/Contents/Info.plist
plutil -extract CFBundleIdentifier raw dist/mac-arm64/Yat Studio.app/Contents/Info.plist
```

Expected identity:

```text
CFBundleDisplayName: Yat
CFBundleIdentifier: studio.yat.desktop
```
