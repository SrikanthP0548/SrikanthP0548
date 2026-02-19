import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '../shared/types';

contextBridge.exposeInMainWorld('logix', {
  // Screen sources
  getSources: () => ipcRenderer.invoke(IPC.GET_SOURCES),

  // Recording lifecycle
  startRecording: (payload: any) => ipcRenderer.invoke(IPC.START_RECORDING, payload),
  stopRecording: () => ipcRenderer.invoke(IPC.STOP_RECORDING),
  pauseRecording: () => ipcRenderer.invoke(IPC.PAUSE_RECORDING),
  resumeRecording: () => ipcRenderer.invoke(IPC.RESUME_RECORDING),
  toggleMute: () => ipcRenderer.invoke(IPC.TOGGLE_MUTE),
  finalizeRecording: () => ipcRenderer.invoke(IPC.FINALIZE_RECORDING),

  // Chunk data (fire-and-forget)
  saveChunk: (data: { chunkIndex: number; buffer: ArrayBuffer; size: number }) =>
    ipcRenderer.send(IPC.SAVE_CHUNK, data),

  // Notify main process
  notifyRecordingStarted: () => ipcRenderer.send(IPC.RECORDING_STARTED),
  notifyRecordingError: (error: string) => ipcRenderer.send(IPC.RECORDING_ERROR, error),

  // Toolbar action (from toolbar → main process → main window)
  sendToolbarAction: (action: string) => ipcRenderer.send(IPC.TOOLBAR_ACTION, action),

  // Listen for events from main process
  onSessionUpdate: (cb: (session: any) => void) => {
    const listener = (_event: any, session: any) => cb(session);
    ipcRenderer.on(IPC.SESSION_UPDATE, listener);
    return () => ipcRenderer.removeListener(IPC.SESSION_UPDATE, listener);
  },

  onToolbarAction: (cb: (action: string) => void) => {
    const listener = (_event: any, action: string) => cb(action);
    ipcRenderer.on(IPC.TOOLBAR_ACTION, listener);
    return () => ipcRenderer.removeListener(IPC.TOOLBAR_ACTION, listener);
  },
});
