import {
  DEFAULT_ACTIVE_LOCALE,
  getLocale as getSharedLocale,
  setLocale as setSharedLocale,
  type AppLocale,
} from "../shared/i18n";
import { readDesktopSetting, writeDesktopSetting } from "./config";

const LOCALE_KEY = "locale";

function isAppLocale(value: unknown): value is AppLocale {
  return (
    value === "en" ||
    value === "es" ||
    value === "id" ||
    value === "ja" ||
    value === "pt-BR" ||
    value === "zh-CN"
  );
}

export function getAppLocale(): AppLocale {
  const savedLocale = readDesktopSetting<unknown>(LOCALE_KEY);
  if (isAppLocale(savedLocale)) {
    setSharedLocale(savedLocale);
    return savedLocale;
  }
  return getSharedLocale() || DEFAULT_ACTIVE_LOCALE;
}

export function setAppLocale(locale: AppLocale): AppLocale {
  const nextLocale = setSharedLocale(locale);
  writeDesktopSetting(LOCALE_KEY, nextLocale);
  return nextLocale;
}
