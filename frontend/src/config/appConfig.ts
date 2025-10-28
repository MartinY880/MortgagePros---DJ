export interface AppConfig {
  apiBaseUrl: string;
  socketUrl: string;
  clerkPublishableKey: string;
}

let cachedConfig: AppConfig | null = null;

const deriveSocketUrl = (apiBaseUrl: string) => {
  if (!apiBaseUrl) {
    return window.location.origin;
  }

  if (apiBaseUrl.endsWith('/api')) {
    return apiBaseUrl.slice(0, -4);
  }

  return apiBaseUrl;
};

const normalizeUrl = (url: string) => (url === '/' ? '/' : url.replace(/\/+$/, ''));

const configSources: Array<{ url: string; credentials?: RequestCredentials }> = [
  { url: '/app-config.json', credentials: 'same-origin' },
  { url: '/api/config', credentials: 'include' },
];

export async function loadAppConfig(): Promise<AppConfig> {
  if (cachedConfig) {
    return cachedConfig;
  }

  let data: Partial<AppConfig> | null = null;
  let lastError: Error | null = null;

  for (const source of configSources) {
    try {
      const response = await fetch(source.url, {
        credentials: source.credentials,
        cache: 'no-store',
      });

      if (!response.ok) {
        lastError = new Error(`Failed to load configuration from ${source.url} (${response.status})`);
        continue;
      }

      const payload = await response.json();
      data = payload as Partial<AppConfig>;
      break;
    } catch (error) {
      lastError = error as Error;
      console.warn(`Unable to load config from ${source.url}:`, error);
    }
  }

  if (!data) {
    throw lastError ?? new Error('Unable to load application configuration');
  }

  const apiBaseUrl = data.apiBaseUrl ? normalizeUrl(data.apiBaseUrl) : '/api';
  const socketUrl = data.socketUrl ? normalizeUrl(data.socketUrl) : deriveSocketUrl(apiBaseUrl);
  const clerkPublishableKey = data.clerkPublishableKey;

  if (!clerkPublishableKey) {
    throw new Error('Missing Clerk publishable key in application configuration');
  }

  cachedConfig = {
    apiBaseUrl,
    socketUrl,
    clerkPublishableKey,
  };

  if (typeof window !== 'undefined') {
    (window as any).__APP_CONFIG__ = cachedConfig;
  }

  return cachedConfig;
}

export function getAppConfig(): AppConfig {
  if (!cachedConfig) {
    throw new Error('Application configuration has not been loaded yet');
  }

  return cachedConfig;
}
