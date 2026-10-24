"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  createTheme,
  ThemeProvider as MuiThemeProvider,
  type Theme as MuiTheme,
} from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";

export type Theme = "light" | "dark";

export interface ThemePalette {
  brand: {
    300: string;
    400: string;
    500: string;
    600: string;
    700: string;
    950: string;
  };
  accent: {
    300: string;
    400: string;
    500: string;
    600: string;
  };
}

export const DOCKSIDE_KEEP_PALETTE: ThemePalette = {
  brand: {
    300: "#5eead4",
    400: "#2dd4bf",
    500: "#14b8a6",
    600: "#0d9488",
    700: "#0f766e",
    950: "#042f2e",
  },
  accent: {
    300: "#fcd34d",
    400: "#fbbf24",
    500: "#f59e0b",
    600: "#d97706",
  },
};

export function applyThemePaletteToDom(palette: ThemePalette) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  for (const [shade, hex] of Object.entries(palette.brand)) {
    root.style.setProperty(`--brand-${shade}`, hex);
  }
  for (const [shade, hex] of Object.entries(palette.accent)) {
    root.style.setProperty(`--accent-${shade}`, hex);
  }
}

export function createDocksideMuiTheme(
  mode: Theme,
  palette: ThemePalette = DOCKSIDE_KEEP_PALETTE
): MuiTheme {
  return createTheme({
    palette: {
      mode,
      primary: {
        light: palette.brand[400],
        main: mode === "dark" ? palette.brand[500] : palette.brand[600],
        dark: palette.brand[700],
        contrastText: "#ffffff",
      },
      secondary: {
        light: palette.accent[300],
        main: palette.accent[500],
        dark: palette.accent[600],
        contrastText: "#020617",
      },
      warning: {
        light: palette.accent[300],
        main: palette.accent[500],
        dark: palette.accent[600],
        contrastText: "#020617",
      },
      background: {
        default: mode === "dark" ? "#020617" : "#f8fafc",
        paper: mode === "dark" ? "#0f172a" : "#ffffff",
      },
    },
    shape: {
      borderRadius: 12,
    },
    typography: {
      fontFamily:
        'var(--font-inter), var(--font-heebo), system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      button: {
        textTransform: "none",
        fontWeight: 600,
      },
    },
    components: {
      MuiButton: {
        defaultProps: {
          disableElevation: true,
        },
        styleOverrides: {
          root: {
            borderRadius: "0.75rem",
            textTransform: "none",
            fontWeight: 600,
          },
        },
      },
      MuiPaper: {
        defaultProps: {
          elevation: 0,
        },
        styleOverrides: {
          root: {
            backgroundImage: "none",
          },
        },
      },
      MuiCard: {
        defaultProps: {
          elevation: 0,
        },
        styleOverrides: {
          root: {
            backgroundImage: "none",
            borderRadius: "1rem",
          },
        },
      },
    },
  });
}

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => Theme;
  palette: ThemePalette;
  setPalette: (palette: ThemePalette) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "dark",
  setTheme: () => {},
  toggleTheme: () => "dark",
  palette: DOCKSIDE_KEEP_PALETTE,
  setPalette: () => {},
});

export function ThemeProvider({
  children,
  initialPalette = DOCKSIDE_KEEP_PALETTE,
}: {
  children: React.ReactNode;
  initialPalette?: ThemePalette;
}) {
  const [theme, setThemeState] = useState<Theme>("dark");
  const [palette, setPaletteState] = useState<ThemePalette>(initialPalette);

  const muiTheme = useMemo(
    () => createDocksideMuiTheme(theme, palette),
    [theme, palette]
  );

  useEffect(() => {
    const saved = localStorage.getItem("docksidekeep-theme") as Theme | null;
    const initial: Theme = saved === "light" ? "light" : "dark";
    setThemeState(initial);
    document.documentElement.classList.toggle("dark", initial === "dark");
    applyThemePaletteToDom(palette);
  }, [palette]);

  const setTheme = (next: Theme) => {
    setThemeState(next);
    localStorage.setItem("docksidekeep-theme", next);
    document.documentElement.classList.toggle("dark", next === "dark");
  };

  const toggleTheme = (): Theme => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    return next;
  };

  const setPalette = (nextPalette: ThemePalette) => {
    setPaletteState(nextPalette);
    applyThemePaletteToDom(nextPalette);
  };

  return (
    <ThemeContext.Provider
      value={{ theme, setTheme, toggleTheme, palette, setPalette }}
    >
      <MuiThemeProvider theme={muiTheme}>
        <CssBaseline enableColorScheme />
        {children}
      </MuiThemeProvider>
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
