// Spotify Web Playback SDK service
// This allows the browser to become a Spotify playback device

declare global {
  interface Window {
    onSpotifyWebPlaybackSDKReady: () => void;
    Spotify: {
      Player: new (options: {
        name: string;
        getOAuthToken: (cb: (token: string) => void) => void;
        volume: number;
      }) => SpotifyPlayer;
    };
  }
}

interface SpotifyPlayer {
  connect(): Promise<boolean>;
  disconnect(): void;
  addListener(event: string, callback: (data: any) => void): void;
  removeListener(event: string, callback?: (data: any) => void): void;
  getCurrentState(): Promise<any>;
  setName(name: string): Promise<void>;
  getVolume(): Promise<number>;
  setVolume(volume: number): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  togglePlay(): Promise<void>;
  seek(position_ms: number): Promise<void>;
  previousTrack(): Promise<void>;
  nextTrack(): Promise<void>;
  activateElement(): Promise<void>;
  _options: {
    name: string;
    getOAuthToken: (cb: (token: string) => void) => void;
    volume: number;
  };
}

interface WebPlaybackState {
  paused: boolean;
  position: number;
  duration: number;
  track_window: {
    current_track: {
      id: string;
      name: string;
      artists: { name: string }[];
      album: { name: string; images: { url: string }[] };
      duration_ms: number;
    };
  };
}

interface WebPlaybackError {
  message: string;
}

export class WebPlaybackService {
  private player: SpotifyPlayer | null = null;
  private deviceId: string | null = null;
  private getToken: (() => Promise<string>) | null = null;
  private onDeviceReady: ((deviceId: string) => void) | null = null;
  private onStateChange: ((state: WebPlaybackState | null) => void) | null = null;
  private sdkReady: boolean = false;
  private initializePromise: Promise<void> | null = null;

  constructor() {
    // Set up SDK ready callback
    if (typeof window !== 'undefined') {
      window.onSpotifyWebPlaybackSDKReady = () => {
        this.sdkReady = true;
      };
    }
  }

  async initialize(
    deviceName: string,
    getTokenFn: () => Promise<string>,
    onReady?: (deviceId: string) => void,
    onStateChangeFn?: (state: WebPlaybackState | null) => void
  ): Promise<string | null> {
    // Return existing initialization if in progress
    if (this.initializePromise) {
      await this.initializePromise;
      return this.deviceId;
    }

    this.initializePromise = this._initialize(deviceName, getTokenFn, onReady, onStateChangeFn);
    await this.initializePromise;
    return this.deviceId;
  }

  private async _initialize(
    deviceName: string,
    getTokenFn: () => Promise<string>,
    onReady?: (deviceId: string) => void,
    onStateChangeFn?: (state: WebPlaybackState | null) => void
  ): Promise<void> {
    this.getToken = getTokenFn;
    this.onDeviceReady = onReady || null;
    this.onStateChange = onStateChangeFn || null;

    // Wait for SDK to be ready
    await this.waitForSDK();

    if (!window.Spotify) {
      throw new Error('Spotify Web Playback SDK not loaded');
    }

    // Create player
    this.player = new window.Spotify.Player({
      name: deviceName,
      getOAuthToken: async (cb) => {
        if (this.getToken) {
          const token = await this.getToken();
          cb(token);
        }
      },
      volume: 0.8,
    });

    // Set up event listeners
    this.setupListeners();

    // Connect to the player
    const connected = await this.player.connect();
    if (!connected) {
      throw new Error('Failed to connect to Spotify Web Playback');
    }
  }

  private waitForSDK(): Promise<void> {
    return new Promise((resolve) => {
      if (this.sdkReady && window.Spotify) {
        resolve();
        return;
      }

      const checkInterval = setInterval(() => {
        if (this.sdkReady && window.Spotify) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);

      // Timeout after 10 seconds
      setTimeout(() => {
        clearInterval(checkInterval);
        if (!this.sdkReady || !window.Spotify) {
          console.error('Spotify SDK failed to load');
        }
        resolve();
      }, 10000);
    });
  }

  private setupListeners() {
    if (!this.player) return;

    // Ready
    this.player.addListener('ready', ({ device_id }: { device_id: string }) => {
      console.log('Web Playback SDK ready with device ID:', device_id);
      this.deviceId = device_id;
      if (this.onDeviceReady) {
        this.onDeviceReady(device_id);
      }
    });

    // Not Ready
    this.player.addListener('not_ready', ({ device_id }: { device_id: string }) => {
      console.log('Web Playback SDK device has gone offline:', device_id);
      this.deviceId = null;
    });

    // Errors
    this.player.addListener('initialization_error', ({ message }: WebPlaybackError) => {
      console.error('Initialization Error:', message);
    });

    this.player.addListener('authentication_error', ({ message }: WebPlaybackError) => {
      console.error('Authentication Error:', message);
    });

    this.player.addListener('account_error', ({ message }: WebPlaybackError) => {
      console.error('Account Error:', message);
    });

    this.player.addListener('playback_error', ({ message }: WebPlaybackError) => {
      console.error('Playback Error:', message);
    });

    // State changes
    this.player.addListener('player_state_changed', (state: WebPlaybackState | null) => {
      if (this.onStateChange) {
        this.onStateChange(state);
      }
    });
  }

  getDeviceId(): string | null {
    return this.deviceId;
  }

  async disconnect() {
    if (this.player) {
      this.player.disconnect();
      this.player = null;
      this.deviceId = null;
    }
    this.initializePromise = null;
  }

  async getCurrentState(): Promise<WebPlaybackState | null> {
    if (!this.player) return null;
    return this.player.getCurrentState();
  }

  async resume() {
    if (this.player) {
      await this.player.resume();
    }
  }

  async pause() {
    if (this.player) {
      await this.player.pause();
    }
  }

  async nextTrack() {
    if (this.player) {
      await this.player.nextTrack();
    }
  }
}

export const webPlaybackService = new WebPlaybackService();
