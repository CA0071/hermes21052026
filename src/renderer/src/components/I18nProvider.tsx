import { useEffect, useMemo, useState } from "react";
import { I18nextProvider, initReactI18next } from "react-i18next";
import {
  APP_LOCALES,
  DEFAULT_ACTIVE_LOCALE,
  setLocale as setSharedLocale,
  sharedI18n,
  type AppLocale,
} from "../../../shared/i18n";
import { I18nContext, type I18nContextValue } from "./I18nContext";

void sharedI18n.use(initReactI18next);

const STORAGE_KEY = "yat-studio-locale";
const LEGACY_STORAGE_KEY = "hermes-locale";

type LocalePreference = AppLocale | "system";

function isAppLocale(raw: string | null): raw is AppLocale {
  return !!raw && (APP_LOCALES as string[]).includes(raw);
}

function readStoredPreference(): LocalePreference {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "system") return "system";
    if (isAppLocale(raw)) return raw;

    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (isAppLocale(legacy)) return legacy;
  } catch {
    /* ignore */
  }
  return "system";
}

function persistPreference(preference: LocalePreference): void {
  try {
    localStorage.setItem(STORAGE_KEY, preference);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

const initialPreference = readStoredPreference();
const browserLocale = typeof navigator !== "undefined" ? navigator.language : "";
const initialActiveLocale: AppLocale = browserLocale.toLowerCase().startsWith("zh")
  ? "zh-CN"
  : DEFAULT_ACTIVE_LOCALE;
setSharedLocale(initialActiveLocale);

export function I18nProvider({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  const [locale, setLocaleState] = useState<AppLocale>(initialActiveLocale);
  const [localePreference, setLocalePreferenceState] =
    useState<LocalePreference>(initialPreference);

  useEffect(() => {
    let mounted = true;
    const api = window.hermesAPI;
    if (!api?.setLocale) {
      setSharedLocale(initialActiveLocale);
      setLocaleState(initialActiveLocale);
      return () => {
        mounted = false;
      };
    }
    api
      .setLocale(initialPreference)
      .then((resolved) => {
        if (!mounted) return;
        setSharedLocale(resolved);
        setLocaleState(resolved);
        persistPreference(initialPreference);
      })
      .catch(() => {
        if (!mounted) return;
        setSharedLocale(initialActiveLocale);
        setLocaleState(initialActiveLocale);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const setLocale = (next: LocalePreference): void => {
    setLocalePreferenceState(next);
    persistPreference(next);
    const api = window.hermesAPI;
    if (!api?.setLocale) {
      if (next === "system") {
        setSharedLocale(initialActiveLocale);
        setLocaleState(initialActiveLocale);
      } else {
        setSharedLocale(next);
        setLocaleState(next);
      }
      return;
    }
    api
      .setLocale(next)
      .then((resolved) => {
        setSharedLocale(resolved);
        setLocaleState(resolved);
      })
      .catch(() => {
        if (next !== "system") {
          setSharedLocale(next);
          setLocaleState(next);
        }
      });
  };

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      localePreference,
      setLocale,
    }),
    [locale, localePreference],
  );

  return (
    <I18nContext.Provider value={value}>
      <I18nextProvider i18n={sharedI18n}>{children}</I18nextProvider>
    </I18nContext.Provider>
  );
}
