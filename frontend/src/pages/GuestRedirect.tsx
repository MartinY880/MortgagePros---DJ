import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { sessionApi } from '../services/api';

export default function GuestRedirect() {
  const { sessionCode } = useParams<{ sessionCode: string }>();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const resolveSession = async () => {
      if (!sessionCode) {
        setError('Missing session code');
        return;
      }

      try {
        const { data } = await sessionApi.getByCode(sessionCode);
        if (!active) return;
        const sessionId = data.session?.id;

        if (sessionId) {
          navigate(`/session/${sessionId}`, { replace: true, state: { fromInvite: true } });
        } else {
          setError('Session not found');
        }
      } catch (err) {
        if (!active) return;
        setError('Session not found or inactive.');
      }
    };

    resolveSession();

    return () => {
      active = false;
    };
  }, [sessionCode, navigate]);

  if (error) {
    return (
      <div className="min-h-screen bg-spotify-dark flex flex-col items-center justify-center text-center p-6 text-white">
        <h1 className="text-3xl font-bold mb-4">Invite Link Error</h1>
        <p className="text-gray-300 mb-6">{error}</p>
        <button
          onClick={() => navigate('/')}
          className="bg-spotify-green hover:bg-spotify-hover text-white px-6 py-3 rounded-lg font-semibold"
        >
          Go to Home
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-spotify-dark flex flex-col items-center justify-center text-center text-white p-6">
      <h1 className="text-2xl font-bold mb-3">Joining Session…</h1>
      <p className="text-gray-300">Hold tight while we connect you to the party.</p>
    </div>
  );
}
