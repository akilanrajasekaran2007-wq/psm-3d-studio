/**
 * server.ts
 * Express backend entrypoint for Meshy 3D Studio.
 * Serves API endpoints for Text-to-3D, Image-to-3D, task polling, and GLB model downloads,
 * with Vite middleware mounted in dev.
 */

import 'dotenv/config';
import express, { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { taskManager } from './server/task-manager.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;
  const isProd = process.env.NODE_ENV === 'production';

  // Support large base64 image uploads for Image-to-3D
  app.use(express.json({ limit: '60mb' }));
  app.use(express.urlencoded({ extended: true, limit: '60mb' }));

  // CORS and security headers
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  // --- API Routes ---

  // Health and Engine Capabilities
  app.get('/api/health', (req: Request, res: Response) => {
    const engines = taskManager.getAvailableEngines();
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      engines,
    });
  });

  // Text-to-3D Generation endpoint
  app.post('/api/generate/text', async (req: Request, res: Response) => {
    try {
      const { prompt, settings } = req.body;
      if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
        res.status(400).json({ error: 'Text prompt is required.' });
        return;
      }

      const task = await taskManager.generateFromText(prompt, settings || {});
      res.status(202).json({
        taskId: task.id,
        status: task.status,
        progress: task.progress,
        engine: task.engine,
        createdAt: task.createdAt,
      });
    } catch (err: any) {
      console.error('Error starting text-to-3d task:', err);
      res.status(500).json({ error: err.message || 'Failed to start Text-to-3D generation.' });
    }
  });

  // Image-to-3D Generation endpoint
  app.post('/api/generate/image', async (req: Request, res: Response) => {
    try {
      const { image, settings } = req.body;
      if (!image || typeof image !== 'string') {
        res.status(400).json({ error: 'Valid image base64 data URL is required.' });
        return;
      }

      const task = await taskManager.generateFromImage(image, settings || {});
      res.status(202).json({
        taskId: task.id,
        status: task.status,
        progress: task.progress,
        engine: task.engine,
        createdAt: task.createdAt,
      });
    } catch (err: any) {
      console.error('Error starting image-to-3d task:', err);
      res.status(500).json({ error: err.message || 'Failed to start Image-to-3D generation.' });
    }
  });

  // Video-to-3D Generation endpoint
  app.post(['/api/generate/video', '/api/video-to-3d'], async (req: Request, res: Response) => {
    try {
      const { video, frames, bestFrame, duration, prompt, settings } = req.body;

      // Backend duration validation (must be 10 seconds or shorter)
      if (typeof duration === 'number' && duration > 10.05) {
        res.status(400).json({ error: 'Video must be 10 seconds or shorter. Please upload another video.' });
        return;
      }

      if ((!frames || !Array.isArray(frames) || frames.length === 0) && !bestFrame) {
        res.status(400).json({ error: 'Video must contain extractable visual frames for 3D reconstruction.' });
        return;
      }

      const task = await taskManager.generateFromVideo(
        { video, frames, bestFrame, duration, prompt },
        settings || {}
      );

      res.status(202).json({
        taskId: task.id,
        status: task.status,
        stage: task.stage,
        progress: task.progress,
        engine: task.engine,
        createdAt: task.createdAt,
      });
    } catch (err: any) {
      console.error('Error starting video-to-3d task:', err);
      res.status(500).json({ error: err.message || 'Failed to start Video-to-3D reconstruction.' });
    }
  });

  // Task Status Polling endpoint (with /api/video-to-3d/:taskId alias)
  app.get(['/api/tasks/:taskId', '/api/video-to-3d/:taskId'], async (req: Request, res: Response) => {
    try {
      const { taskId } = req.params;
      const task = await taskManager.getTaskStatus(taskId);
      res.json({
        id: task.id,
        type: task.type,
        prompt: task.prompt,
        imageThumbnail: task.imageThumbnail,
        videoDuration: task.videoDuration,
        engine: task.engine,
        status: task.status,
        stage: task.stage,
        progress: task.progress,
        createdAt: task.createdAt,
        completedAt: task.completedAt,
        modelUrl: task.modelUrl,
        fileSize: task.fileSize,
        error: task.error,
        settings: task.settings,
      });
    } catch (err: any) {
      res.status(404).json({ error: err.message || 'Task not found.' });
    }
  });

  // Model Download and Binary Stream endpoint (with /api/video-to-3d/:taskId/model alias)
  app.get(['/api/models/:taskId/download', '/api/models/:taskId.glb', '/api/video-to-3d/:taskId/model'], async (req: Request, res: Response) => {
    try {
      const { taskId } = req.params;
      const model = await taskManager.getGeneratedModel(taskId);

      res.setHeader('Content-Type', model.mimeType);
      res.setHeader('Content-Length', model.buffer.length);
      res.setHeader('Content-Disposition', `attachment; filename="${model.filename}"`);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.send(model.buffer);
    } catch (err: any) {
      res.status(404).json({ error: err.message || 'Model file not found or not ready.' });
    }
  });

  // Test Fixture Endpoint (for verifying 3D viewer without consuming API quota)
  app.get('/api/test-fixture', async (req: Request, res: Response) => {
    try {
      const model = await taskManager.getGeneratedModel('fixture-valid-test-cube');
      res.setHeader('Content-Type', model.mimeType);
      res.setHeader('Content-Length', model.buffer.length);
      res.setHeader('Content-Disposition', `attachment; filename="fixture-valid-test-cube.glb"`);
      res.send(model.buffer);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // History Endpoint
  app.get('/api/history', (req: Request, res: Response) => {
    const list = taskManager.getAllTasks().map((t) => ({
      id: t.id,
      type: t.type,
      prompt: t.prompt,
      imageThumbnail: t.imageThumbnail,
      videoDuration: t.videoDuration,
      engine: t.engine,
      status: t.status,
      stage: t.stage,
      progress: t.progress,
      createdAt: t.createdAt,
      completedAt: t.completedAt,
      modelUrl: t.modelUrl,
      fileSize: t.fileSize,
      error: t.error,
    }));
    res.json(list);
  });

  // Delete History Item
  app.delete('/api/history/:taskId', (req: Request, res: Response) => {
    const { taskId } = req.params;
    const deleted = taskManager.deleteTask(taskId);
    res.json({ success: deleted });
  });

  // --- Frontend Integration (Vite Middleware in Dev, Static in Prod) ---
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 PSM 3D Studio Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal error starting server:', err);
  process.exit(1);
});
