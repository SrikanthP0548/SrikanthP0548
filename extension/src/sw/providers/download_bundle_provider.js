import { getAllChunksForSession, getAnnotationsForSession } from '../db.js';

async function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  await chrome.downloads.download({ url, filename, saveAs: true });
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export class DownloadBundleProvider {
  async init(_session) {}

  async pushChunk(_sessionId, _chunkIndex, _blob) {}

  async finalize(sessionId, manifest) {
    const chunks = await getAllChunksForSession(sessionId);
    const annotations = await getAnnotationsForSession(sessionId);

    const recordingBlob = new Blob(chunks.map((c) => c.blob), { type: manifest.video.mimeType || 'video/webm' });
    const metadataBlob = new Blob([JSON.stringify(manifest.metadata, null, 2)], { type: 'application/json' });
    const annotationsBlob = new Blob([JSON.stringify(annotations, null, 2)], { type: 'application/json' });
    const manifestBlob = new Blob([JSON.stringify({ ...manifest, chunks: chunks.map((c) => ({ chunkIndex: c.chunkIndex, size: c.size, ts: c.ts })) }, null, 2)], { type: 'application/json' });

    await downloadBlob(`${sessionId}/recording.webm`, recordingBlob);
    await downloadBlob(`${sessionId}/metadata.json`, metadataBlob);
    await downloadBlob(`${sessionId}/annotations.json`, annotationsBlob);
    await downloadBlob(`${sessionId}/manifest.json`, manifestBlob);

    return { ok: true, provider: 'download_bundle', files: 4 };
  }
}
