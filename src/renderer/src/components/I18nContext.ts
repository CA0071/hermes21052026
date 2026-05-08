import { createContext } from "react";
import type { AppLocale } from "../../../shared/i18n";

export type LocalePreference = AppLocale | "system";

export type I18nContextValue = {
  locale: AppLocale;
  localePreference: LocalePreference;
  setLocale: (locale: LocalePreference) => void;
};

export const I18nContext = createContext<I18nContextValue | null>(null);
