import {
  APP_LOCALES,
  DEFAULT_ACTIVE_LOCALE,
  getLocale as getSharedLocale,
  setLocale as setSharedLocale,
  type AppLocale,
} from "../shared/i18n";
import { readDesktopConfig, writeDesktopConfig } from "./config";

export function getAppLocale(): AppLocale {
  const saved = readDesktopConfig().locale;
  if (
    typeof saved === "string" &&
    (APP_LOCALES as readonly string[]).includes(saved)
  ) {
    return saved as AppLocale;
  }
  return getSharedLocale() || DEFAULT_ACTIVE_LOCALE;
}

export function setAppLocale(locale: AppLocale): AppLocale {
  const data = readDesktopConfig();
  data.locale = locale;
  writeDesktopConfig(data);
  return setSharedLocale(locale);
}
