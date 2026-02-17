const DB_NAME = 'logix_recorder_v1';
const DB_VERSION = 1;

export const stores = {
  sessions: 'sessions',
  chunks: 'chunks',
  annotations: 'annotations',
  drafts: 'drafts'
};

let dbPromise;

export function getDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(stores.sessions)) {
        db.createObjectStore(stores.sessions, { keyPath: 'sessionId' });
      }
      if (!db.objectStoreNames.contains(stores.chunks)) {
        db.createObjectStore(stores.chunks, { keyPath: ['sessionId', 'chunkIndex'] });
      }
      if (!db.objectStoreNames.contains(stores.annotations)) {
        db.createObjectStore(stores.annotations, { keyPath: 'annotationId' });
      }
      if (!db.objectStoreNames.contains(stores.drafts)) {
        db.createObjectStore(stores.drafts, { keyPath: 'draftId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function put(store, value) {
  const db = await getDB();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).put(value);
  await txDone(tx);
  return value;
}

export async function get(store, key) {
  const db = await getDB();
  const tx = db.transaction(store, 'readonly');
  const req = tx.objectStore(store).get(key);
  const value = await new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  await txDone(tx);
  return value;
}

export async function getAll(store) {
  const db = await getDB();
  const tx = db.transaction(store, 'readonly');
  const req = tx.objectStore(store).getAll();
  const value = await new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
  await txDone(tx);
  return value;
}

export async function getAllChunksForSession(sessionId) {
  const all = await getAll(stores.chunks);
  return all
    .filter((c) => c.sessionId === sessionId)
    .sort((a, b) => a.chunkIndex - b.chunkIndex);
}

export async function getAnnotationsForSession(sessionId) {
  const all = await getAll(stores.annotations);
  return all.filter((a) => a.sessionId === sessionId).sort((a, b) => a.tsMs - b.tsMs);
}
