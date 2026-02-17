import { RecorderEngine } from './recorder_engine.js';
import { Msg } from '../sw/messages.js';

let activeSessionId: string | null = null;

const engine = new RecorderEngine({
  onChunk: async ({ sessionId, chunkIndex, blob, ts }) => {
    const bytes = await blob.arrayBuffer();
    await chrome.runtime.sendMessage({
      type: Msg.RECORDING_CHUNK,
      sessionId,
      payload: { chunkIndex, bytes, ts, mimeType: blob.type, size: blob.size }
    });
  },
  onStarted: async (sessionId) => {
    await chrome.runtime.sendMessage({ type: Msg.RECORDING_STARTED, sessionId, payload: {} });
  },
  onStopped: async (sessionId) => {
    await chrome.runtime.sendMessage({ type: Msg.RECORDING_STOPPED, sessionId, payload: {} });
    if (activeSessionId === sessionId) activeSessionId = null;
  },
  onError: async (sessionId, error) => {
    await chrome.runtime.sendMessage({ type: Msg.RECORDING_ERROR, sessionId, payload: { error } });
    if (activeSessionId === sessionId) activeSessionId = null;
  }
});

chrome.runtime.onMessage.addListener((msg: any, _sender: any, sendResponse: any) => {
  (async () => {
    switch (msg.type) {
      case Msg.OFFSCREEN_START_CAPTURE: {
        const started = await engine.start({ ...msg.payload, sessionId: msg.sessionId });
        if (started) activeSessionId = msg.sessionId;
        sendResponse({ ok: started });
        break;
      }
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
  })().catch((err) => sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) }));

  return true;
});

chrome.runtime.sendMessage({ type: Msg.OFFSCREEN_READY, sessionId: null, payload: {} });
