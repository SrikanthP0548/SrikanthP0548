import { Msg } from '../sw/messages.js';

const badge = document.createElement('div');
badge.id = 'logix-recording-badge';
badge.textContent = '● Recording';
document.documentElement.appendChild(badge);

let currentSessionId = null;
let recordingStartedAt = 0;

chrome.runtime.sendMessage({ type: Msg.OVERLAY_READY, sessionId: null, payload: {} }).catch(() => {});

function showRecordingBadge(show) {
  badge.style.display = show ? 'block' : 'none';
}

async function maybeUpdateFromStatus() {
  try {
    const resp = await chrome.runtime.sendMessage({ type: Msg.POPUP_GET_STATUS, sessionId: null, payload: {} });
    const s = resp?.session;
    const recording = s?.status === 'RECORDING' || s?.status === 'PAUSED';
    showRecordingBadge(recording);
    if (recording && s?.sessionId !== currentSessionId) {
      currentSessionId = s.sessionId;
      recordingStartedAt = performance.now();
    }
  } catch (_err) {}
}

async function promptAnnotation(sessionId) {
  const text = prompt('Add annotation');
  if (!text) return;
  const annotationType = 'INFO';
  await chrome.runtime.sendMessage({
    type: Msg.ANNOTATION_ADD,
    sessionId,
    payload: {
      tsMs: Math.floor(performance.now() - recordingStartedAt),
      annotationType,
      text,
      url: location.href,
      tabTitle: document.title
    }
  });
}

window.addEventListener('keydown', async (ev) => {
  if (ev.altKey && ev.shiftKey && ev.key.toLowerCase() === 'a') {
    if (currentSessionId) await promptAnnotation(currentSessionId);
  }
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'ANNOTATION_PROMPT') {
    promptAnnotation(msg.sessionId).then(() => sendResponse({ ok: true }));
    return true;
  }
  sendResponse({ ok: false });
  return false;
});

setInterval(maybeUpdateFromStatus, 500);
maybeUpdateFromStatus();
