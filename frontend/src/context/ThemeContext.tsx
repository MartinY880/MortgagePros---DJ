import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { isEmbedded } from './IframeAuthContext';

export type ThemeMode = 'light' | 'dark';

interface ThemeState {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeState>({
  theme: 'dark',
  setTheme: () => {},
});

export const useTheme = () => useContext(ThemeContext);

function applyThemeToDOM(theme: ThemeMode) {
  const root = document.documentElement;
  if (theme === 'light') {
    root.classList.add('light');
    root.classList.remove('dark');
  } else {
    root.classList.add('dark');
    root.classList.remove('light');
  }
}

/**
 * Manages theme for the DJ app.
 *
 * - Standalone (not embedded): always dark
 * - Embedded in iframe: listens for parent postMessage theme instructions
 *   and applies light or dark accordingly
 *
 * The parent sends theme in two ways:
 *   1. With the token: { type: 'dj-app:token', ..., theme: 'light' | 'dark' }
 *   2. On toggle:      { type: 'dj-app:theme', theme: 'light' | 'dark' }
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>('dark');

  const setTheme = useCallback((t: ThemeMode) => {
    setThemeState(t);
    applyThemeToDOM(t);
  }, []);

  // Apply default on mount
  useEffect(() => {
    applyThemeToDOM(theme);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for parent theme messages when embedded
  useEffect(() => {
    if (!isEmbedded) return;

    const onMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== 'object') return;

      if (
        (data.type === 'dj-app:token' || data.type === 'dj-app:theme') &&
        (data.theme === 'light' || data.theme === 'dark')
      ) {
        setTheme(data.theme);
      }
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [setTheme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
