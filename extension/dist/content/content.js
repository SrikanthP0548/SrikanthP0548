import { Msg, SessionStatus } from '../sw/messages.js';
const badge = document.createElement('div');
badge.id = 'logix-recording-badge';
badge.textContent = '● Recording';
document.documentElement.appendChild(badge);
const panel = document.createElement('div');
panel.id = 'logix-annotation-panel';
panel.innerHTML = `
  <div class="logix-panel-row"><strong>Add annotation</strong></div>
  <div class="logix-panel-row"><select id="logix-annotation-type"><option>INFO</option><option>STEP</option><option>WARN</option><option>QUESTION</option></select></div>
  <div class="logix-panel-row"><textarea id="logix-annotation-text" placeholder="What happened?"></textarea></div>
  <div class="logix-panel-row"><button id="logix-annotation-cancel">Cancel</button><button id="logix-annotation-save">Save</button></div>
`;
document.documentElement.appendChild(panel);
const textEl = panel.querySelector('#logix-annotation-text');
const typeEl = panel.querySelector('#logix-annotation-type');
const saveEl = panel.querySelector('#logix-annotation-save');
const cancelEl = panel.querySelector('#logix-annotation-cancel');
let currentSessionId = null;
let recordingStartedAt = 0;
function showRecordingBadge(show) {
    badge.style.display = show ? 'block' : 'none';
}
function showPanel(show) {
    panel.style.display = show ? 'block' : 'none';
    if (show)
        textEl.focus();
}
async function submitAnnotation() {
    if (!currentSessionId)
        return;
    const text = textEl.value.trim();
    if (!text)
        return;
    await chrome.runtime.sendMessage({
        type: Msg.ANNOTATION_ADD,
        sessionId: currentSessionId,
        payload: {
            tsMs: Math.floor(performance.now() - recordingStartedAt),
            annotationType: typeEl.value,
            text,
            url: location.href,
            tabTitle: document.title
        }
    });
    textEl.value = '';
    showPanel(false);
}
saveEl.addEventListener('click', () => void submitAnnotation());
cancelEl.addEventListener('click', () => showPanel(false));
window.addEventListener('keydown', async (ev) => {
    if (ev.altKey && ev.shiftKey && ev.key.toLowerCase() === 'a' && currentSessionId) {
        ev.preventDefault();
        showPanel(true);
    }
    if (ev.key === 'Escape')
        showPanel(false);
});
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'ANNOTATION_PROMPT' && msg.sessionId) {
        showPanel(true);
        sendResponse({ ok: true });
        return true;
    }
    if (msg.type === Msg.SESSION_STATE_UPDATE) {
        const session = msg.payload?.session;
        const status = session?.status;
        const recording = status === SessionStatus.RECORDING || status === SessionStatus.PAUSED;
        showRecordingBadge(recording);
        if (recording && session.sessionId !== currentSessionId) {
            currentSessionId = session.sessionId;
            recordingStartedAt = performance.now();
        }
        if (!recording) {
            currentSessionId = null;
            showPanel(false);
        }
        sendResponse({ ok: true });
        return true;
    }
    sendResponse({ ok: false });
    return false;
});
void chrome.runtime.sendMessage({ type: Msg.OVERLAY_READY, sessionId: null, payload: { tabUrl: location.href, tabTitle: document.title } });
void chrome.runtime.sendMessage({ type: Msg.POPUP_GET_STATUS, sessionId: null, payload: {} }).then((resp) => {
    const session = resp?.session;
    const recording = session?.status === SessionStatus.RECORDING || session?.status === SessionStatus.PAUSED;
    showRecordingBadge(recording);
    if (recording) {
        currentSessionId = session.sessionId;
        recordingStartedAt = performance.now();
    }
});
