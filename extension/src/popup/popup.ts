import { Msg, SessionStatus, type SessionRecord } from '../sw/messages.js';

let currentSession: SessionRecord | null = null;
let formDirty = false;
let creatingSession = false;

/* ---------- DOM element refs with init-time assertion ---------- */

function getEl<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Popup init: missing element #${id}`);
  return element as T;
}

const el = {
  form: getEl<HTMLFormElement>('metaForm'),
  tabInfo: getEl<HTMLElement>('tabInfo'),
  title: getEl<HTMLInputElement>('title'),
  description: getEl<HTMLTextAreaElement>('description'),
  tags: getEl<HTMLInputElement>('tags'),
  tagHint: getEl<HTMLElement>('tagHint'),
  relatedComponents: getEl<HTMLInputElement>('relatedComponents'),
  relatedFiles: getEl<HTMLInputElement>('relatedFiles'),
  micDevice: getEl<HTMLSelectElement>('micDevice'),
  startBtn: getEl<HTMLButtonElement>('startBtn'),
  stopBtn: getEl<HTMLButtonElement>('stopBtn'),
  pauseBtn: getEl<HTMLButtonElement>('pauseBtn'),
  resumeBtn: getEl<HTMLButtonElement>('resumeBtn'),
  status: getEl<HTMLElement>('status'),
  stats: getEl<HTMLElement>('stats'),
  recoveryNotice: getEl<HTMLElement>('recoveryNotice')
};

/* ---------- Helpers ---------- */

function parseTags(raw: string): string[] {
  return raw.split(',').map((tag) => tag.trim().toLowerCase()).filter(Boolean);
}

function metadataFromForm() {
  return {
    title: el.title.value.trim(),
    description: el.description.value.trim(),
    tags: parseTags(el.tags.value),
    relatedComponents: el.relatedComponents.value.trim(),
    relatedFiles: el.relatedFiles.value.trim()
  };
}

function validate(): void {
  const titleOk = el.title.value.trim().length >= 5 && el.title.value.trim().length <= 200;
  const descLen = el.description.value.trim().length;
  const descOk = descLen >= 20 && descLen <= 1000;
  const tags = parseTags(el.tags.value);
  const tagPattern = /^[a-z0-9-]{1,30}$/;
  const tagsOk = tags.length >= 1 && tags.length <= 10 && tags.every((tag) => tagPattern.test(tag));

  /* Show/hide tag validation hint */
  const hasTagInput = el.tags.value.trim().length > 0;
  if (hasTagInput && !tagsOk) {
    el.tagHint.textContent = 'Tags must be lowercase alphanumeric, hyphen-separated (max 30 chars each, max 10 tags).';
    el.tagHint.hidden = false;
  } else {
    el.tagHint.textContent = '';
    el.tagHint.hidden = true;
  }

  el.startBtn.disabled = !(titleOk && descOk && tagsOk);
}

function hydrateFormFromSession(session: SessionRecord | null): void {
  const metadata = session?.metadata || { title: '', description: '', tags: [] };
  el.title.value = metadata.title || '';
  el.description.value = metadata.description || '';
  el.tags.value = (metadata.tags || []).join(',');
  el.relatedComponents.value = metadata.relatedComponents || '';
  el.relatedFiles.value = metadata.relatedFiles || '';
  if (session?.audio?.micDeviceId) el.micDevice.value = session.audio.micDeviceId;
}

function updateUi(session: SessionRecord | null): void {
  currentSession = session;
  if (!session) {
    el.status.textContent = 'Status: IDLE';
    el.stats.textContent = '';
    el.recoveryNotice.textContent = '';
    el.stopBtn.hidden = true;
    el.pauseBtn.hidden = true;
    el.resumeBtn.hidden = true;
    el.startBtn.hidden = false;
    return;
  }

  el.status.textContent = `Status: ${session.status}`;
  el.stats.textContent = `Chunks: ${session.stats?.chunkCount || 0}, Bytes: ${session.stats?.bytesRecorded || 0}, Duration≈${Math.floor((session.stats?.durationMsApprox || 0) / 1000)}s`;
  el.recoveryNotice.textContent = session.recovered ? 'Recovered session found after unexpected termination.' : '';

  const recording = session.status === SessionStatus.RECORDING;
  const paused = session.status === SessionStatus.PAUSED;
  el.startBtn.hidden = recording || paused;
  el.stopBtn.hidden = !(recording || paused);
  el.pauseBtn.hidden = !recording;
  el.resumeBtn.hidden = !paused;
}

/* ---------- Mic devices ---------- */

async function loadMicDevices(): Promise<void> {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const microphones = devices.filter((d) => d.kind === 'audioinput');
    el.micDevice.innerHTML = '<option value="default">Default microphone</option>';
    microphones.forEach((microphone) => {
      const option = document.createElement('option');
      option.value = microphone.deviceId;
      option.textContent = microphone.label || `Microphone ${el.micDevice.length}`;
      el.micDevice.appendChild(option);
    });
  } catch {
    el.micDevice.innerHTML = '<option value="default">Microphone unavailable</option>';
  }
}

/* ---------- State fetch (one-shot, no polling) ---------- */

async function refresh(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  el.tabInfo.textContent = `${tab?.title || ''}\n${tab?.url || ''}`;

  const response = await chrome.runtime.sendMessage({ type: Msg.POPUP_GET_STATUS, sessionId: null, payload: {} });
  if (response?.session && !formDirty) hydrateFormFromSession(response.session as SessionRecord);

  updateUi((response?.session as SessionRecord) || null);
  validate();
}

/* ---------- Push-based state updates from service worker ---------- */

chrome.runtime.onMessage.addListener((message: { type?: string; session?: SessionRecord }) => {
  if (message?.type === Msg.SESSION_STATE_UPDATE) {
    const session = (message.session as SessionRecord) || null;
    if (!formDirty && session) hydrateFormFromSession(session);
    updateUi(session);
    validate();
  }
});

/* ---------- Session management with race guard ---------- */

async function ensureSession(): Promise<SessionRecord> {
  if (currentSession?.sessionId) return currentSession;
  if (creatingSession) {
    // Wait for the in-flight create to finish
    while (creatingSession) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    if (currentSession?.sessionId) return currentSession;
  }

  creatingSession = true;
  try {
    const response = await chrome.runtime.sendMessage({
      type: Msg.SESSION_CREATE_DRAFT,
      sessionId: null,
      payload: { metadata: metadataFromForm() }
    });

    currentSession = response.session as SessionRecord;
    return currentSession;
  } finally {
    creatingSession = false;
  }
}

async function autosaveDraft(): Promise<void> {
  if (!currentSession?.sessionId || !formDirty) return;

  await chrome.runtime.sendMessage({
    type: Msg.SESSION_UPDATE_METADATA,
    sessionId: currentSession.sessionId,
    payload: { metadata: metadataFromForm() }
  });
  formDirty = false;
}

/* ---------- Event listeners ---------- */

el.form.addEventListener('input', () => {
  formDirty = true;
  validate();
});

el.startBtn.addEventListener('click', async () => {
  el.startBtn.disabled = true;
  try {
    const session = await ensureSession();
    await autosaveDraft();
    await chrome.runtime.sendMessage({ type: Msg.SESSION_START_REQUEST, sessionId: session.sessionId, payload: { micDeviceId: el.micDevice.value } });
    await refresh();
  } finally {
    validate(); // re-enable if still valid
  }
});

el.stopBtn.addEventListener('click', async () => {
  if (!currentSession) return;
  await chrome.runtime.sendMessage({ type: Msg.SESSION_STOP_REQUEST, sessionId: currentSession.sessionId, payload: {} });
  await refresh();
});

el.pauseBtn.addEventListener('click', async () => {
  if (!currentSession) return;
  await chrome.runtime.sendMessage({ type: Msg.SESSION_PAUSE_REQUEST, sessionId: currentSession.sessionId, payload: {} });
  await refresh();
});

el.resumeBtn.addEventListener('click', async () => {
  if (!currentSession) return;
  await chrome.runtime.sendMessage({ type: Msg.SESSION_RESUME_REQUEST, sessionId: currentSession.sessionId, payload: {} });
  await refresh();
});

/* ---------- Init ---------- */

setInterval(autosaveDraft, 30000);
void loadMicDevices().then(refresh);
