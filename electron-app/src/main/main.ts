import { app, BrowserWindow, ipcMain, desktopCapturer, screen, Tray, Menu, nativeImage, session } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { IPC, SessionStatus } from '../shared/types';
import type { SessionRecord, StartRecordingPayload, SourceInfo } from '../shared/types';

let mainWindow: BrowserWindow | null = null;
let toolbarWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let currentSession: SessionRecord | null = null;
let outputDir: string = '';

const PRELOAD_PATH = path.join(__dirname, '..', 'preload', 'preload.js');
const SRC_DIR = path.join(__dirname, '..', '..', 'src');

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 480,
    height: 600,
    resizable: false,
    title: 'Logix Recorder',
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(SRC_DIR, 'renderer', 'main-window', 'index.html'));
  win.on('closed', () => { mainWindow = null; });
  return win;
}

function createToolbarWindow(): BrowserWindow {
  const display = screen.getPrimaryDisplay();
  const { width: screenWidth } = display.workAreaSize;
  const toolbarWidth = 340;
  const toolbarHeight = 48;

  const win = new BrowserWindow({
    width: toolbarWidth,
    height: toolbarHeight,
    x: Math.round((screenWidth - toolbarWidth) / 2),
    y: 0,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    transparent: true,
    focusable: false,
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.setVisibleOnAllWorkspaces(true);
  win.loadFile(path.join(SRC_DIR, 'renderer', 'toolbar', 'index.html'));
  win.on('closed', () => { toolbarWindow = null; });
  return win;
}

function createTray(): void {
  // 16x16 red circle icon
  const icon = nativeImage.createFromBuffer(
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAKklEQVQ4T2P8z8BQz0BAwMBIBGBhYGD4T4wBjKMGEBUGo2EwGgYEhQEAvPYIEXDsYHMAAAAASUVORK5CYII=',
      'base64'
    )
  );
  tray = new Tray(icon);
  tray.setToolTip('Logix Recorder');

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show Window', click: () => { mainWindow?.show(); } },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.quit(); } },
  ]);
  tray.setContextMenu(contextMenu);
  tray.on('click', () => { mainWindow?.show(); });
}

function getRecordingsDir(): string {
  const dir = path.join(app.getPath('documents'), 'LogixRecordings');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function broadcastSession(): void {
  const payload = currentSession ? { ...currentSession } : null;
  mainWindow?.webContents.send(IPC.SESSION_UPDATE, payload);
  toolbarWindow?.webContents.send(IPC.SESSION_UPDATE, payload);
}

function makeSessionId(): string {
  const now = new Date();
  const pad = (n: number, len = 2) => String(n).padStart(len, '0');
  return `rec_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

// ─── IPC Handlers ────────────────────────────────────────

ipcMain.handle(IPC.GET_SOURCES, async (): Promise<SourceInfo[]> => {
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: 160, height: 90 },
  });
  return sources.map((s) => ({
    id: s.id,
    name: s.name,
    thumbnailDataUrl: s.thumbnail.toDataURL(),
  }));
});

ipcMain.handle(IPC.START_RECORDING, async (_event, payload: StartRecordingPayload) => {
  const sessionId = makeSessionId();
  outputDir = path.join(getRecordingsDir(), sessionId);
  fs.mkdirSync(outputDir, { recursive: true });

  currentSession = {
    sessionId,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    status: SessionStatus.PREPARING,
    metadata: payload.metadata,
    audio: { micDeviceId: payload.micDeviceId, muted: false },
    video: { fps: 30, mimeType: payload.mimeType, chunkMs: payload.chunkMs },
    stats: { chunkCount: 0, bytesRecorded: 0, durationMs: 0 },
    error: null,
    recordingStartedAt: null,
  };

  // Show the floating toolbar
  if (!toolbarWindow) {
    toolbarWindow = createToolbarWindow();
  } else {
    toolbarWindow.show();
  }

  // Minimize main window
  mainWindow?.minimize();

  broadcastSession();
  return { ok: true, session: currentSession };
});

ipcMain.on(IPC.RECORDING_STARTED, () => {
  if (!currentSession) return;
  currentSession = {
    ...currentSession,
    status: SessionStatus.RECORDING,
    recordingStartedAt: Date.now(),
    updatedAt: Date.now(),
  };
  broadcastSession();
});

ipcMain.on(IPC.SAVE_CHUNK, (_event, data: { chunkIndex: number; buffer: ArrayBuffer; size: number }) => {
  if (!currentSession || !outputDir) return;
  const chunkPath = path.join(outputDir, `chunk_${String(data.chunkIndex).padStart(5, '0')}.webm`);
  fs.writeFileSync(chunkPath, Buffer.from(data.buffer));

  currentSession = {
    ...currentSession,
    stats: {
      chunkCount: currentSession.stats.chunkCount + 1,
      bytesRecorded: currentSession.stats.bytesRecorded + data.size,
      durationMs: (currentSession.stats.chunkCount + 1) * currentSession.video.chunkMs,
    },
    updatedAt: Date.now(),
  };
  broadcastSession();
});

ipcMain.handle(IPC.STOP_RECORDING, async () => {
  if (!currentSession) return { ok: false, error: 'No active session' };
  currentSession = { ...currentSession, status: SessionStatus.STOPPING, updatedAt: Date.now() };
  broadcastSession();
  // The renderer will call FINALIZE_RECORDING after MediaRecorder.stop() fires
  return { ok: true };
});

ipcMain.handle(IPC.PAUSE_RECORDING, async () => {
  if (!currentSession) return { ok: false };
  currentSession = { ...currentSession, status: SessionStatus.PAUSED, updatedAt: Date.now() };
  broadcastSession();
  return { ok: true };
});

ipcMain.handle(IPC.RESUME_RECORDING, async () => {
  if (!currentSession) return { ok: false };
  currentSession = { ...currentSession, status: SessionStatus.RECORDING, updatedAt: Date.now() };
  broadcastSession();
  return { ok: true };
});

ipcMain.handle(IPC.TOGGLE_MUTE, async () => {
  if (!currentSession) return { ok: false };
  currentSession = {
    ...currentSession,
    audio: { ...currentSession.audio, muted: !currentSession.audio.muted },
    updatedAt: Date.now(),
  };
  broadcastSession();
  return { ok: true, muted: currentSession.audio.muted };
});

ipcMain.handle(IPC.FINALIZE_RECORDING, async () => {
  if (!currentSession || !outputDir) return { ok: false };

  currentSession = { ...currentSession, status: SessionStatus.FINALIZING, updatedAt: Date.now() };
  broadcastSession();

  try {
    // Merge all chunks into a single file
    const chunkFiles = fs.readdirSync(outputDir)
      .filter((f) => f.startsWith('chunk_') && f.endsWith('.webm'))
      .sort();

    const finalPath = path.join(outputDir, 'recording.webm');
    const writeStream = fs.createWriteStream(finalPath);
    for (const chunkFile of chunkFiles) {
      const data = fs.readFileSync(path.join(outputDir, chunkFile));
      writeStream.write(data);
    }
    writeStream.end();
    await new Promise<void>((resolve) => writeStream.on('finish', resolve));

    // Clean up chunk files
    for (const chunkFile of chunkFiles) {
      fs.unlinkSync(path.join(outputDir, chunkFile));
    }

    // Write metadata
    fs.writeFileSync(
      path.join(outputDir, 'metadata.json'),
      JSON.stringify(
        {
          sessionId: currentSession.sessionId,
          createdAt: currentSession.createdAt,
          metadata: currentSession.metadata,
          stats: currentSession.stats,
          video: currentSession.video,
          audio: currentSession.audio,
        },
        null,
        2
      )
    );

    currentSession = { ...currentSession, status: SessionStatus.COMPLETED, updatedAt: Date.now() };
    broadcastSession();

    // Hide toolbar
    toolbarWindow?.hide();
    // Show main window
    mainWindow?.show();
    mainWindow?.restore();

    const result = { ok: true, outputDir, sessionId: currentSession.sessionId };
    currentSession = null;
    outputDir = '';
    return result;
  } catch (err: any) {
    currentSession = {
      ...currentSession!,
      status: SessionStatus.ERROR,
      error: err.message || 'Finalization failed',
      updatedAt: Date.now(),
    };
    broadcastSession();
    return { ok: false, error: err.message };
  }
});

ipcMain.on(IPC.RECORDING_ERROR, (_event, error: string) => {
  if (!currentSession) return;
  currentSession = {
    ...currentSession,
    status: SessionStatus.ERROR,
    error,
    updatedAt: Date.now(),
  };
  broadcastSession();
  toolbarWindow?.hide();
  mainWindow?.show();
});

// Toolbar button actions are forwarded to the main window (which owns the MediaRecorder)
ipcMain.on(IPC.TOOLBAR_ACTION, async (_event, action: string) => {
  mainWindow?.webContents.send(IPC.TOOLBAR_ACTION, action);
});

// ─── App lifecycle ───────────────────────────────────────

app.whenReady().then(() => {
  // Grant media permissions (microphone, screen capture) automatically
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    const allowed = ['media', 'mediaKeySystem', 'display-capture', 'screen'];
    callback(allowed.includes(permission));
  });

  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    const allowed = ['media', 'mediaKeySystem', 'display-capture', 'screen'];
    return allowed.includes(permission);
  });

  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    callback({ video: undefined as any });
  });

  mainWindow = createMainWindow();
  createTray();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (!mainWindow) mainWindow = createMainWindow();
});
