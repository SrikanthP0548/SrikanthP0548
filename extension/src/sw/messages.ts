export const Msg = {
  POPUP_GET_STATUS: 'POPUP_GET_STATUS',
  SESSION_CREATE_DRAFT: 'SESSION_CREATE_DRAFT',
  SESSION_UPDATE_METADATA: 'SESSION_UPDATE_METADATA',
  SESSION_START_REQUEST: 'SESSION_START_REQUEST',
  SESSION_STOP_REQUEST: 'SESSION_STOP_REQUEST',
  SESSION_PAUSE_REQUEST: 'SESSION_PAUSE_REQUEST',
  SESSION_RESUME_REQUEST: 'SESSION_RESUME_REQUEST',

  ANNOTATION_ADD: 'ANNOTATION_ADD',
  OVERLAY_READY: 'OVERLAY_READY',
  SESSION_STATE_UPDATE: 'SESSION_STATE_UPDATE',

  OFFSCREEN_START_CAPTURE: 'OFFSCREEN_START_CAPTURE',
  OFFSCREEN_STOP_CAPTURE: 'OFFSCREEN_STOP_CAPTURE',
  OFFSCREEN_PAUSE: 'OFFSCREEN_PAUSE',
  OFFSCREEN_RESUME: 'OFFSCREEN_RESUME',
  OFFSCREEN_SET_MUTE: 'OFFSCREEN_SET_MUTE',

  OFFSCREEN_READY: 'OFFSCREEN_READY',
  RECORDING_STARTED: 'RECORDING_STARTED',
  RECORDING_CHUNK: 'RECORDING_CHUNK',
  RECORDING_STOPPED: 'RECORDING_STOPPED',
  RECORDING_ERROR: 'RECORDING_ERROR'
} as const;

export const SessionStatus = {
  IDLE: 'IDLE',
  DRAFT: 'DRAFT',
  PREPARING: 'PREPARING',
  RECORDING: 'RECORDING',
  PAUSED: 'PAUSED',
  STOPPING: 'STOPPING',
  FINALIZING: 'FINALIZING',
  READY_TO_EXPORT: 'READY_TO_EXPORT',
  EXPORTING: 'EXPORTING',
  COMPLETED: 'COMPLETED',
  ERROR: 'ERROR'
} as const;

export type SessionStatusType = (typeof SessionStatus)[keyof typeof SessionStatus];

export interface SessionRecord {
  sessionId: string;
  createdAt: number;
  updatedAt: number;
  status: SessionStatusType;
  activeTabId: number | null;
  tabTitle: string;
  tabUrl: string;
  metadata: {
    title: string;
    description: string;
    tags: string[];
    relatedComponents?: string;
    relatedFiles?: string;
  };
  audio: { micDeviceId: string; muted: boolean };
  video: { fps: number; mimeType: string; chunkMs: number };
  stats: { chunkCount: number; bytesRecorded: number; durationMsApprox: number };
  error: string | null;
  recovered?: boolean;
  recordingStartedAt: number | null;
  warnedStorage?: boolean;
  exportResult?: unknown;
}
