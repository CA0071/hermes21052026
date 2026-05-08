import { app } from "electron";
import {
  DEFAULT_ACTIVE_LOCALE,
  getLocale as getSharedLocale,
  setLocale as setSharedLocale,
  type AppLocale,
} from "../shared/i18n";

function normalizeLocale(raw?: string | null): AppLocale {
  const value = (raw || "").toLowerCase();
  if (value.startsWith("zh")) return "zh-CN";
  if (value.startsWith("en")) return "en";
  return DEFAULT_ACTIVE_LOCALE;
}

let explicitLocale: AppLocale | null = null;
let systemLocaleApplied = false;

export function getSystemLocale(): AppLocale {
  try {
    return normalizeLocale(app.getLocale());
  } catch {
    return DEFAULT_ACTIVE_LOCALE;
  }
}

export function getAppLocale(): AppLocale {
  if (explicitLocale) return explicitLocale;
  if (!systemLocaleApplied) {
    setSharedLocale(getSystemLocale());
    systemLocaleApplied = true;
  }
  return getSharedLocale() || getSystemLocale();
}

export function setAppLocale(locale: AppLocale): AppLocale {
  explicitLocale = locale;
  return setSharedLocale(locale);
}

export function resolveAppLocale(preferred?: AppLocale | null): AppLocale {
  if (preferred) return setAppLocale(preferred);
  explicitLocale = null;
  const locale = getSystemLocale();
  setSharedLocale(locale);
  systemLocaleApplied = true;
  return locale;
}
