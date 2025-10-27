import React from 'react';
import ReactDOM from 'react-dom/client';
import { SWRConfig } from 'swr';
import App from './App';
import './index.css';
import { apiFetcher } from './hooks/useApiSWR';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SWRConfig
      value={{
        fetcher: apiFetcher,
        revalidateOnFocus: false,
      }}
    >
      <App />
    </SWRConfig>
  </React.StrictMode>,
);
