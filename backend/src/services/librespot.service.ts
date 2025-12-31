export type QueueOptions = {
  autoTransfer?: boolean;
};

class LibrespotService {
  isEnabled() {
    return false;
  }

  async ensureDevice(_userId: string, _accessToken: string): Promise<string | null> {
    return null;
  }

  async transferPlayback(_userId: string, _accessToken: string, _play = false): Promise<boolean> {
    return false;
  }

  async queueTrack(_userId: string, _accessToken: string, _trackUri: string, _options?: QueueOptions) {
    return;
  }
}

export const librespotService = new LibrespotService();
