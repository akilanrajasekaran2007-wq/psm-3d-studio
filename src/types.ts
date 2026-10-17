/**
 * types.ts
 * Application types for Meshy 3D Studio
 */

export type ArtStyle = 'realistic' | 'cartoon' | 'low-poly' | 'sculpture' | 'pbr';
export type EngineType = 'gemini';

export interface GenerationSettings {
  engine: EngineType;
  artStyle: ArtStyle;
  negativePrompt?: string;
  symmetryMode: 'off' | 'auto' | 'on';
  topology: 'triangle' | 'quad';
  targetPolycount: number;
  enablePbr: boolean;
  surfaceMode: 'hard' | 'organic';
}

export interface TaskItem {
  id: string;
  type: 'text-to-3d' | 'image-to-3d' | 'video-to-3d';
  prompt?: string;
  imageThumbnail?: string;
  videoDuration?: number;
  engine: EngineType;
  status: 'QUEUED' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED';
  stage?: 'Ready' | 'Uploading' | 'Processing Video' | 'Extracting Frames' | 'Reconstructing 3D Model' | 'Preparing 3D Asset' | 'Completed' | 'Failed' | 'Cancelled';
  progress: number;
  createdAt: string;
  completedAt?: string;
  modelUrl?: string;
  fileSize?: number;
  error?: string;
  settings?: Partial<GenerationSettings>;
}

export interface EngineHealthInfo {
  meshy: { configured: boolean };
  gemini: { configured: boolean };
  local: { configured: boolean; url: string };
}
