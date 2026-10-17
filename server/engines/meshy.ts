/**
 * meshy.ts
 * Official Meshy AI Integration Engine
 * Connects to api.meshy.ai for Text-to-3D and Image-to-3D generation.
 */

export interface MeshySettings {
  artStyle?: 'realistic' | 'sculpture' | 'pbr' | 'cartoon' | 'low-poly';
  negativePrompt?: string;
  symmetryMode?: 'off' | 'auto' | 'on';
  topology?: 'triangle' | 'quad';
  targetPolycount?: number;
  enablePbr?: boolean;
  surfaceMode?: 'hard' | 'organic';
}

export class MeshyEngine {
  private apiKey: string;
  private baseUrl = 'https://api.meshy.ai';

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.MESHY_API_KEY || '';
  }

  public isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }

  /**
   * Submit Text-to-3D task to Meshy AI API v2
   */
  public async submitTextTo3D(prompt: string, settings: MeshySettings = {}): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error('MESHY_API_KEY is not configured on the server. Please provide an API key in settings or .env file.');
    }

    const payload = {
      mode: 'preview',
      prompt: prompt.trim(),
      art_style: settings.artStyle || 'realistic',
      negative_prompt: settings.negativePrompt || 'low quality, low resolution, deformed, broken geometry',
      symmetry_mode: settings.symmetryMode || 'off',
      topology: settings.topology || 'triangle',
      target_polycount: settings.targetPolycount || 30000,
      enable_pbr: settings.enablePbr !== false,
    };

    const res = await fetch(`${this.baseUrl}/openapi/v2/text-to-3d`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      let errMsg = `Meshy Text-to-3D failed with HTTP ${res.status}`;
      try {
        const errJson = JSON.parse(errText);
        errMsg = errJson.message || errJson.error || errMsg;
      } catch {
        errMsg = `${errMsg}: ${errText}`;
      }
      throw new Error(errMsg);
    }

    const data = await res.json();
    if (!data.result) {
      throw new Error(`Unexpected Meshy response: ${JSON.stringify(data)}`);
    }

    return data.result;
  }

  /**
   * Submit Image-to-3D task to Meshy AI API v1
   */
  public async submitImageTo3D(imageDataUrlOrUrl: string, settings: MeshySettings = {}): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error('MESHY_API_KEY is not configured on the server. Please provide an API key in settings or .env file.');
    }

    const payload = {
      image_url: imageDataUrlOrUrl,
      enable_pbr: settings.enablePbr !== false,
      surface_mode: settings.surfaceMode || 'hard',
    };

    const res = await fetch(`${this.baseUrl}/openapi/v1/image-to-3d`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      let errMsg = `Meshy Image-to-3D failed with HTTP ${res.status}`;
      try {
        const errJson = JSON.parse(errText);
        errMsg = errJson.message || errJson.error || errMsg;
      } catch {
        errMsg = `${errMsg}: ${errText}`;
      }
      throw new Error(errMsg);
    }

    const data = await res.json();
    if (!data.result) {
      throw new Error(`Unexpected Meshy response: ${JSON.stringify(data)}`);
    }

    return data.result;
  }

  /**
   * Query status of a Meshy task
   */
  public async pollTask(taskId: string, type: 'text-to-3d' | 'image-to-3d' = 'text-to-3d'): Promise<{
    status: 'QUEUED' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED';
    progress: number;
    modelUrl?: string;
    error?: string;
  }> {
    if (!this.isConfigured()) {
      throw new Error('MESHY_API_KEY is not configured.');
    }

    const endpoint = type === 'text-to-3d'
      ? `${this.baseUrl}/openapi/v2/text-to-3d/${taskId}`
      : `${this.baseUrl}/openapi/v1/image-to-3d/${taskId}`;

    const res = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
      },
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Meshy task poll error (${res.status}): ${errText}`);
    }

    const data = await res.json();
    const rawStatus = (data.status || '').toUpperCase();

    let status: 'QUEUED' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED' = 'PROCESSING';
    if (rawStatus === 'PENDING' || rawStatus === 'QUEUED') {
      status = 'QUEUED';
    } else if (rawStatus === 'IN_PROGRESS') {
      status = 'PROCESSING';
    } else if (rawStatus === 'SUCCEEDED') {
      status = 'SUCCEEDED';
    } else if (rawStatus === 'FAILED' || rawStatus === 'EXPIRED') {
      status = 'FAILED';
    }

    const progress = typeof data.progress === 'number' ? data.progress : (status === 'SUCCEEDED' ? 100 : 10);
    const modelUrl = data.model_urls?.glb || data.model_urls?.obj || undefined;
    const error = data.task_error?.message || (status === 'FAILED' ? 'Meshy generation failed' : undefined);

    return {
      status,
      progress,
      modelUrl,
      error,
    };
  }

  /**
   * Downloads model file buffer from remote URL
   */
  public async downloadModel(modelUrl: string): Promise<Buffer> {
    const res = await fetch(modelUrl);
    if (!res.ok) {
      throw new Error(`Failed to download model from provider (${res.status})`);
    }
    const arrayBuf = await res.arrayBuffer();
    return Buffer.from(arrayBuf);
  }
}
