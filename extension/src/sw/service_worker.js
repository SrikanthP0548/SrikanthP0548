// @ts-nocheck
import { Msg, SessionStatus } from './messages.js';
import { get, getAll, put, stores } from './db.js';
import { getExportProvider } from './export_provider.js';
import { transition } from './state_machine.js';
const CHUNK_MS = 5000;
const MAX_LOCAL_BYTES = 2 * 1024 * 1024 * 1024;
const WARN_LOCAL_BYTES = Math.floor(MAX_LOCAL_BYTES * 0.8);
const MAX_DURATION_MS = 60 * 60 * 1000;
let activeSessionId = null;
function uuid() {
    return crypto.randomUUID();
}
async function getActiveTab() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return tabs[0] || null;
}
async function ensureOffscreenDocument() {
    const has = await chrome.offscreen.hasDocument();
    if (has)
        return;
    await chrome.offscreen.createDocument({
        url: 'src/offscreen/offscreen.html',
        reasons: ['USER_MEDIA', 'DISPLAY_MEDIA'],
        justification: 'Record tab and microphone stream for long-running capture in MV3'
    });
}
async function getSession(sessionId) {
    return get(stores.sessions, sessionId);
}
async function saveSession(session) {
    await put(stores.sessions, session);
    const activeStatuses = [SessionStatus.RECORDING, SessionStatus.PAUSED, SessionStatus.PREPARING, SessionStatus.STOPPING];
    await chrome.storage.local.set({ activeSessionId: activeStatuses.includes(session.status) ? session.sessionId : null });
}
async function createDraft(metadata) {
    const tab = await getActiveTab();
    const sessionId = uuid();
    const now = Date.now();
    const session = {
        sessionId,
        createdAt: now,
        updatedAt: now,
        status: SessionStatus.DRAFT,
        activeTabId: tab?.id ?? null,
        tabTitle: tab?.title ?? '',
        tabUrl: tab?.url ?? '',
        metadata,
        audio: { micDeviceId: 'default', muted: false },
        video: { fps: 30, mimeType: 'video/webm;codecs=vp9,opus', chunkMs: CHUNK_MS },
        stats: { chunkCount: 0, bytesRecorded: 0, durationMsApprox: 0 },
        error: null,
        recovered: false,
        recordingStartedAt: null
    };
    await put(stores.drafts, { draftId: sessionId, metadata, updatedAt: now });
    await saveSession(session);
    return session;
}
async function getTabMediaStreamId(tabId) {
    return chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
}
async function startSession(sessionId, startPayload = {}) {
    let session = await getSession(sessionId);
    if (!session)
        throw new Error('Session not found');
    if (activeSessionId && activeSessionId !== sessionId)
        throw new Error('Another session is already active');
    if (startPayload.micDeviceId) {
        session = { ...session, audio: { ...session.audio, micDeviceId: startPayload.micDeviceId } };
    }
    const tab = await getActiveTab();
    if (!tab?.id)
        throw new Error('No active tab found for capture');
    session = {
        ...session,
        activeTabId: tab.id,
        tabTitle: tab.title || session.tabTitle,
        tabUrl: tab.url || session.tabUrl
    };
    const preparing = transition(session, SessionStatus.PREPARING);
    await saveSession(preparing);
    activeSessionId = sessionId;
    const tabStreamId = await getTabMediaStreamId(tab.id);
    await ensureOffscreenDocument();
    await chrome.runtime.sendMessage({
        type: Msg.OFFSCREEN_START_CAPTURE,
        sessionId,
        payload: {
            tabStreamId,
            micDeviceId: preparing.audio.micDeviceId,
            muted: preparing.audio.muted,
            chunkMs: preparing.video.chunkMs,
            mimeType: preparing.video.mimeType
        }
    });
    return preparing;
}
async function stopSession(sessionId) {
    const session = await getSession(sessionId);
    if (!session)
        throw new Error('Session not found');
    const stopping = transition(session, SessionStatus.STOPPING);
    await saveSession(stopping);
    await chrome.runtime.sendMessage({ type: Msg.OFFSCREEN_STOP_CAPTURE, sessionId, payload: {} });
    return stopping;
}
async function finalizeAndExport(sessionId) {
    let session = await getSession(sessionId);
    session = transition(session, SessionStatus.FINALIZING);
    await saveSession(session);
    session = transition(session, SessionStatus.READY_TO_EXPORT);
    await saveSession(session);
    const provider = getExportProvider('download_bundle');
    const manifest = {
        sessionId,
        createdAt: session.createdAt,
        updatedAt: Date.now(),
        metadata: session.metadata,
        video: session.video,
        audio: session.audio,
        stats: session.stats
    };
    session = transition(session, SessionStatus.EXPORTING);
    await saveSession(session);
    await provider.init(session);
    const result = await provider.finalize(sessionId, manifest);
    session = transition(session, SessionStatus.COMPLETED, { exportResult: result });
    await saveSession(session);
    activeSessionId = null;
}
async function recoverSessions() {
    const sessions = await getAll(stores.sessions);
    for (const session of sessions) {
        if ([SessionStatus.RECORDING, SessionStatus.PAUSED, SessionStatus.STOPPING].includes(session.status)) {
            const errored = transition(session, SessionStatus.ERROR, {
                error: 'Unexpected termination; partial saved',
                recovered: true
            });
            await saveSession(errored);
        }
        if (session.status === SessionStatus.EXPORTING || session.status === SessionStatus.READY_TO_EXPORT) {
            await finalizeAndExport(session.sessionId);
        }
    }
}
chrome.runtime.onInstalled.addListener(() => {
    recoverSessions().catch(console.error);
});
chrome.runtime.onStartup.addListener(() => {
    recoverSessions().catch(console.error);
});
chrome.commands.onCommand.addListener(async (command) => {
    if (command !== 'add-annotation')
        return;
    const session = activeSessionId ? await getSession(activeSessionId) : null;
    if (!session || session.status !== SessionStatus.RECORDING)
        return;
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id)
        return;
    await chrome.tabs.sendMessage(tab.id, { type: 'ANNOTATION_PROMPT', sessionId: session.sessionId });
});
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    (async () => {
        switch (msg.type) {
            case Msg.POPUP_GET_STATUS: {
                const sessions = await getAll(stores.sessions);
                const current = sessions.sort((a, b) => b.updatedAt - a.updatedAt)[0] || null;
                sendResponse({ ok: true, session: current });
                break;
            }
            case Msg.SESSION_CREATE_DRAFT: {
                const session = await createDraft(msg.payload.metadata);
                sendResponse({ ok: true, session });
                break;
            }
            case Msg.SESSION_UPDATE_METADATA: {
                const session = await getSession(msg.sessionId);
                if (!session)
                    throw new Error('Session not found');
                const updated = { ...session, metadata: msg.payload.metadata, updatedAt: Date.now() };
                await saveSession(updated);
                await put(stores.drafts, { draftId: session.sessionId, metadata: updated.metadata, updatedAt: Date.now() });
                sendResponse({ ok: true, session: updated });
                break;
            }
            case Msg.SESSION_START_REQUEST: {
                const session = await startSession(msg.sessionId, msg.payload || {});
                sendResponse({ ok: true, session });
                break;
            }
            case Msg.SESSION_STOP_REQUEST: {
                const session = await stopSession(msg.sessionId);
                sendResponse({ ok: true, session });
                break;
            }
            case Msg.SESSION_PAUSE_REQUEST: {
                await chrome.runtime.sendMessage({ type: Msg.OFFSCREEN_PAUSE, sessionId: msg.sessionId, payload: {} });
                const session = await getSession(msg.sessionId);
                const updated = transition(session, SessionStatus.PAUSED);
                await saveSession(updated);
                sendResponse({ ok: true, session: updated });
                break;
            }
            case Msg.SESSION_RESUME_REQUEST: {
                await chrome.runtime.sendMessage({ type: Msg.OFFSCREEN_RESUME, sessionId: msg.sessionId, payload: {} });
                const session = await getSession(msg.sessionId);
                const updated = transition(session, SessionStatus.RECORDING);
                await saveSession(updated);
                sendResponse({ ok: true, session: updated });
                break;
            }
            case Msg.ANNOTATION_ADD: {
                const session = await getSession(msg.sessionId);
                if (!session)
                    throw new Error('Session not found');
                await put(stores.annotations, {
                    annotationId: uuid(),
                    sessionId: msg.sessionId,
                    tsMs: msg.payload.tsMs,
                    type: msg.payload.annotationType,
                    text: msg.payload.text,
                    url: msg.payload.url,
                    tabTitle: msg.payload.tabTitle
                });
                sendResponse({ ok: true });
                break;
            }
            case Msg.RECORDING_STARTED: {
                const session = await getSession(msg.sessionId);
                const updated = transition(session, SessionStatus.RECORDING, { recordingStartedAt: Date.now() });
                await saveSession(updated);
                sendResponse({ ok: true });
                break;
            }
            case Msg.RECORDING_CHUNK: {
                const session = await getSession(msg.sessionId);
                if (!session)
                    throw new Error('Session not found');
                const { chunkIndex, blob, ts } = msg.payload;
                await put(stores.chunks, { sessionId: msg.sessionId, chunkIndex, blob, ts, size: blob.size });
                const bytesRecorded = session.stats.bytesRecorded + blob.size;
                const chunkCount = session.stats.chunkCount + 1;
                const durationMsApprox = chunkCount * session.video.chunkMs;
                let updated = {
                    ...session,
                    stats: { chunkCount, bytesRecorded, durationMsApprox },
                    updatedAt: Date.now()
                };
                if (bytesRecorded >= WARN_LOCAL_BYTES && !updated.warnedStorage)
                    updated.warnedStorage = true;
                if (bytesRecorded >= MAX_LOCAL_BYTES || durationMsApprox >= MAX_DURATION_MS) {
                    updated = transition(updated, SessionStatus.STOPPING, { error: 'Max limits reached; auto-stopped.' });
                    await saveSession(updated);
                    await chrome.runtime.sendMessage({ type: Msg.OFFSCREEN_STOP_CAPTURE, sessionId: msg.sessionId, payload: {} });
                }
                else {
                    await saveSession(updated);
                }
                sendResponse({ ok: true });
                break;
            }
            case Msg.RECORDING_STOPPED: {
                await finalizeAndExport(msg.sessionId);
                sendResponse({ ok: true });
                break;
            }
            case Msg.RECORDING_ERROR: {
                const session = await getSession(msg.sessionId);
                const updated = transition(session, SessionStatus.ERROR, { error: msg.payload?.error || 'Unknown recording error' });
                await saveSession(updated);
                activeSessionId = null;
                sendResponse({ ok: true });
                break;
            }
            case Msg.OVERLAY_READY:
                sendResponse({ ok: true });
                break;
            default:
                sendResponse({ ok: false, error: `Unhandled message ${msg.type}` });
        }
    })().catch((err) => sendResponse({ ok: false, error: err.message || String(err) }));
    return true;
});
