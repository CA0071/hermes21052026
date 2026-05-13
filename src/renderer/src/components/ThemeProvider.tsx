import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

export type Theme = "wechat" | "dingtalk" | "whatsapp" | "line";
type ResolvedTheme = Theme;

interface ThemeContextValue {
  theme: Theme;
  resolved: ResolvedTheme;
  setTheme: (theme: Theme) => void;
  previewTheme: (theme: Theme) => void;
  resetPreview: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "whatsapp",
  resolved: "whatsapp",
  setTheme: () => {},
  previewTheme: () => {},
  resetPreview: () => {},
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

  const applyResolvedTheme = useCallback((next: Theme): void => {
    document.documentElement.setAttribute("data-theme", next);
    document.documentElement.setAttribute("data-product-theme", next);
  }, []);

  const setTheme = useCallback(
    (next: Theme): void => {
      setThemeState(next);
      setResolved(next);
      localStorage.setItem(STORAGE_KEY, next);
      applyResolvedTheme(next);
    },
    [applyResolvedTheme],
  );

  const previewTheme = useCallback(
    (next: Theme): void => {
      setResolved(next);
      applyResolvedTheme(next);
    },
    [applyResolvedTheme],
  );

  const resetPreview = useCallback((): void => {
    setResolved(theme);
    applyResolvedTheme(theme);
  }, [applyResolvedTheme, theme]);

  // Update resolved whenever theme changes
  useEffect(() => {
    setResolved(resolve(theme));
  }, [theme]);

  // Apply both a product style and a light base theme to <html>.
  useEffect(() => {
    applyResolvedTheme(resolved);
  }, [resolved]);

  return (
    <ThemeContext.Provider
      value={{ theme, resolved, setTheme, previewTheme, resetPreview }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
