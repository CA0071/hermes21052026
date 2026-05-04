# Yat Install Notes

## Compatibility

- Platform: macOS
- Architecture: Apple Silicon only (`arm64`)
- Minimum macOS version from `Info.plist`: `12.0`
- Bundle identifier: `dev.yat.desktop`
- App name: `Yat`

This build is not universal. It will not run natively on Intel Macs without a separate x64 build.

## Install From DMG

Use:

```text
/Users/yat/hermes-desktop-yat/dist/yat-0.3.2.dmg
```

Expected SHA-256:

```text
f6096993966b59c8cf52d633e73988b44d7a45f4daab971db08fa85e0f03938c
```

Open the DMG, then drag `Yat.app` to `Applications`.

The DMG was verified by mounting it read-only and checking:

- It contains `Yat.app`.
- It contains an `Applications` symlink.
- Mounted `Yat.app` reports `CFBundleDisplayName=Yat`.
- Mounted `Yat.app` reports `CFBundleIdentifier=dev.yat.desktop`.
- Mounted `Yat.app` contains `Yat.app/Contents/Resources/hermes-agent-bundle`.
- Mounted `Yat.app` passes deep strict codesign verification.

## Install From ZIP

Use:

```text
/Users/yat/hermes-desktop-yat/dist/Yat-0.3.2-arm64-mac.zip
```

Expected SHA-256:

```text
593cab28f5d43532b2beb9a71c0fe27820299a8d53127185cb3c1650d6d10dc4
```

Extract the ZIP, then move `Yat.app` to `Applications`.

The ZIP was verified with `unzip -t`; no compressed-data errors were detected. Required entries were found for:

- `Yat.app/Contents/Info.plist`
- `Yat.app/Contents/Resources/hermes-agent-bundle/hermes-agent/pyproject.toml`
- `Yat.app/Contents/Resources/hermes-agent-bundle/hermes-bundle.json`
- `Yat.app/Contents/_CodeSignature/CodeResources`

## Release Manifest

The full artifact manifest is available at:

```text
/Users/yat/hermes-desktop-yat/docs/YAT_RELEASE_MANIFEST.txt
/Users/yat/hermes-desktop-yat/dist/YAT_RELEASE_MANIFEST.txt
```

Both manifest files are expected to contain the same release hashes and ZIP statistics.

## First Launch

Yat includes Hermes Agent source inside the app bundle. On first-run setup, it:

1. Looks for `Yat.app/Contents/Resources/hermes-agent-bundle/hermes-agent`.
2. Copies that source into `~/.hermes/hermes-agent`.
3. Creates a Python 3.11 virtual environment with `uv`.
4. Installs Hermes dependencies with `uv pip install -e .[all]`.
5. Falls back to the official online Hermes installer only if the bundled setup is not available or fails.

Practical requirements:

- `uv` must be available on `PATH` or at a common install path such as `/opt/homebrew/bin/uv`.
- Python 3.11 must be installable or available to `uv`.
- Internet access may still be needed on first launch for dependency resolution unless the package cache is already warm.

## Gatekeeper

The app has been locally codesigned and verified, but it has not been Apple-notarized. On another Mac, macOS may block the first launch.

If that happens, use Finder's right-click `Open` flow, or notarize the app with an Apple Developer account before wider distribution.

## Local Verification Commands

From `/Users/yat/hermes-desktop-yat`:

```sh
shasum -a 256 dist/yat-0.3.2.dmg dist/Yat-0.3.2-arm64-mac.zip
hdiutil verify dist/yat-0.3.2.dmg
unzip -t dist/Yat-0.3.2-arm64-mac.zip
codesign --verify --deep --strict --verbose=2 dist/mac-arm64/Yat.app
plutil -extract CFBundleDisplayName raw dist/mac-arm64/Yat.app/Contents/Info.plist
plutil -extract CFBundleIdentifier raw dist/mac-arm64/Yat.app/Contents/Info.plist
```

Expected identity:

```text
CFBundleDisplayName: Yat
CFBundleIdentifier: dev.yat.desktop
```
