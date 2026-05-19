export type AppLocale = "en" | "es" | "id" | "ja" | "pt-BR" | "zh-CN" | "zh-TW" | "ru";

export type TranslationTree = {
  [key: string]: string | TranslationTree;
};
