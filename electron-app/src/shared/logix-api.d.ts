export {};

declare global {
  interface Window {
    logix: {
      getSources: () => Promise<{ id: string; name: string; thumbnailDataUrl: string }[]>;
      startRecording: (payload: any) => Promise<{ ok: boolean; session?: any }>;
      stopRecording: () => Promise<{ ok: boolean }>;
      pauseRecording: () => Promise<{ ok: boolean }>;
      resumeRecording: () => Promise<{ ok: boolean }>;
      toggleMute: () => Promise<{ ok: boolean; muted?: boolean }>;
      finalizeRecording: () => Promise<{ ok: boolean; outputDir?: string; sessionId?: string; error?: string }>;
      saveChunk: (data: { chunkIndex: number; buffer: ArrayBuffer; size: number }) => void;
      notifyRecordingStarted: () => void;
      notifyRecordingError: (error: string) => void;
      sendToolbarAction: (action: string) => void;
      onSessionUpdate: (cb: (session: any) => void) => () => void;
      onToolbarAction: (cb: (action: string) => void) => () => void;
    };
  }
}
