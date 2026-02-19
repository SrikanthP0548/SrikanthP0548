/// <reference path="../../shared/logix-api.d.ts" />

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

const timer = $('#timer') as HTMLSpanElement;
const recDot = document.querySelector('.rec-dot') as HTMLSpanElement;
const pauseBtn = $('#pause-btn') as HTMLButtonElement;
const resumeBtn = $('#resume-btn') as HTMLButtonElement;
const muteBtn = $('#mute-btn') as HTMLButtonElement;
const muteBtnMuted = $('#mute-btn-muted') as HTMLButtonElement;
const stopBtn = $('#stop-btn') as HTMLButtonElement;

let durationSec = 0;
let timerInterval: ReturnType<typeof setInterval> | null = null;
let isPaused = false;
let isMuted = false;

function formatTime(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function startTimer(): void {
  if (timerInterval) return;
  timerInterval = setInterval(() => {
    durationSec++;
    timer.textContent = formatTime(durationSec);
  }, 1000);
}

function stopTimer(): void {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

// ─── Button handlers ──────────────────────────────────────
pauseBtn.addEventListener('click', () => {
  window.logix.sendToolbarAction('pause');
  isPaused = true;
  pauseBtn.hidden = true;
  resumeBtn.hidden = false;
  recDot.classList.add('paused');
  stopTimer();
});

resumeBtn.addEventListener('click', () => {
  window.logix.sendToolbarAction('resume');
  isPaused = false;
  pauseBtn.hidden = false;
  resumeBtn.hidden = true;
  recDot.classList.remove('paused');
  startTimer();
});

muteBtn.addEventListener('click', () => {
  window.logix.sendToolbarAction('mute');
  isMuted = true;
  muteBtn.hidden = true;
  muteBtnMuted.hidden = false;
});

muteBtnMuted.addEventListener('click', () => {
  window.logix.sendToolbarAction('mute');
  isMuted = false;
  muteBtn.hidden = false;
  muteBtnMuted.hidden = true;
});

stopBtn.addEventListener('click', () => {
  window.logix.sendToolbarAction('stop');
  stopTimer();
});

// ─── Session state listener ───────────────────────────────
window.logix.onSessionUpdate((session) => {
  if (!session) return;

  if (session.status === 'RECORDING' && !timerInterval) {
    startTimer();
  }
  if (session.status === 'STOPPING' || session.status === 'COMPLETED') {
    stopTimer();
  }
});

// Start timer immediately (toolbar only shown during recording)
startTimer();

export {};
