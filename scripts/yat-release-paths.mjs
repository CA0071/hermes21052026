import { readFileSync } from "node:fs";
import { join } from "node:path";

const defaultProductName = "Yat";
const defaultArch = "arm64";

function requireString(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`package.json ${label} is required for release paths`);
  }
  if (/[\\/]/.test(value)) {
    throw new Error(`package.json ${label} must not contain path separators`);
  }
  return value;
}

export function releasePathsForPackage(packageJson, options = {}) {
  const packageName = requireString(packageJson?.name, "name");
  const version = requireString(packageJson?.version, "version");
  const productName = requireString(
    options.productName ?? defaultProductName,
    "productName",
  );
  const arch = requireString(options.arch ?? defaultArch, "arch");
  const appFileName = `${productName}.app`;

  return {
    arch,
    productName,
    appFileName,
    appRelativePath: `dist/mac-${arch}/${appFileName}`,
    dmgRelativePath: `dist/${packageName}-${version}.dmg`,
    zipRelativePath: `dist/${productName}-${version}-${arch}-mac.zip`,
  };
}

export function readPackageReleasePaths(root, options = {}) {
  return releasePathsForPackage(
    JSON.parse(readFileSync(join(root, "package.json"), "utf8")),
    options,
  );
}
