import { DownloadBundleProvider } from './providers/download_bundle_provider.js';

export function getExportProvider(name = 'download_bundle') {
  if (name === 'download_bundle') return new DownloadBundleProvider();
  throw new Error(`Unknown provider: ${name}`);
}
