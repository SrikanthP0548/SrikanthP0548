import { DownloadBundleProvider } from './providers/download_bundle_provider.js';

export interface ExportProvider {
  init(session: unknown): Promise<void>;
  pushChunk(sessionId: string, chunkIndex: number, blob: Blob): Promise<void>;
  finalize(sessionId: string, manifest: unknown): Promise<unknown>;
}

export function getExportProvider(name = 'download_bundle'): ExportProvider {
  if (name === 'download_bundle') return new DownloadBundleProvider();
  throw new Error(`Unknown provider: ${name}`);
}
