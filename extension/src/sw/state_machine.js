import { SessionStatus } from './messages.js';

const allowed = {
  [SessionStatus.IDLE]: [SessionStatus.DRAFT, SessionStatus.PREPARING],
  [SessionStatus.DRAFT]: [SessionStatus.PREPARING, SessionStatus.IDLE],
  [SessionStatus.PREPARING]: [SessionStatus.RECORDING, SessionStatus.ERROR],
  [SessionStatus.RECORDING]: [SessionStatus.PAUSED, SessionStatus.STOPPING, SessionStatus.ERROR],
  [SessionStatus.PAUSED]: [SessionStatus.RECORDING, SessionStatus.STOPPING, SessionStatus.ERROR],
  [SessionStatus.STOPPING]: [SessionStatus.FINALIZING, SessionStatus.ERROR],
  [SessionStatus.FINALIZING]: [SessionStatus.READY_TO_EXPORT, SessionStatus.ERROR],
  [SessionStatus.READY_TO_EXPORT]: [SessionStatus.EXPORTING, SessionStatus.COMPLETED],
  [SessionStatus.EXPORTING]: [SessionStatus.COMPLETED, SessionStatus.ERROR],
  [SessionStatus.COMPLETED]: [SessionStatus.IDLE],
  [SessionStatus.ERROR]: [SessionStatus.IDLE, SessionStatus.READY_TO_EXPORT]
};

export function canTransition(from, to) {
  return !!allowed[from]?.includes(to);
}

export function transition(session, nextStatus, patch = {}) {
  if (session.status && !canTransition(session.status, nextStatus) && session.status !== nextStatus) {
    throw new Error(`Invalid transition ${session.status} -> ${nextStatus}`);
  }
  return {
    ...session,
    ...patch,
    status: nextStatus,
    updatedAt: Date.now()
  };
}
