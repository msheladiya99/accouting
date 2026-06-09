import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

export type ThemeMode = "light" | "dark" | "auto";
export type AccentColor = "indigo" | "blue" | "emerald" | "violet" | "rose" | "amber";

interface ThemeContextValue {
  mode:        ThemeMode;
  accent:      AccentColor;
  isDark:      boolean;
  compact:     boolean;
  animations:  boolean;
  setMode:     (m: ThemeMode) => void;
  setAccent:   (a: AccentColor) => void;
  setCompact:  (c: boolean) => void;
  setAnimations: (a: boolean) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  mode:      "light",
  accent:    "indigo",
  isDark:    false,
  compact:   false,
  animations: true,
  setMode:   () => {},
  setAccent: () => {},
  setCompact: () => {},
  setAnimations: () => {},
});

export function useTheme() { return useContext(ThemeContext); }

function systemPrefersDark(): boolean {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

const ACCENT_MAP = {
  indigo: {
    brand: "#4f46e5",
    hover: "#4338ca",
    light: "#eef2ff",
    lightDark: "#1e1b4b"
  },
  blue: {
    brand: "#2563eb",
    hover: "#1d4ed8",
    light: "#eff6ff",
    lightDark: "#172554"
  },
  emerald: {
    brand: "#059669",
    hover: "#047857",
    light: "#ecfdf5",
    lightDark: "#064e3b"
  },
  violet: {
    brand: "#7c3aed",
    hover: "#6d28d9",
    light: "#f5f3ff",
    lightDark: "#2e1065"
  },
  rose: {
    brand: "#e11d48",
    hover: "#be123c",
    light: "#fff1f2",
    lightDark: "#4c0519"
  },
  amber: {
    brand: "#d97706",
    hover: "#b45309",
    light: "#fffbeb",
    lightDark: "#451a03"
  }
};

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode,   setModeState]   = useState<ThemeMode>(() => (localStorage.getItem("ap_theme_mode") as ThemeMode) ?? "light");
  const [accent, setAccentState] = useState<AccentColor>(() => (localStorage.getItem("ap_theme_accent") as AccentColor) ?? "indigo");
  const [compact, setCompactState] = useState<boolean>(() => localStorage.getItem("ap_theme_compact") === "true");
  const [animations, setAnimationsState] = useState<boolean>(() => localStorage.getItem("ap_theme_animations") !== "false");
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

  // Apply compact mode class
  useEffect(() => {
    document.documentElement.classList.toggle("compact-mode", compact);
  }, [compact]);

  // Apply no animations class
  useEffect(() => {
    document.documentElement.classList.toggle("no-animations", !animations);
  }, [animations]);

  // Apply CSS custom properties for accent colors
  useEffect(() => {
    const themeColors = ACCENT_MAP[accent] || ACCENT_MAP.indigo;
    const root = document.documentElement;
    root.style.setProperty("--brand", themeColors.brand);
    root.style.setProperty("--brand-hover", themeColors.hover);
    root.style.setProperty("--brand-light", isDark ? themeColors.lightDark : themeColors.light);
  }, [accent, isDark]);

  const setMode = (m: ThemeMode) => {
    setModeState(m);
    localStorage.setItem("ap_theme_mode", m);
  };

  const setAccent = (a: AccentColor) => {
    setAccentState(a);
    localStorage.setItem("ap_theme_accent", a);
  };

  const setCompact = (c: boolean) => {
    setCompactState(c);
    localStorage.setItem("ap_theme_compact", String(c));
  };

  const setAnimations = (a: boolean) => {
    setAnimationsState(a);
    localStorage.setItem("ap_theme_animations", String(a));
  };

  return (
    <ThemeContext.Provider value={{
      mode, accent, isDark, compact, animations,
      setMode, setAccent, setCompact, setAnimations
    }}>
      {children}
    </ThemeContext.Provider>
  );
}
