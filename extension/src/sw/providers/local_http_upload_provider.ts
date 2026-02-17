export class LocalHttpUploadProvider {
  constructor(private readonly baseUrl = 'http://localhost:4000') {}

  async init(session: unknown): Promise<void> {
    await fetch(`${this.baseUrl}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(session)
    });
  }

  async pushChunk(sessionId: string, chunkIndex: number, blob: Blob): Promise<void> {
    await fetch(`${this.baseUrl}/sessions/${sessionId}/chunks?chunkIndex=${chunkIndex}`, {
      method: 'POST',
      body: blob
    });
  }

  async finalize(sessionId: string, manifest: unknown): Promise<unknown> {
    const resp = await fetch(`${this.baseUrl}/sessions/${sessionId}/finalize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(manifest)
    });
    return resp.json();
  }
}
