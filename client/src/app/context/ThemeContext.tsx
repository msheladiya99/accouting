import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

export type ThemeMode = "light" | "dark" | "auto";
export type AccentColor = "indigo" | "blue" | "emerald" | "violet" | "rose" | "amber";

interface ThemeContextValue {
  mode:        ThemeMode;
  accent:      AccentColor;
  isDark:      boolean;
  setMode:     (m: ThemeMode) => void;
  setAccent:   (a: AccentColor) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  mode:      "light",
  accent:    "indigo",
  isDark:    false,
  setMode:   () => {},
  setAccent: () => {},
});

export function useTheme() { return useContext(ThemeContext); }

function systemPrefersDark(): boolean {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode,   setModeState]   = useState<ThemeMode>(() => (localStorage.getItem("ap_theme_mode") as ThemeMode) ?? "light");
  const [accent, setAccentState] = useState<AccentColor>(() => (localStorage.getItem("ap_theme_accent") as AccentColor) ?? "indigo");
  const [sysDark, setSysDark]   = useState(systemPrefersDark);

  // Listen for system preference changes (for "auto" mode)
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => setSysDark(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const isDark = mode === "dark" || (mode === "auto" && sysDark);

  // Apply .dark class to <html>
  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  const setMode = (m: ThemeMode) => {
    setModeState(m);
    localStorage.setItem("ap_theme_mode", m);
  };

  const setAccent = (a: AccentColor) => {
    setAccentState(a);
    localStorage.setItem("ap_theme_accent", a);
  };

  return (
    <ThemeContext.Provider value={{ mode, accent, isDark, setMode, setAccent }}>
      {children}
    </ThemeContext.Provider>
  );
}
