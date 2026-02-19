export interface SessionMetadata {
  title: string;
  description: string;
}

export enum SessionStatus {
  IDLE = 'IDLE',
  PREPARING = 'PREPARING',
  RECORDING = 'RECORDING',
  PAUSED = 'PAUSED',
  STOPPING = 'STOPPING',
  FINALIZING = 'FINALIZING',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR',
}

export interface SessionRecord {
  sessionId: string;
  createdAt: number;
  updatedAt: number;
  status: SessionStatus;
  metadata: SessionMetadata;
  audio: { micDeviceId: string; muted: boolean };
  video: { fps: number; mimeType: string; chunkMs: number };
  stats: { chunkCount: number; bytesRecorded: number; durationMs: number };
  error: string | null;
  recordingStartedAt: number | null;
}

/** IPC channel names */
export const IPC = {
  // Main window → Main process
  GET_SOURCES: 'get-sources',
  START_RECORDING: 'start-recording',
  STOP_RECORDING: 'stop-recording',
  PAUSE_RECORDING: 'pause-recording',
  RESUME_RECORDING: 'resume-recording',
  TOGGLE_MUTE: 'toggle-mute',
  GET_MIC_DEVICES: 'get-mic-devices',

  // Renderer → Main (chunk data)
  SAVE_CHUNK: 'save-chunk',
  FINALIZE_RECORDING: 'finalize-recording',

  // Main → Renderer (toolbar commands)
  TOOLBAR_PAUSE: 'toolbar-pause',
  TOOLBAR_RESUME: 'toolbar-resume',
  TOOLBAR_STOP: 'toolbar-stop',
  TOOLBAR_MUTE: 'toolbar-mute',

  // Main → All renderers (state updates)
  SESSION_UPDATE: 'session-update',
  RECORDING_STARTED: 'recording-started',
  RECORDING_ERROR: 'recording-error',

  // Toolbar → Main (user clicked toolbar buttons)
  TOOLBAR_ACTION: 'toolbar-action',
} as const;

export interface SourceInfo {
  id: string;
  name: string;
  thumbnailDataUrl: string;
}

export interface StartRecordingPayload {
  sourceId: string;
  micDeviceId: string;
  metadata: SessionMetadata;
  mimeType: string;
  chunkMs: number;
}
