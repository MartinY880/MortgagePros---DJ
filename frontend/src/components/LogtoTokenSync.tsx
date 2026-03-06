import { useEffect } from 'react';
import { useLogto } from '@logto/react';
import { setLogtoTokenGetter } from '../services/logtoTokenStore';

/**
 * Invisible component that syncs the Logto SDK's `getAccessToken` function
 * into the global token store so non-React code (the Axios interceptor)
 * can obtain access tokens.
 *
 * Must be rendered inside <LogtoProvider>.
 */
export default function LogtoTokenSync({ apiResource }: { apiResource: string }) {
  const { getAccessToken } = useLogto();

  useEffect(() => {
    setLogtoTokenGetter(getAccessToken, apiResource);
  }, [getAccessToken, apiResource]);

  return null;
}
