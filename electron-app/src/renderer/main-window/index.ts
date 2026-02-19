/// <reference path="../../shared/logix-api.d.ts" />

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

// ─── Elements ─────────────────────────────────────────────
const setupScreen = $('#setup-screen') as HTMLDivElement;
const recordingScreen = $('#recording-screen') as HTMLDivElement;
const completedScreen = $('#completed-screen') as HTMLDivElement;

const titleInput = $('#title-input') as HTMLInputElement;
const descInput = $('#desc-input') as HTMLTextAreaElement;
const sourceList = $('#source-list') as HTMLDivElement;
const refreshBtn = $('#refresh-sources') as HTMLButtonElement;
const micSelect = $('#mic-select') as HTMLSelectElement;
const startBtn = $('#start-btn') as HTMLButtonElement;
const errorMsg = $('#error-msg') as HTMLDivElement;

const statusText = $('#status-text') as HTMLSpanElement;
const durationText = $('#duration-text') as HTMLSpanElement;
const chunksText = $('#chunks-text') as HTMLSpanElement;
const sizeText = $('#size-text') as HTMLSpanElement;
const pauseBtn = $('#pause-btn') as HTMLButtonElement;
const resumeBtn = $('#resume-btn') as HTMLButtonElement;
const stopBtn = $('#stop-btn') as HTMLButtonElement;
const muteBtn = $('#mute-btn') as HTMLButtonElement;

const savedPath = $('#saved-path') as HTMLParagraphElement;
const newBtn = $('#new-btn') as HTMLButtonElement;

// ─── State ────────────────────────────────────────────────
let selectedSourceId: string | null = null;
let mediaRecorder: MediaRecorder | null = null;
let chunkIndex = 0;
let micStream: MediaStream | null = null;
let combinedStream: MediaStream | null = null;
let durationTimer: ReturnType<typeof setInterval> | null = null;
let durationSec = 0;

// ─── Source picker ────────────────────────────────────────
async function loadSources(): Promise<void> {
  const sources = await window.logix.getSources();
  sourceList.innerHTML = '';
  selectedSourceId = null;
  updateStartBtn();

  for (const src of sources) {
    const div = document.createElement('div');
    div.className = 'source-item';
    div.dataset.sourceId = src.id;
    div.innerHTML = `<img src="${src.thumbnailDataUrl}" /><span>${src.name}</span>`;
    div.addEventListener('click', () => {
      document.querySelectorAll('.source-item').forEach((el) => el.classList.remove('selected'));
      div.classList.add('selected');
      selectedSourceId = src.id;
      updateStartBtn();
    });
    sourceList.appendChild(div);
  }
}

// ─── Mic picker ───────────────────────────────────────────
async function loadMics(): Promise<void> {
  try {
    // Need permission first
    const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    tempStream.getTracks().forEach((t) => t.stop());

    const devices = await navigator.mediaDevices.enumerateDevices();
    const mics = devices.filter((d) => d.kind === 'audioinput');
    micSelect.innerHTML = '<option value="">No microphone</option>';
    for (const mic of mics) {
      const opt = document.createElement('option');
      opt.value = mic.deviceId;
      opt.textContent = mic.label || `Mic ${mic.deviceId.slice(0, 8)}`;
      micSelect.appendChild(opt);
    }
    // Select default
    if (mics.length > 0) micSelect.value = mics[0].deviceId;
  } catch {
    // No mic permission — that's fine
  }
}

function updateStartBtn(): void {
  const hasTitle = titleInput.value.trim().length >= 3;
  const hasSource = !!selectedSourceId;
  startBtn.disabled = !(hasTitle && hasSource);
}

// ─── Recording ────────────────────────────────────────────
async function startRecording(): Promise<void> {
  if (!selectedSourceId) return;
  errorMsg.hidden = true;

  try {
    const payload = {
      sourceId: selectedSourceId,
      micDeviceId: micSelect.value || '',
      metadata: {
        title: titleInput.value.trim(),
        description: descInput.value.trim(),
      },
      mimeType: 'video/webm;codecs=vp9,opus',
      chunkMs: 5000,
    };

    const result = await window.logix.startRecording(payload);
    if (!result.ok) throw new Error('Failed to start session');

    // Get screen stream via desktopCapturer constraint
    const screenStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: selectedSourceId,
        },
      } as any,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: selectedSourceId,
          maxFrameRate: 30,
        },
      } as any,
    });

    // Get mic stream if selected
    const tracks = [...screenStream.getTracks()];
    if (micSelect.value) {
      try {
        micStream = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: { exact: micSelect.value } },
        });
        tracks.push(...micStream.getAudioTracks());
      } catch {
        // mic unavailable, continue without
      }
    }

    combinedStream = new MediaStream(tracks);

    // Start MediaRecorder
    chunkIndex = 0;
    mediaRecorder = new MediaRecorder(combinedStream, {
      mimeType: 'video/webm;codecs=vp9,opus',
    });

    mediaRecorder.ondataavailable = async (e) => {
      if (e.data.size > 0) {
        const buffer = await e.data.arrayBuffer();
        window.logix.saveChunk({ chunkIndex, buffer, size: e.data.size });
        chunkIndex++;
      }
    };

    mediaRecorder.onstop = async () => {
      stopDurationTimer();
      cleanupStreams();
      const res = await window.logix.finalizeRecording();
      if (res.ok) {
        showScreen('completed');
        savedPath.textContent = `Saved to: ${res.outputDir}`;
      }
    };

    mediaRecorder.onerror = (e: any) => {
      window.logix.notifyRecordingError(e.error?.message || 'MediaRecorder error');
    };

    mediaRecorder.start(payload.chunkMs);
    window.logix.notifyRecordingStarted();
    showScreen('recording');
    startDurationTimer();
  } catch (err: any) {
    errorMsg.textContent = err.message || 'Failed to start recording';
    errorMsg.hidden = false;
    window.logix.notifyRecordingError(err.message || 'Start failed');
  }
}

function cleanupStreams(): void {
  combinedStream?.getTracks().forEach((t) => t.stop());
  micStream?.getTracks().forEach((t) => t.stop());
  combinedStream = null;
  micStream = null;
  mediaRecorder = null;
}

async function stopRecording(): Promise<void> {
  await window.logix.stopRecording();
  mediaRecorder?.stop();
}

async function pauseRecording(): Promise<void> {
  mediaRecorder?.pause();
  await window.logix.pauseRecording();
  pauseBtn.hidden = true;
  resumeBtn.hidden = false;
  stopDurationTimer();
}

async function resumeRecording(): Promise<void> {
  mediaRecorder?.resume();
  await window.logix.resumeRecording();
  pauseBtn.hidden = false;
  resumeBtn.hidden = true;
  startDurationTimer();
}

async function toggleMute(): Promise<void> {
  const res = await window.logix.toggleMute();
  if (micStream) {
    micStream.getAudioTracks().forEach((t) => { t.enabled = !res.muted; });
  }
  muteBtn.textContent = res.muted ? 'Unmute Mic' : 'Mute Mic';
}

// ─── Duration timer ───────────────────────────────────────
function startDurationTimer(): void {
  durationTimer = setInterval(() => {
    durationSec++;
    durationText.textContent = formatDuration(durationSec);
  }, 1000);
}

function stopDurationTimer(): void {
  if (durationTimer) { clearInterval(durationTimer); durationTimer = null; }
}

function formatDuration(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ─── Screen switching ─────────────────────────────────────
function showScreen(name: 'setup' | 'recording' | 'completed'): void {
  setupScreen.hidden = name !== 'setup';
  recordingScreen.hidden = name !== 'recording';
  completedScreen.hidden = name !== 'completed';
}

// ─── Session state listener ───────────────────────────────
window.logix.onSessionUpdate((session) => {
  if (!session) return;
  statusText.textContent = session.status;
  chunksText.textContent = String(session.stats?.chunkCount || 0);
  const kb = Math.round((session.stats?.bytesRecorded || 0) / 1024);
  sizeText.textContent = kb > 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`;
});

// ─── Toolbar action listener ──────────────────────────────
window.logix.onToolbarAction((action) => {
  switch (action) {
    case 'pause': pauseRecording(); break;
    case 'resume': resumeRecording(); break;
    case 'stop': stopRecording(); break;
    case 'mute': toggleMute(); break;
  }
});

// ─── Event wiring ─────────────────────────────────────────
titleInput.addEventListener('input', updateStartBtn);
refreshBtn.addEventListener('click', loadSources);
startBtn.addEventListener('click', startRecording);
pauseBtn.addEventListener('click', pauseRecording);
resumeBtn.addEventListener('click', resumeRecording);
stopBtn.addEventListener('click', stopRecording);
muteBtn.addEventListener('click', toggleMute);
newBtn.addEventListener('click', () => {
  durationSec = 0;
  durationText.textContent = '00:00';
  chunksText.textContent = '0';
  sizeText.textContent = '0 KB';
  pauseBtn.hidden = false;
  resumeBtn.hidden = true;
  muteBtn.textContent = 'Mute Mic';
  showScreen('setup');
  loadSources();
});

// ─── Init ─────────────────────────────────────────────────
loadSources();
loadMics();
