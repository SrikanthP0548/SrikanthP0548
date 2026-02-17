import type { SessionRecord } from './messages.js';

const DB_NAME = 'logix_recorder_v1';
const DB_VERSION = 1;

export const stores = {
  sessions: 'sessions',
  chunks: 'chunks',
  annotations: 'annotations',
  drafts: 'drafts'
} as const;

type StoreName = (typeof stores)[keyof typeof stores];

export interface ChunkRecord {
  sessionId: string;
  chunkIndex: number;
  ts: number;
  blob: Blob;
  size: number;
}

export interface AnnotationRecord {
  annotationId: string;
  sessionId: string;
  tsMs: number;
  type: 'STEP' | 'INFO' | 'WARN' | 'QUESTION';
  text: string;
  url: string;
  tabTitle: string;
}

let dbPromise: Promise<IDBDatabase> | null = null;

export function getDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(stores.sessions)) db.createObjectStore(stores.sessions, { keyPath: 'sessionId' });
      if (!db.objectStoreNames.contains(stores.chunks)) db.createObjectStore(stores.chunks, { keyPath: ['sessionId', 'chunkIndex'] });
      if (!db.objectStoreNames.contains(stores.annotations)) db.createObjectStore(stores.annotations, { keyPath: 'annotationId' });
      if (!db.objectStoreNames.contains(stores.drafts)) db.createObjectStore(stores.drafts, { keyPath: 'draftId' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  return dbPromise;
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function put<T>(store: StoreName, value: T): Promise<T> {
  const db = await getDB();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).put(value as any);
  await txDone(tx);
  return value;
}

export async function get<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
  const db = await getDB();
  const tx = db.transaction(store, 'readonly');
  const req = tx.objectStore(store).get(key);
  const value = await new Promise<T | undefined>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
  await txDone(tx);
  return value;
}

export async function getAll<T>(store: StoreName): Promise<T[]> {
  const db = await getDB();
  const tx = db.transaction(store, 'readonly');
  const req = tx.objectStore(store).getAll();
  const value = await new Promise<T[]>((resolve, reject) => {
    req.onsuccess = () => resolve((req.result as T[]) || []);
    req.onerror = () => reject(req.error);
  });
  await txDone(tx);
  return value;
}

export async function getAllChunksForSession(sessionId: string): Promise<ChunkRecord[]> {
  const all = await getAll<ChunkRecord>(stores.chunks);
  return all.filter((c) => c.sessionId === sessionId).sort((a, b) => a.chunkIndex - b.chunkIndex);
}

export async function getAnnotationsForSession(sessionId: string): Promise<AnnotationRecord[]> {
  const all = await getAll<AnnotationRecord>(stores.annotations);
  return all.filter((a) => a.sessionId === sessionId).sort((a, b) => a.tsMs - b.tsMs);
}

export type { SessionRecord };
