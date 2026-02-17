export interface RecorderOptions {
  sessionId: string;
  tabStreamId: string;
  micDeviceId: string;
  muted: boolean;
  chunkMs: number;
  mimeType: string;
}

interface RecorderCallbacks {
  onChunk: (args: { sessionId: string; chunkIndex: number; blob: Blob; ts: number }) => Promise<void>;
  onStarted: (sessionId: string) => Promise<void>;
  onStopped: (sessionId: string) => Promise<void>;
  onError: (sessionId: string, error: string) => Promise<void>;
}

export class RecorderEngine {
  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private micStream: MediaStream | null = null;
  private chunkIndex = 0;

  constructor(private readonly callbacks: RecorderCallbacks) {}

  private async captureTabFromStreamId(tabStreamId: string): Promise<MediaStream> {
    return navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: tabStreamId
        }
      } as any,
      video: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: tabStreamId,
          maxFrameRate: 30
        }
      } as any
    });
  }

  async start(opts: RecorderOptions): Promise<boolean> {
    try {
      this.chunkIndex = 0;
      const tabStream = await this.captureTabFromStreamId(opts.tabStreamId);
      let micTrack: MediaStreamTrack | null = null;

      try {
        this.micStream = await navigator.mediaDevices.getUserMedia({
          audio: opts.micDeviceId && opts.micDeviceId !== 'default' ? { deviceId: { exact: opts.micDeviceId } } : true,
          video: false
        });
        micTrack = this.micStream.getAudioTracks()[0] || null;
      } catch {
        micTrack = null;
      }

      const tracks = [...tabStream.getVideoTracks(), ...tabStream.getAudioTracks()];
      if (micTrack) {
        micTrack.enabled = !opts.muted;
        tracks.push(micTrack);
      }

      this.stream = new MediaStream(tracks);
      const mimeType = MediaRecorder.isTypeSupported(opts.mimeType) ? opts.mimeType : 'video/webm';
      this.recorder = new MediaRecorder(this.stream, { mimeType });

      this.recorder.ondataavailable = async (event) => {
        if (!event.data || event.data.size <= 0) return;
        await this.callbacks.onChunk({ sessionId: opts.sessionId, chunkIndex: this.chunkIndex++, blob: event.data, ts: Date.now() });
      };
      this.recorder.onerror = async (event) => this.callbacks.onError(opts.sessionId, event.error?.message || 'MediaRecorder error');
      this.recorder.onstart = async () => this.callbacks.onStarted(opts.sessionId);
      this.recorder.onstop = async () => {
        this.stopTracks();
        await this.callbacks.onStopped(opts.sessionId);
      };
      this.recorder.start(opts.chunkMs);
      return true;
    } catch (error) {
      await this.callbacks.onError(opts.sessionId, error instanceof Error ? error.message : String(error));
      this.stopTracks();
      return false;
    }
  }

  pause(): void {
    if (this.recorder?.state === 'recording') this.recorder.pause();
  }

  resume(): void {
    if (this.recorder?.state === 'paused') this.recorder.resume();
  }

  setMute(muted: boolean): void {
    const micTrack = this.micStream?.getAudioTracks()[0];
    if (micTrack) micTrack.enabled = !muted;
  }

  stop(): void {
    if (this.recorder && this.recorder.state !== 'inactive') {
      this.recorder.stop();
      return;
    }
    this.stopTracks();
  }

  private stopTracks(): void {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.micStream?.getTracks().forEach((track) => track.stop());
  }
}
