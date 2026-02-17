export class RecorderEngine {
  constructor({ onChunk, onStarted, onStopped, onError }) {
    this.onChunk = onChunk;
    this.onStarted = onStarted;
    this.onStopped = onStopped;
    this.onError = onError;
    this.recorder = null;
    this.stream = null;
    this.micStream = null;
    this.chunkIndex = 0;
  }

  async captureTabFromStreamId(tabStreamId) {
    return navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: tabStreamId
        }
      },
      video: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: tabStreamId,
          maxFrameRate: 30
        }
      }
    });
  }

  async start(opts) {
    try {
      this.chunkIndex = 0;
      const tabStream = await this.captureTabFromStreamId(opts.tabStreamId);
      if (!tabStream) throw new Error('Unable to capture tab stream from stream ID.');

      let micTrack = null;
      try {
        this.micStream = await navigator.mediaDevices.getUserMedia({
          audio: opts.micDeviceId && opts.micDeviceId !== 'default'
            ? { deviceId: { exact: opts.micDeviceId } }
            : true,
          video: false
        });
        micTrack = this.micStream.getAudioTracks()[0] || null;
      } catch (_err) {
        // microphone optional in MVP
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
        await this.onChunk({ chunkIndex: this.chunkIndex++, blob: event.data, ts: Date.now() });
      };
      this.recorder.onerror = (event) => this.onError(event.error?.message || 'MediaRecorder error');
      this.recorder.onstart = () => this.onStarted();
      this.recorder.onstop = () => {
        this.stopTracks();
        this.onStopped();
      };

      this.recorder.start(opts.chunkMs);
    } catch (error) {
      this.onError(error.message || String(error));
    }
  }

  pause() {
    if (this.recorder?.state === 'recording') this.recorder.pause();
  }

  resume() {
    if (this.recorder?.state === 'paused') this.recorder.resume();
  }

  setMute(muted) {
    const micTrack = this.micStream?.getAudioTracks?.()[0];
    if (micTrack) micTrack.enabled = !muted;
  }

  stop() {
    if (this.recorder && this.recorder.state !== 'inactive') {
      this.recorder.stop();
      return;
    }
    this.stopTracks();
    this.onStopped();
  }

  stopTracks() {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.micStream?.getTracks().forEach((track) => track.stop());
  }
}
