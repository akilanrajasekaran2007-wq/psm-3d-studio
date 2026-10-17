/**
 * local-server.ts
 * Adapter for self-hosted or local Python 3D model inference servers
 * (such as TripoSR, Trellis, or custom FastAPI 3D endpoints).
 */

export class LocalModelServerEngine {
  private serverUrl: string;

  constructor(serverUrl?: string) {
    this.serverUrl = (serverUrl || process.env.LOCAL_3D_SERVER_URL || 'http://localhost:8000').replace(/\/$/, '');
  }

  public async checkHealth(): Promise<{ available: boolean; engine?: string; error?: string }> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(`${this.serverUrl}/health`, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        return { available: true, engine: data.model || 'TripoSR/Local-3D' };
      }
      return { available: false, error: `HTTP ${res.status}` };
    } catch (err: any) {
      return { available: false, error: err.message || 'Cannot connect to local model server' };
    }
  }

  public async generateFromText(prompt: string, settings: any = {}): Promise<string> {
    const res = await fetch(`${this.serverUrl}/generate/text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, settings }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Local model server error (${res.status}): ${text}`);
    }

    const data = await res.json();
    return data.taskId || data.task_id || data.id;
  }

  public async generateFromImage(imageDataUrl: string, settings: any = {}): Promise<string> {
    const res = await fetch(`${this.serverUrl}/generate/image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: imageDataUrl, settings }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Local model server error (${res.status}): ${text}`);
    }

    const data = await res.json();
    return data.taskId || data.task_id || data.id;
  }

  public async getStatus(taskId: string): Promise<{
    status: 'QUEUED' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED';
    progress: number;
    error?: string;
  }> {
    const res = await fetch(`${this.serverUrl}/tasks/${taskId}`);
    if (!res.ok) {
      throw new Error(`Local server task query failed (${res.status})`);
    }
    const data = await res.json();
    return {
      status: data.status,
      progress: data.progress ?? (data.status === 'SUCCEEDED' ? 100 : 50),
      error: data.error,
    };
  }

  public async fetchModel(taskId: string): Promise<Buffer> {
    const res = await fetch(`${this.serverUrl}/models/${taskId}.glb`);
    if (!res.ok) {
      throw new Error(`Failed to download model from local server (${res.status})`);
    }
    const buf = await res.arrayBuffer();
    return Buffer.from(buf);
  }
}
