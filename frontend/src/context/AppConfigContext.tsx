import { createContext, useContext } from 'react';
import type { AppConfig } from '../config/appConfig';

export const AppConfigContext = createContext<AppConfig | null>(null);

export function useAppConfig() {
  const context = useContext(AppConfigContext);

  if (!context) {
    throw new Error('useAppConfig must be used within an AppConfigContext.Provider');
  }

  return context;
}
