export class LocalHttpUploadProvider {
    baseUrl;
    constructor(baseUrl = 'http://localhost:4000') {
        this.baseUrl = baseUrl;
    }
    async init(session) {
        await fetch(`${this.baseUrl}/sessions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(session)
        });
    }
    async pushChunk(sessionId, chunkIndex, blob) {
        await fetch(`${this.baseUrl}/sessions/${sessionId}/chunks?chunkIndex=${chunkIndex}`, {
            method: 'POST',
            body: blob
        });
    }
    async finalize(sessionId, manifest) {
        const resp = await fetch(`${this.baseUrl}/sessions/${sessionId}/finalize`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(manifest)
        });
        return resp.json();
    }
}
