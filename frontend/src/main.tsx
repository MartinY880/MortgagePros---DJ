import React from 'react';
import ReactDOM from 'react-dom/client';
import { SWRConfig } from 'swr';
import { ClerkProvider } from '@clerk/clerk-react';
import App from './App';
import './index.css';
import { apiFetcher } from './hooks/useApiSWR';
import { loadAppConfig } from './config/appConfig';
import { configureFrontendApi } from './services/api';
import { AppConfigContext } from './context/AppConfigContext';

const rootElement = document.getElementById('root');

async function bootstrap() {
  if (!rootElement) {
    throw new Error('Root element not found');
  }

  try {
    const appConfig = await loadAppConfig();

    configureFrontendApi({
      apiBaseUrl: appConfig.apiBaseUrl,
      socketUrl: appConfig.socketUrl,
    });

    ReactDOM.createRoot(rootElement).render(
      <React.StrictMode>
        <ClerkProvider publishableKey={appConfig.clerkPublishableKey} afterSignOutUrl="/">
          <AppConfigContext.Provider value={appConfig}>
            <SWRConfig
              value={{
                fetcher: apiFetcher,
                revalidateOnFocus: false,
              }}
            >
              <App />
            </SWRConfig>
          </AppConfigContext.Provider>
        </ClerkProvider>
      </React.StrictMode>,
    );
  } catch (error) {
    console.error('Failed to bootstrap application:', error);
    rootElement.innerHTML = `
      <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0d1117;color:#f87171;font-family:system-ui,sans-serif;padding:1.5rem;text-align:center;">
        <div>
          <h1 style="font-size:1.5rem;margin-bottom:0.75rem;">Application configuration error</h1>
          <p style="color:#fca5a5;max-width:28rem;">${(error as Error).message || 'Failed to load configuration. Please retry later.'}</p>
        </div>
      </div>
    `;
  }
}

void bootstrap();
