import { createContext, useContext, useEffect, useState } from "react";

export type Theme = "wechat" | "dingtalk" | "whatsapp" | "line";
type ResolvedTheme = Theme;

interface ThemeContextValue {
  theme: Theme;
  resolved: ResolvedTheme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "whatsapp",
  resolved: "whatsapp",
  setTheme: () => {},
});

import { THEME_STORAGE_KEY as STORAGE_KEY } from "../constants";

function resolve(theme: Theme): ResolvedTheme {
  return theme;
}

export function ThemeProvider({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  const [theme, setThemeState] = useState<Theme>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (
      stored === "wechat" ||
      stored === "dingtalk" ||
      stored === "whatsapp" ||
      stored === "line"
    ) {
      return stored;
    }
    return "whatsapp";
  });
  const [resolved, setResolved] = useState<ResolvedTheme>(() => resolve(theme));

  function setTheme(next: Theme): void {
    setThemeState(next);
    localStorage.setItem(STORAGE_KEY, next);
  }

  // Update resolved whenever theme changes
  useEffect(() => {
    setResolved(resolve(theme));
  }, [theme]);

  // Apply both a product style and a light base theme to <html>.
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", resolved);
    document.documentElement.setAttribute("data-product-theme", resolved);
  }, [resolved]);

  return (
    <ThemeContext.Provider value={{ theme, resolved, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
