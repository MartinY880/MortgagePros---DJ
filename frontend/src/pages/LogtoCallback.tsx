import { useHandleSignInCallback } from '@logto/react';
import { useNavigate } from 'react-router-dom';

/**
 * Logto sign-in callback handler.
 *
 * Logto's redirect-based auth flow sends the user here after they
 * authenticate.  `useHandleSignInCallback` completes the OIDC code
 * exchange and establishes the local session.
 *
 * The post-login redirect destination is stored in sessionStorage
 * (key `logto_post_login_redirect`) before the sign-in redirect.
 */
export default function LogtoCallback() {
  const navigate = useNavigate();

  const { isLoading } = useHandleSignInCallback(() => {
    const redirectTarget = sessionStorage.getItem('logto_post_login_redirect') || '/';
    sessionStorage.removeItem('logto_post_login_redirect');
    navigate(redirectTarget, { replace: true });
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-spotify-dark flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-spotify-green mx-auto mb-4" />
          <div className="text-white text-lg font-semibold">Completing sign-in...</div>
        </div>
      </div>
    );
  }

  return null;
}
