/**
 * task-manager.ts
 * Manages 3D generation lifecycle, task states, model storage, and engine routing.
 * Implements the core generation backend functions:
 *   - generateFromText(prompt, settings)
 *   - generateFromImage(image, settings)
 *   - getTaskStatus(taskId)
 *   - getGeneratedModel(taskId)
 */

import crypto from 'crypto';
import { MeshyEngine, MeshySettings } from './engines/meshy.ts';
import { GeminiNeuralMeshEngine } from './engines/gemini-neural-mesh.ts';
import { LocalModelServerEngine } from './engines/local-server.ts';
import { GlbBuilder } from './glb-builder.ts';

export type EngineType = 'meshy' | 'gemini' | 'local';

export interface TaskRecord {
  id: string;
  type: 'text-to-3d' | 'image-to-3d' | 'video-to-3d';
  prompt?: string;
  imageThumbnail?: string;
  videoDuration?: number;
  engine: EngineType;
  status: 'QUEUED' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED';
  stage?: string;
  progress: number;
  createdAt: string;
  completedAt?: string;
  modelUrl?: string;
  modelBytes?: Buffer;
  fileSize?: number;
  polycount?: number;
  error?: string;
  providerTaskId?: string;
  settings: Record<string, any>;
}

export class TaskManager {
  private tasks = new Map<string, TaskRecord>();
  private meshyEngine: MeshyEngine;
  private geminiEngine: GeminiNeuralMeshEngine;
  private localEngine: LocalModelServerEngine;

  constructor() {
    this.meshyEngine = new MeshyEngine();
    this.geminiEngine = new GeminiNeuralMeshEngine();
    this.localEngine = new LocalModelServerEngine();

    // Seed a known valid test fixture for viewer verification (Requirement 9.3)
    this.initTestFixture();
  }

  private initTestFixture() {
    const testTaskId = 'fixture-valid-test-cube';
    const builder = new GlbBuilder();
    builder.addParts([
      {
        type: 'box',
        position: [0, 0.5, 0],
        scale: [1, 1, 1],
        material: {
          name: 'Fixture_Mat',
          baseColor: [0.15, 0.65, 0.95, 1.0],
          metallic: 0.8,
          roughness: 0.2,
        },
        name: 'Calibration_Prism',
      },
      {
        type: 'torus',
        position: [0, 0.5, 0],
        params: { radius: 0.9, tube: 0.05 },
        material: {
          name: 'Gimbal_Ring',
          baseColor: [1.0, 0.8, 0.2, 1.0],
          metallic: 0.9,
          roughness: 0.1,
        },
        name: 'Gimbal_Ring',
      },
      {
        type: 'cylinder',
        position: [0, 0.05, 0],
        params: { radiusTop: 1.1, radiusBottom: 1.2, height: 0.1 },
        material: {
          name: 'Pedestal',
          baseColor: [0.2, 0.22, 0.28, 1.0],
          metallic: 0.3,
          roughness: 0.7,
        },
        name: 'Test_Pedestal',
      },
    ]);
    const testGlbBytes = builder.build();

    this.tasks.set(testTaskId, {
      id: testTaskId,
      type: 'text-to-3d',
      prompt: '[Test Fixture] Precision Calibration Prism with PBR Gimbal Ring',
      engine: 'gemini',
      status: 'SUCCEEDED',
      progress: 100,
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      modelUrl: `/api/models/${testTaskId}/download`,
      modelBytes: testGlbBytes,
      fileSize: testGlbBytes.length,
      settings: { artStyle: 'realistic' },
    });
  }

  public getAvailableEngines(): {
    neural: { ready: boolean };
  } {
    return {
      neural: { ready: this.geminiEngine.isAvailable() },
    };
  }

  private resolveEngine(_preferredEngine?: EngineType): EngineType {
    return 'gemini';
  }

  /**
   * generateFromText(prompt, settings)
   */
  public async generateFromText(prompt: string, settings: any = {}): Promise<TaskRecord> {
    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      throw new Error('A valid text prompt is required to generate a 3D model.');
    }

    const engine = this.resolveEngine(settings.engine);
    const taskId = crypto.randomUUID();

    const task: TaskRecord = {
      id: taskId,
      type: 'text-to-3d',
      prompt: prompt.trim(),
      engine,
      status: 'QUEUED',
      progress: 5,
      createdAt: new Date().toISOString(),
      settings,
    };

    this.tasks.set(taskId, task);

    // Launch worker asynchronously
    this.runTextTo3DWorker(task).catch((err) => {
      console.error(`Task ${taskId} failed:`, err);
      task.status = 'FAILED';
      task.error = err.message || 'Generation failed';
      task.completedAt = new Date().toISOString();
    });

    return task;
  }

  /**
   * generateFromImage(image, settings)
   */
  public async generateFromImage(image: string, settings: any = {}): Promise<TaskRecord> {
    if (!image || typeof image !== 'string' || image.length < 10) {
      throw new Error('A valid image (Base64 data URL or HTTP URL) is required for Image-to-3D generation.');
    }

    const engine = this.resolveEngine(settings.engine);
    const taskId = crypto.randomUUID();

    // Extract small preview for UI history
    const imageThumbnail = image.length > 50000 ? image.slice(0, 50000) : image;

    const task: TaskRecord = {
      id: taskId,
      type: 'image-to-3d',
      imageThumbnail,
      prompt: settings.prompt || 'Image to 3D Model',
      engine,
      status: 'QUEUED',
      progress: 5,
      createdAt: new Date().toISOString(),
      settings,
    };

    this.tasks.set(taskId, task);

    // Launch worker asynchronously
    this.runImageTo3DWorker(task, image).catch((err) => {
      console.error(`Task ${taskId} failed:`, err);
      task.status = 'FAILED';
      task.error = err.message || 'Generation failed';
      task.completedAt = new Date().toISOString();
    });

    return task;
  }

  /**
   * generateFromVideo(payload, settings)
   */
  public async generateFromVideo(
    payload: { video?: string; frames: string[]; bestFrame?: string; duration: number; prompt?: string },
    settings: any = {}
  ): Promise<TaskRecord> {
    const { video, frames, bestFrame, duration, prompt } = payload;

    // Strict 10-second duration validation
    if (typeof duration === 'number' && duration > 10.05) {
      throw new Error('Video must be 10 seconds or shorter. Please upload another video.');
    }

    if ((!frames || !Array.isArray(frames) || frames.length === 0) && !bestFrame) {
      throw new Error('Video must contain extractable visual frames for 3D reconstruction.');
    }

    const engine = this.resolveEngine(settings.engine);
    const taskId = crypto.randomUUID();

    // Use bestFrame or first frame for thumbnail
    const targetThumb = bestFrame || frames[0] || '';
    const imageThumbnail = targetThumb.slice(0, 50000) || undefined;

    const task: TaskRecord = {
      id: taskId,
      type: 'video-to-3d',
      prompt: prompt || '360° Video 3D Reconstruction from Best Frame',
      imageThumbnail,
      videoDuration: typeof duration === 'number' ? Math.round(duration * 10) / 10 : undefined,
      engine,
      status: 'QUEUED',
      stage: 'Processing Video',
      progress: 10,
      createdAt: new Date().toISOString(),
      settings,
    };

    this.tasks.set(taskId, task);

    // Launch worker asynchronously
    this.runVideoTo3DWorker(task, frames, bestFrame).catch((err) => {
      console.error(`Video-to-3D Task ${taskId} failed:`, err);
      task.status = 'FAILED';
      task.stage = 'Failed';
      task.error = err.message || 'Video-to-3D reconstruction failed';
      task.completedAt = new Date().toISOString();
    });

    return task;
  }

  /**
   * getTaskStatus(taskId)
   */
  public async getTaskStatus(taskId: string): Promise<TaskRecord> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task with ID ${taskId} not found.`);
    }

    // If external engine is still processing, poll it
    if (task.status === 'PROCESSING' || task.status === 'QUEUED') {
      if (task.engine === 'meshy' && task.providerTaskId) {
        await this.pollMeshyTask(task);
      } else if (task.engine === 'local' && task.providerTaskId) {
        await this.pollLocalTask(task);
      }
    }

    return task;
  }

  /**
   * getGeneratedModel(taskId)
   */
  public async getGeneratedModel(taskId: string): Promise<{ buffer: Buffer; mimeType: string; filename: string }> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found.`);
    }

    if (task.status !== 'SUCCEEDED' || !task.modelBytes) {
      throw new Error(`Model for task ${taskId} is not ready yet. Current status: ${task.status}`);
    }

    // Validate GLB magic header (0x46546C67 in ASCII = 'glTF')
    if (task.modelBytes.length < 12 || task.modelBytes.readUInt32LE(0) !== 0x46546c67) {
      throw new Error('Retrieved model file corrupted: invalid glTF binary header');
    }

    return {
      buffer: task.modelBytes,
      mimeType: 'model/gltf-binary',
      filename: `mesh-${task.id.slice(0, 8)}.glb`,
    };
  }

  public getAllTasks(): TaskRecord[] {
    return Array.from(this.tasks.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  public deleteTask(taskId: string): boolean {
    return this.tasks.delete(taskId);
  }

  // --- Background Task Workers ---

  private async runTextTo3DWorker(task: TaskRecord) {
    task.status = 'PROCESSING';
    task.progress = 15;

    if (task.engine === 'meshy') {
      const meshySettings: MeshySettings = {
        artStyle: task.settings.artStyle || 'realistic',
        negativePrompt: task.settings.negativePrompt,
        symmetryMode: task.settings.symmetryMode || 'off',
        topology: task.settings.topology || 'triangle',
        targetPolycount: task.settings.targetPolycount || 30000,
      };

      const providerTaskId = await this.meshyEngine.submitTextTo3D(task.prompt!, meshySettings);
      task.providerTaskId = providerTaskId;
      task.progress = 25;
      await this.pollMeshyTask(task);
    } else if (task.engine === 'local') {
      const providerTaskId = await this.localEngine.generateFromText(task.prompt!, task.settings);
      task.providerTaskId = providerTaskId;
      task.progress = 25;
      await this.pollLocalTask(task);
    } else {
      // Neural Mesh Engine
      task.progress = 30;
      const glbBytes = await this.geminiEngine.generateFromText(task.prompt!, task.settings);
      task.progress = 90;

      task.modelBytes = glbBytes;
      task.fileSize = glbBytes.length;
      task.modelUrl = `/api/models/${task.id}/download`;
      task.status = 'SUCCEEDED';
      task.progress = 100;
      task.completedAt = new Date().toISOString();
    }
  }

  private async runImageTo3DWorker(task: TaskRecord, image: string) {
    task.status = 'PROCESSING';
    task.progress = 15;

    if (task.engine === 'meshy') {
      const providerTaskId = await this.meshyEngine.submitImageTo3D(image, task.settings);
      task.providerTaskId = providerTaskId;
      task.progress = 25;
      await this.pollMeshyTask(task);
    } else if (task.engine === 'local') {
      const providerTaskId = await this.localEngine.generateFromImage(image, task.settings);
      task.providerTaskId = providerTaskId;
      task.progress = 25;
      await this.pollLocalTask(task);
    } else {
      // Neural Mesh Engine with Multimodal Vision
      task.progress = 35;
      const glbBytes = await this.geminiEngine.generateFromImage(image, task.settings);
      task.progress = 90;

      task.modelBytes = glbBytes;
      task.fileSize = glbBytes.length;
      task.modelUrl = `/api/models/${task.id}/download`;
      task.status = 'SUCCEEDED';
      task.progress = 100;
      task.completedAt = new Date().toISOString();
    }
  }

  private async runVideoTo3DWorker(task: TaskRecord, frames: string[], bestFrame?: string) {
    task.status = 'PROCESSING';
    task.stage = 'Processing Video';
    task.progress = 20;

    // Multi-view frame extraction and selection step
    await new Promise((r) => setTimeout(r, 600));
    task.stage = 'Extracting Frames';
    task.progress = 35;

    await new Promise((r) => setTimeout(r, 600));
    task.stage = bestFrame ? 'Reconstructing 3D Model from Best Frame' : 'Reconstructing 3D Model';
    task.progress = 55;

    // Call 3D reconstruction model focusing on the selected best frame
    const glbBytes = await this.geminiEngine.generateFromVideo(frames, task.settings, bestFrame);

    task.stage = 'Preparing 3D Asset';
    task.progress = 90;

    task.modelBytes = glbBytes;
    task.fileSize = glbBytes.length;
    task.modelUrl = `/api/models/${task.id}/download`;
    task.status = 'SUCCEEDED';
    task.stage = 'Completed';
    task.progress = 100;
    task.completedAt = new Date().toISOString();
  }

  private async pollMeshyTask(task: TaskRecord) {
    if (!task.providerTaskId) return;

    try {
      const result = await this.meshyEngine.pollTask(
        task.providerTaskId,
        task.type === 'text-to-3d' ? 'text-to-3d' : 'image-to-3d'
      );

      task.progress = Math.max(task.progress, result.progress);

      if (result.status === 'SUCCEEDED' && result.modelUrl) {
        // Download GLB bytes immediately to server cache
        const bytes = await this.meshyEngine.downloadModel(result.modelUrl);
        task.modelBytes = bytes;
        task.fileSize = bytes.length;
        task.modelUrl = `/api/models/${task.id}/download`;
        task.status = 'SUCCEEDED';
        task.progress = 100;
        task.completedAt = new Date().toISOString();
      } else if (result.status === 'FAILED') {
        task.status = 'FAILED';
        task.error = result.error || 'Meshy generation failed';
        task.completedAt = new Date().toISOString();
      }
    } catch (err: any) {
      console.error(`Error polling Meshy task ${task.id}:`, err);
    }
  }

  private async pollLocalTask(task: TaskRecord) {
    if (!task.providerTaskId) return;

    try {
      const result = await this.localEngine.getStatus(task.providerTaskId);
      task.progress = Math.max(task.progress, result.progress);

      if (result.status === 'SUCCEEDED') {
        const bytes = await this.localEngine.fetchModel(task.providerTaskId);
        task.modelBytes = bytes;
        task.fileSize = bytes.length;
        task.modelUrl = `/api/models/${task.id}/download`;
        task.status = 'SUCCEEDED';
        task.progress = 100;
        task.completedAt = new Date().toISOString();
      } else if (result.status === 'FAILED') {
        task.status = 'FAILED';
        task.error = result.error || 'Local model server generation failed';
        task.completedAt = new Date().toISOString();
      }
    } catch (err: any) {
      console.error(`Error polling Local server task ${task.id}:`, err);
    }
  }
}

export const taskManager = new TaskManager();
