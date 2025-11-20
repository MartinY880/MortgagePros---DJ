import { useEffect, useState, useRef } from 'react';
import { webPlaybackService } from '../services/webPlayback';
import api from '../services/api';

interface WebPlayerProps {
  sessionId?: string;
  onDeviceReady?: (deviceId: string) => void;
}

export default function WebPlayer({ sessionId, onDeviceReady }: WebPlayerProps) {
  const [isActive, setIsActive] = useState(false);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const initializeAttempted = useRef(false);

  useEffect(() => {
    // Only initialize once
    if (initializeAttempted.current) return;
    initializeAttempted.current = true;

    const initializePlayer = async () => {
      try {
        const getToken = async () => {
          const response = await api.get('/spotify/token');
          return response.data.accessToken;
        };

        const deviceName = sessionId 
          ? `MTGPros DJ - Session ${sessionId.slice(0, 8)}`
          : 'MTGPros DJ - Web Player';

        await webPlaybackService.initialize(
          deviceName,
          getToken,
          async (id) => {
            console.log('Web player ready with device ID:', id);
            setDeviceId(id);
            setIsActive(true);
            
            // Wait a bit for Spotify to fully register the device before auto-selecting
            if (onDeviceReady) {
              setTimeout(() => {
                console.log('Calling onDeviceReady with delay...');
                onDeviceReady(id);
              }, 2000); // 2 second delay to let Spotify register the device
            }
          },
          (state) => {
            // Handle playback state changes if needed
            console.log('Playback state:', state);
          }
        );
      } catch (err: any) {
        console.error('Failed to initialize web player:', err);
        setError(err.message || 'Failed to initialize web player');
        setIsActive(false);
      }
    };

    initializePlayer();

    // Cleanup on unmount
    return () => {
      webPlaybackService.disconnect();
    };
  }, []); // Empty dependency array - only run once

  if (error) {
    return (
      <div className="bg-red-600/20 border border-red-500 rounded-lg p-4 text-sm">
        <p className="text-red-200">
          <strong>Web Player Error:</strong> {error}
        </p>
        <p className="text-red-300 text-xs mt-2">
          Make sure you have Spotify Premium and browser permissions are granted.
        </p>
      </div>
    );
  }

  if (!isActive || !deviceId) {
    return (
      <div className="bg-spotify-gray rounded-lg p-4 text-sm text-gray-300">
        <div className="flex items-center gap-3">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-spotify-green"></div>
          <span>Initializing web player...</span>
        </div>
      </div>
    );
  }

  return null;
}
