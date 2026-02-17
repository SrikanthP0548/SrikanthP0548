import { Msg, SessionStatus } from '../sw/messages.js';

let currentSession = null;
let formDirty = false;

const el = {
  form: document.getElementById('metaForm'),
  tabInfo: document.getElementById('tabInfo'),
  title: document.getElementById('title'),
  description: document.getElementById('description'),
  tags: document.getElementById('tags'),
  relatedComponents: document.getElementById('relatedComponents'),
  relatedFiles: document.getElementById('relatedFiles'),
  micDevice: document.getElementById('micDevice'),
  startBtn: document.getElementById('startBtn'),
  stopBtn: document.getElementById('stopBtn'),
  pauseBtn: document.getElementById('pauseBtn'),
  resumeBtn: document.getElementById('resumeBtn'),
  status: document.getElementById('status'),
  stats: document.getElementById('stats'),
  recoveryNotice: document.getElementById('recoveryNotice')
};

function parseTags(raw) {
  return raw
    .split(',')
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean);
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

function validate() {
  const titleOk = el.title.value.trim().length >= 5 && el.title.value.trim().length <= 200;
  const descLen = el.description.value.trim().length;
  const descOk = descLen >= 20 && descLen <= 1000;
  const tags = parseTags(el.tags.value);
  const tagsOk = tags.length >= 1 && tags.length <= 10 && tags.every((tag) => /^[a-z0-9-]{1,30}$/.test(tag));
  el.startBtn.disabled = !(titleOk && descOk && tagsOk);
}

function hydrateFormFromSession(session) {
  const metadata = session?.metadata || {};
  el.title.value = metadata.title || '';
  el.description.value = metadata.description || '';
  el.tags.value = (metadata.tags || []).join(',');
  el.relatedComponents.value = metadata.relatedComponents || '';
  el.relatedFiles.value = metadata.relatedFiles || '';
  if (session?.audio?.micDeviceId) el.micDevice.value = session.audio.micDeviceId;
}

function updateUi(session) {
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

async function loadMicDevices() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const microphones = devices.filter((device) => device.kind === 'audioinput');
    el.micDevice.innerHTML = '';

    const fallback = document.createElement('option');
    fallback.value = 'default';
    fallback.textContent = 'Default microphone';
    el.micDevice.appendChild(fallback);

    microphones.forEach((microphone) => {
      const option = document.createElement('option');
      option.value = microphone.deviceId;
      option.textContent = microphone.label || `Microphone ${el.micDevice.length}`;
      el.micDevice.appendChild(option);
    });
  } catch (_error) {
    el.micDevice.innerHTML = '<option value="default">Microphone unavailable</option>';
  }
}

async function refresh() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  el.tabInfo.textContent = `${tab?.title || ''}\n${tab?.url || ''}`;

  const response = await chrome.runtime.sendMessage({ type: Msg.POPUP_GET_STATUS, sessionId: null, payload: {} });
  if (response?.session && !formDirty) hydrateFormFromSession(response.session);

  updateUi(response?.session || null);
  validate();
}

async function ensureSession() {
  if (currentSession?.sessionId) return currentSession;

  const response = await chrome.runtime.sendMessage({
    type: Msg.SESSION_CREATE_DRAFT,
    sessionId: null,
    payload: { metadata: metadataFromForm() }
  });

  currentSession = response.session;
  return currentSession;
}

async function autosaveDraft() {
  if (!currentSession?.sessionId) return;
  if (!formDirty) return;

  await chrome.runtime.sendMessage({
    type: Msg.SESSION_UPDATE_METADATA,
    sessionId: currentSession.sessionId,
    payload: { metadata: metadataFromForm() }
  });
  formDirty = false;
}

el.form.addEventListener('input', () => {
  formDirty = true;
  validate();
});

el.startBtn.addEventListener('click', async () => {
  const session = await ensureSession();
  await autosaveDraft();
  await chrome.runtime.sendMessage({
    type: Msg.SESSION_START_REQUEST,
    sessionId: session.sessionId,
    payload: { micDeviceId: el.micDevice.value }
  });
  await refresh();
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

setInterval(refresh, 500);
setInterval(autosaveDraft, 30000);
loadMicDevices().then(refresh);
