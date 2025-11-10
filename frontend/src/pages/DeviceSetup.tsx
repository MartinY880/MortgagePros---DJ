import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser } from '@clerk/clerk-react';
import { useApiSWR } from '../hooks/useApiSWR';
import { SpotifyDeviceInfo, User } from '../types';
import { spotifyApi } from '../services/api';

interface DevicesResponse {
  devices: SpotifyDeviceInfo[];
  selectedDeviceId: string | null;
  librespotEnabled?: boolean;
  librespotDeviceName?: string;
}

export default function DeviceSetup() {
  const navigate = useNavigate();
  const { isLoaded, isSignedIn } = useUser();
  const [selectingId, setSelectingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const {
    data: userData,
    error: userError,
    isLoading: userLoading,
    mutate: mutateUser,
  } = useApiSWR<{ user: User }>(isSignedIn ? '/auth/me' : null, {
    shouldRetryOnError: false,
  });

  const {
    data: devicesData,
    error: devicesError,
    isLoading: devicesLoading,
    mutate: mutateDevices,
  } = useApiSWR<DevicesResponse>(isSignedIn ? '/spotify/devices' : null, {
    shouldRetryOnError: false,
  });

  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    if (!isSignedIn) {
      navigate('/', { replace: true });
    }
  }, [isLoaded, isSignedIn, navigate]);

  useEffect(() => {
    if (userError?.response?.status === 401) {
      navigate('/', { replace: true });
    }
  }, [userError, navigate]);

  const selectedDeviceId = useMemo(() => devicesData?.selectedDeviceId ?? null, [devicesData]);
  const librespotEnabled = useMemo(() => devicesData?.librespotEnabled ?? false, [devicesData]);
  const librespotDeviceName = useMemo(() => devicesData?.librespotDeviceName ?? 'Managed Device', [devicesData]);

  const handleRefreshDevices = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);
    await mutateDevices();
  };

  const handleSelectDevice = async (deviceId: string) => {
    setSelectingId(deviceId);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await spotifyApi.selectDevice(deviceId);
      await Promise.all([mutateDevices(), mutateUser()]);
      setSuccessMessage('Playback device updated. Redirecting you to the dashboard…');
      setTimeout(() => navigate('/dashboard', { replace: true }), 1200);
    } catch (error: any) {
      const message = error?.response?.data?.error || error?.message || 'Failed to select device';
      setErrorMessage(message);
    } finally {
      setSelectingId(null);
    }
  };

  const handleContinue = () => {
    navigate('/dashboard');
  };

  const showLoading = userLoading || devicesLoading || !isLoaded;
  const user = userData?.user;
  const deviceList = devicesData?.devices ?? [];
  const managedReceiverActive = Boolean(user?.playbackDeviceId) && !devicesData;

  return (
    <div className="min-h-screen bg-spotify-dark text-white">
      <div className="max-w-4xl mx-auto px-6 py-12">
        <header className="mb-10">
          <h1 className="text-3xl font-bold">Select Your Spotify Playback Device</h1>
          <p className="text-gray-300 mt-2">
            Pick the device that should receive playback from MTGPros DJ. Make sure the device is powered on, open in Spotify, and on the same Spotify account that you used to sign in.
          </p>
        </header>

        {showLoading && (
          <div className="bg-spotify-gray rounded-xl p-6 text-gray-300">Loading your Spotify devices…</div>
        )}

        {!showLoading && devicesError && (
          <div className="bg-red-600/20 border border-red-500 rounded-xl p-6 text-red-200">
            <p className="font-semibold mb-2">We couldn&apos;t load your devices.</p>
            <p className="text-sm text-red-100 mb-4">
              {devicesError.response?.data?.error || devicesError.message || 'Check that Spotify is reachable and try again.'}
            </p>
            <button
              onClick={handleRefreshDevices}
              className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg"
            >
              Retry
            </button>
          </div>
        )}

        {!showLoading && !devicesError && librespotEnabled && (
          <div className="space-y-6">
            <div className="bg-spotify-green/10 border border-spotify-green rounded-xl p-6">
              <h2 className="text-xl font-semibold text-spotify-green mb-3">Managed Playback Active</h2>
              <p className="text-gray-200 mb-4">
                This server is using a managed Spotify Connect receiver called <span className="font-semibold text-white">{librespotDeviceName}</span>.
              </p>
              <p className="text-sm text-gray-300 mb-6">
                Playback is automatically handled by the system. You don&apos;t need to select a device manually.
              </p>
              <button
                onClick={handleContinue}
                className="bg-spotify-green hover:bg-spotify-hover text-white px-6 py-3 rounded-lg font-semibold"
              >
                Continue to Dashboard
              </button>
            </div>

            <div className="bg-spotify-gray rounded-xl p-6 text-sm text-gray-300">
              <p className="text-white font-semibold mb-2">How does this work?</p>
              <ul className="list-disc list-inside space-y-2">
                <li>The server runs its own dedicated Spotify Connect receiver</li>
                <li>Songs are automatically played through this managed device</li>
                <li>You can find &quot;{librespotDeviceName}&quot; in your Spotify Connect devices list</li>
                <li>No need to keep Spotify open on your phone or computer</li>
              </ul>
            </div>
          </div>
        )}

        {!showLoading && !devicesError && !librespotEnabled && (
          <div className="space-y-6">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-xl font-semibold">Available Devices</h2>
              <div className="flex gap-3">
                <button
                  onClick={handleRefreshDevices}
                  className="bg-spotify-gray hover:bg-gray-700 text-white px-4 py-2 rounded-lg"
                >
                  Refresh
                </button>
                {user?.playbackDeviceId && (
                  <button
                    onClick={handleContinue}
                    className="bg-spotify-green hover:bg-spotify-hover text-white px-4 py-2 rounded-lg"
                  >
                    Continue to Dashboard
                  </button>
                )}
              </div>
            </div>

            {deviceList.length === 0 && (
              <div className="bg-spotify-gray rounded-xl p-6 text-gray-300">
                <p className="font-semibold text-white mb-2">No active devices found.</p>
                <ul className="list-disc list-inside text-sm space-y-2 text-gray-300">
                  <li>Open Spotify on the device you want to use.</li>
                  <li>Start playing audio briefly to wake the device (then pause).</li>
                  <li>Return here and click Refresh.</li>
                </ul>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {deviceList.map((device) => {
                const isSelected = selectedDeviceId === device.id || user?.playbackDeviceId === device.id;
                return (
                  <button
                    key={device.id}
                    onClick={() => handleSelectDevice(device.id)}
                    disabled={selectingId === device.id}
                    className={`text-left bg-spotify-gray rounded-xl p-5 transition border ${
                      isSelected ? 'border-spotify-green shadow-lg shadow-spotify-green/20' : 'border-transparent hover:border-spotify-green/50'
                    } ${selectingId === device.id ? 'opacity-70 cursor-progress' : 'cursor-pointer'}`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-lg font-semibold text-white">{device.name}</p>
                        <p className="text-sm text-gray-300 capitalize">{device.type.toLowerCase()}</p>
                      </div>
                      {isSelected && (
                        <span className="text-spotify-green text-sm font-semibold">Selected</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-3">
                      {device.is_active ? 'Currently active in Spotify' : 'Available for connection'}
                    </p>
                  </button>
                );
              })}
            </div>

            {errorMessage && (
              <div className="bg-red-600/20 border border-red-500 rounded-lg p-4 text-red-200">
                {errorMessage}
              </div>
            )}

            {successMessage && (
              <div className="bg-spotify-green/10 border border-spotify-green rounded-lg p-4 text-spotify-green">
                {successMessage}
              </div>
            )}

            {!managedReceiverActive && (
              <div className="bg-spotify-gray rounded-xl p-6 text-sm text-gray-300">
                <p className="text-white font-semibold mb-2">Need help?</p>
                <ul className="list-disc list-inside space-y-2">
                  <li>Spotify devices only appear if they are online and logged in to the same account.</li>
                  <li>For smart speakers, open the Spotify app and pick the speaker once before returning.</li>
                  <li>If you want to connect a new device, sign into Spotify on that device first.</li>
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
