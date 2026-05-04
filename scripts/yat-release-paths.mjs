import { readFileSync } from "node:fs";
import { join } from "node:path";

const defaultProductName = "Yat";
const defaultAppId = "dev.yat.desktop";
const defaultArch = "arm64";
const defaultMinimumMacos = "12.0";

function requireString(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} is required for release paths`);
  }
  if (/[\\/]/.test(value)) {
    throw new Error(`${label} must not contain path separators`);
  }
  return value;
}

function yamlScalar(value) {
  const trimmed = value.trim();
  const quoted = trimmed.match(/^["'](.*)["']$/);
  return quoted ? quoted[1] : trimmed;
}

export function parseElectronBuilderIdentity(configText) {
  return {
    appId: yamlScalar(
      configText.match(/^appId:\s*(.+)$/m)?.[1] ?? defaultAppId,
    ),
    productName: yamlScalar(
      configText.match(/^productName:\s*(.+)$/m)?.[1] ?? defaultProductName,
    ),
  };
}

export function releasePathsForPackage(packageJson, options = {}) {
  const packageName = requireString(packageJson?.name, "package.json name");
  const version = requireString(packageJson?.version, "package.json version");
  const productName = requireString(
    options.productName ?? defaultProductName,
    "productName",
  );
  const appId = requireString(options.appId ?? defaultAppId, "appId");
  const arch = requireString(options.arch ?? defaultArch, "arch");
  const minimumMacos = requireString(
    options.minimumMacos ?? defaultMinimumMacos,
    "minimumMacos",
  );
  const appFileName = `${productName}.app`;

  return {
    appId,
    arch,
    minimumMacos,
    packageName,
    productName,
    version,
    appFileName,
    appRelativePath: `dist/mac-${arch}/${appFileName}`,
    dmgRelativePath: `dist/${packageName}-${version}.dmg`,
    zipRelativePath: `dist/${productName}-${version}-${arch}-mac.zip`,
  };
}

export function readPackageReleasePaths(root, options = {}) {
  const builderIdentity = parseElectronBuilderIdentity(
    readFileSync(join(root, "electron-builder.yml"), "utf8"),
  );
  return releasePathsForPackage(
    JSON.parse(readFileSync(join(root, "package.json"), "utf8")),
    {
      ...builderIdentity,
      ...options,
    },
  );
}
