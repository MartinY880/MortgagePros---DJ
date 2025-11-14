import { useState, useEffect } from 'react';
import { spotifyApi } from '../services/api';
import type { SpotifyDeviceInfo, ManagedPlaybackInfo } from '../types';

interface OutputDeviceSelectorProps {
  onDeviceSelected?: (deviceId: string | null) => void;
}

export default function OutputDeviceSelector({ onDeviceSelected }: OutputDeviceSelectorProps) {
  const [devices, setDevices] = useState<SpotifyDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [managedPlayback, setManagedPlayback] = useState<ManagedPlaybackInfo | null>(null);

  const loadDevices = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await spotifyApi.listDevices();
      const fallback: ManagedPlaybackInfo = { enabled: false, strategy: 'manual' };
      setManagedPlayback(response.data.managedPlayback ?? fallback);
      setDevices(response.data.devices || []);
      setSelectedDeviceId(response.data.selectedDeviceId || null);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to load devices');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDevices();
  }, []);

  const handleSelectDevice = async (deviceId: string) => {
    if (managedPlayback?.enabled) {
      return;
    }

    if (selecting) return;
    
    setSelecting(true);
    setError(null);
    try {
      await spotifyApi.selectDevice(deviceId);
      setSelectedDeviceId(deviceId);
      if (onDeviceSelected) {
        onDeviceSelected(deviceId);
      }
      // Reload devices to get updated state
      await loadDevices();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to select device');
    } finally {
      setSelecting(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-spotify-gray rounded-lg p-4">
        <div className="flex items-center gap-3">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-spotify-green"></div>
          <span className="text-gray-300 text-sm">Loading available devices...</span>
        </div>
      </div>
    );
  }

  if (managedPlayback?.enabled) {
    const deviceName = managedPlayback.deviceName || 'the managed Spotify Connect device';
    return (
      <div className="bg-spotify-gray rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-white font-semibold">Managed Playback Enabled</h3>
          <button
            onClick={() => void loadDevices()}
            className="text-xs text-spotify-green hover:text-spotify-hover"
            disabled={loading}
          >
            Refresh
          </button>
        </div>
        <p className="text-gray-300 text-sm">
          Playback is handled by the server through{' '}
          <span className="text-white font-semibold">{deviceName}</span>.
          No manual device selection is required.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-spotify-gray rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-white font-semibold">Audio Output Device</h3>
        <button
          onClick={loadDevices}
          className="text-xs text-spotify-green hover:text-spotify-hover"
          disabled={loading}
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-3 bg-red-600/20 border border-red-500 rounded p-2 text-red-200 text-xs">
          {error}
        </div>
      )}

      {devices.length === 0 ? (
        <div className="text-gray-400 text-sm">
          <p className="mb-2">No devices available. Make sure:</p>
          <ul className="list-disc list-inside text-xs space-y-1">
            <li>Spotify is open on your device</li>
            <li>Your device is connected to the same account</li>
            <li>Your device is online and active</li>
          </ul>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-gray-400 text-xs mb-2">
            Select where you want to hear the music:
          </p>
          {devices.map((device) => (
            <button
              key={device.id}
              onClick={() => handleSelectDevice(device.id)}
              disabled={selecting}
              className={`w-full text-left p-3 rounded-lg transition border ${
                selectedDeviceId === device.id
                  ? 'bg-spotify-green/20 border-spotify-green'
                  : 'bg-spotify-black border-transparent hover:border-spotify-green/50'
              } ${selecting ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white text-sm font-medium">{device.name}</p>
                  <p className="text-gray-400 text-xs capitalize">{device.type.toLowerCase()}</p>
                </div>
                {selectedDeviceId === device.id && (
                  <span className="text-spotify-green text-xs font-semibold">✓ Selected</span>
                )}
              </div>
              {device.is_active && (
                <p className="text-spotify-green text-xs mt-1">Currently active in Spotify</p>
              )}
            </button>
          ))}
        </div>
      )}

      <p className="text-gray-500 text-xs mt-3">
        The browser player only provides playback controls—audio comes from the device you pick here.
      </p>
    </div>
  );
}
