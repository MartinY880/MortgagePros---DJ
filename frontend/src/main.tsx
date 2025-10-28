import React from 'react';
import ReactDOM from 'react-dom/client';
import { SWRConfig } from 'swr';
import { ClerkProvider } from '@clerk/clerk-react';
import App from './App';
import './index.css';
import { apiFetcher } from './hooks/useApiSWR';

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!clerkPublishableKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY environment variable.');
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ClerkProvider publishableKey={clerkPublishableKey} afterSignOutUrl="/">
      <SWRConfig
        value={{
          fetcher: apiFetcher,
          revalidateOnFocus: false,
        }}
      >
        <App />
      </SWRConfig>
    </ClerkProvider>
  </React.StrictMode>,
);
