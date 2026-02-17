import { RecorderEngine } from './recorder_engine.js';
import { Msg } from '../sw/messages.js';

let activeSessionId = null;

const engine = new RecorderEngine({
  onChunk: async ({ chunkIndex, blob, ts }) => {
    if (!activeSessionId) return;
    await chrome.runtime.sendMessage({
      type: Msg.RECORDING_CHUNK,
      sessionId: activeSessionId,
      payload: { chunkIndex, blob, ts }
    });
  },
  onStarted: async () => {
    if (!activeSessionId) return;
    await chrome.runtime.sendMessage({ type: Msg.RECORDING_STARTED, sessionId: activeSessionId, payload: {} });
  },
  onStopped: async () => {
    if (!activeSessionId) return;
    const sid = activeSessionId;
    activeSessionId = null;
    await chrome.runtime.sendMessage({ type: Msg.RECORDING_STOPPED, sessionId: sid, payload: {} });
  },
  onError: async (error) => {
    if (!activeSessionId) return;
    await chrome.runtime.sendMessage({
      type: Msg.RECORDING_ERROR,
      sessionId: activeSessionId,
      payload: { error }
    });
  }
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    switch (msg.type) {
      case Msg.OFFSCREEN_START_CAPTURE:
        activeSessionId = msg.sessionId;
        await engine.start(msg.payload);
        sendResponse({ ok: true });
        break;
      case Msg.OFFSCREEN_STOP_CAPTURE:
        engine.stop();
        sendResponse({ ok: true });
        break;
      case Msg.OFFSCREEN_PAUSE:
        engine.pause();
        sendResponse({ ok: true });
        break;
      case Msg.OFFSCREEN_RESUME:
        engine.resume();
        sendResponse({ ok: true });
        break;
      case Msg.OFFSCREEN_SET_MUTE:
        engine.setMute(Boolean(msg.payload?.muted));
        sendResponse({ ok: true });
        break;
      default:
        sendResponse({ ok: false, error: 'Unhandled message in offscreen doc' });
    }
  })().catch((err) => sendResponse({ ok: false, error: err.message || String(err) }));
  return true;
});

chrome.runtime.sendMessage({ type: Msg.OFFSCREEN_READY, sessionId: null, payload: {} });
