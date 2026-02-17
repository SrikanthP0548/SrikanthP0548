export class RecorderEngine {
    callbacks;
    recorder = null;
    stream = null;
    micStream = null;
    chunkIndex = 0;
    constructor(callbacks) {
        this.callbacks = callbacks;
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
            let micTrack = null;
            try {
                this.micStream = await navigator.mediaDevices.getUserMedia({
                    audio: opts.micDeviceId && opts.micDeviceId !== 'default' ? { deviceId: { exact: opts.micDeviceId } } : true,
                    video: false
                });
                micTrack = this.micStream.getAudioTracks()[0] || null;
            }
            catch {
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
                if (!event.data || event.data.size <= 0)
                    return;
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
        }
        catch (error) {
            await this.callbacks.onError(opts.sessionId, error instanceof Error ? error.message : String(error));
            this.stopTracks();
            return false;
        }
    }
    pause() {
        if (this.recorder?.state === 'recording')
            this.recorder.pause();
    }
    resume() {
        if (this.recorder?.state === 'paused')
            this.recorder.resume();
    }
    setMute(muted) {
        const micTrack = this.micStream?.getAudioTracks()[0];
        if (micTrack)
            micTrack.enabled = !muted;
    }
    stop() {
        if (this.recorder && this.recorder.state !== 'inactive') {
            this.recorder.stop();
            return;
        }
        this.stopTracks();
    }
    stopTracks() {
        this.stream?.getTracks().forEach((track) => track.stop());
        this.micStream?.getTracks().forEach((track) => track.stop());
    }
}
