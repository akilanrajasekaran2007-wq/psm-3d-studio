/**
 * App.tsx
 * Meshy 3D Studio - AI 3D Model Generation Application
 * Full end-to-end integration with Text-to-3D, Image-to-3D, Three.js Viewport,
 * Task lifecycle management, GLB binary download, and History.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Viewer3D, ShadingMode } from './components/Viewer3D.tsx';
import { ViewerDock } from './components/ViewerDock.tsx';
import { GenerationSidebar } from './components/GenerationSidebar.tsx';
import { TaskHistoryDrawer } from './components/TaskHistoryDrawer.tsx';
import { EngineSettingsModal } from './components/EngineSettingsModal.tsx';
import { GenerationSettings, TaskItem, EngineHealthInfo } from './types.ts';
import {
  History,
  Settings2,
  Box,
  Download,
  AlertCircle,
  Sparkles,
  Maximize2,
} from 'lucide-react';

export default function App() {
  // Model state
  const [currentModelUrl, setCurrentModelUrl] = useState<string | null>('/api/test-fixture');
  const [currentTaskId, setCurrentTaskId] = useState<string | null>('fixture-valid-test-cube');
  const [modelStats, setModelStats] = useState<{
    polycount: number;
    vertexCount: number;
    meshCount: number;
  } | null>(null);
  const [modelFileSize, setModelFileSize] = useState<number | undefined>(undefined);

  // Viewport Settings
  const [shadingMode, setShadingMode] = useState<ShadingMode>('pbr');
  const [autoRotate, setAutoRotate] = useState<boolean>(true);
  const [showGrid, setShowGrid] = useState<boolean>(true);

  // Camera hooks
  const resetCameraFnRef = useRef<(() => void) | null>(null);
  const setCameraViewFnRef = useRef<((view: 'front' | 'top' | 'isometric' | 'side') => void) | null>(null);

  // Task & Engine State
  const [activeTask, setActiveTask] = useState<TaskItem | null>(null);
  const [taskHistory, setTaskHistory] = useState<TaskItem[]>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [engines, setEngines] = useState<EngineHealthInfo | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch initial health & task history
  const fetchHealthAndHistory = useCallback(async () => {
    try {
      const [healthRes, historyRes] = await Promise.all([
        fetch('/api/health'),
        fetch('/api/history'),
      ]);

      if (healthRes.ok) {
        const healthData = await healthRes.json();
        setEngines(healthData.engines);
      }

      if (historyRes.ok) {
        const historyData: TaskItem[] = await historyRes.json();
        setTaskHistory(historyData);
        // If no model is set yet, check if history has a succeeded model
        if (!currentModelUrl && historyData.length > 0) {
          const firstSucc = historyData.find((t) => t.status === 'SUCCEEDED');
          if (firstSucc && firstSucc.modelUrl) {
            setCurrentModelUrl(firstSucc.modelUrl);
            setCurrentTaskId(firstSucc.id);
            setModelFileSize(firstSucc.fileSize);
          }
        }
      }
    } catch (err) {
      console.error('Failed to load initial backend state:', err);
    }
  }, [currentModelUrl]);

  useEffect(() => {
    fetchHealthAndHistory();
  }, [fetchHealthAndHistory]);

  // Clean polling timer on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  // Poll active task status
  const startPollingTask = (taskId: string) => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);

    pollIntervalRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/tasks/${taskId}`);
        if (!res.ok) return;

        const updated: TaskItem = await res.json();
        setActiveTask(updated);

        // Update in history list too
        setTaskHistory((prev) =>
          prev.map((t) => (t.id === updated.id ? { ...t, ...updated } : t))
        );

        if (updated.status === 'SUCCEEDED') {
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
          if (updated.modelUrl) {
            setCurrentModelUrl(updated.modelUrl);
            setCurrentTaskId(updated.id);
            setModelFileSize(updated.fileSize);
          }
        } else if (updated.status === 'FAILED') {
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        }
      } catch (err) {
        console.error('Task poll error:', err);
      }
    }, 1500);
  };

  // Handle Text-to-3D Generation
  const handleGenerateText = async (prompt: string, settings: GenerationSettings) => {
    try {
      const res = await fetch('/api/generate/text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, settings }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `HTTP ${res.status}`);
      }

      const taskData = await res.json();
      const newTask: TaskItem = {
        id: taskData.taskId,
        type: 'text-to-3d',
        prompt,
        engine: taskData.engine || settings.engine,
        status: taskData.status || 'QUEUED',
        progress: taskData.progress || 5,
        createdAt: taskData.createdAt || new Date().toISOString(),
        settings,
      };

      setActiveTask(newTask);
      setTaskHistory((prev) => [newTask, ...prev]);
      startPollingTask(newTask.id);
    } catch (err: any) {
      alert(`Generation failed: ${err.message}`);
    }
  };

  // Handle Image-to-3D Generation
  const handleGenerateImage = async (imageDataUrl: string, settings: GenerationSettings) => {
    try {
      const res = await fetch('/api/generate/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: imageDataUrl, settings }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `HTTP ${res.status}`);
      }

      const taskData = await res.json();
      const newTask: TaskItem = {
        id: taskData.taskId,
        type: 'image-to-3d',
        imageThumbnail: imageDataUrl.slice(0, 50000),
        prompt: 'Image-to-3D Asset',
        engine: taskData.engine || settings.engine,
        status: taskData.status || 'QUEUED',
        progress: taskData.progress || 5,
        createdAt: taskData.createdAt || new Date().toISOString(),
        settings,
      };

      setActiveTask(newTask);
      setTaskHistory((prev) => [newTask, ...prev]);
      startPollingTask(newTask.id);
    } catch (err: any) {
      alert(`Generation failed: ${err.message}`);
    }
  };

  // Handle Video-to-3D Generation
  const handleGenerateVideo = async (
    videoPayload: { video?: string; frames: string[]; bestFrame?: string; duration: number; prompt: string },
    settings: GenerationSettings
  ) => {
    try {
      const res = await fetch('/api/generate/video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          video: videoPayload.video,
          frames: videoPayload.frames,
          bestFrame: videoPayload.bestFrame,
          duration: videoPayload.duration,
          prompt: videoPayload.prompt,
          settings,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `HTTP ${res.status}`);
      }

      const taskData = await res.json();
      const newTask: TaskItem = {
        id: taskData.taskId,
        type: 'video-to-3d',
        imageThumbnail: videoPayload.bestFrame || videoPayload.frames[0],
        videoDuration: videoPayload.duration,
        prompt: videoPayload.prompt || '360° Video 3D Reconstruction from Best Frame',
        engine: 'gemini',
        status: taskData.status || 'QUEUED',
        stage: taskData.stage || 'Processing Video',
        progress: taskData.progress || 10,
        createdAt: taskData.createdAt || new Date().toISOString(),
        settings,
      };

      setActiveTask(newTask);
      setTaskHistory((prev) => [newTask, ...prev]);
      startPollingTask(newTask.id);
    } catch (err: any) {
      alert(`Video-to-3D reconstruction failed: ${err.message}`);
    }
  };

  // Handle Model Download
  const handleDownloadModel = () => {
    if (!currentModelUrl) return;
    const link = document.createElement('a');
    link.href = currentModelUrl;
    link.download = `psm-model-${currentTaskId?.slice(0, 8) || 'asset'}.glb`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Handle Loading Known Test Fixture (Requirement 9.3)
  const handleLoadTestFixture = () => {
    setCurrentModelUrl('/api/test-fixture');
    setCurrentTaskId('fixture-valid-test-cube');
    setModelFileSize(14200);
  };

  // Delete Task from History
  const handleDeleteTask = async (taskId: string) => {
    try {
      await fetch(`/api/history/${taskId}`, { method: 'DELETE' });
      setTaskHistory((prev) => prev.filter((t) => t.id !== taskId));
      if (currentTaskId === taskId) {
        setCurrentModelUrl(null);
        setCurrentTaskId(null);
      }
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  // Select Task from History
  const handleSelectTask = (task: TaskItem) => {
    if (task.status === 'SUCCEEDED' && task.modelUrl) {
      setCurrentModelUrl(task.modelUrl);
      setCurrentTaskId(task.id);
      setModelFileSize(task.fileSize);
      setIsHistoryOpen(false);
    } else if (task.status === 'PROCESSING' || task.status === 'QUEUED') {
      setActiveTask(task);
      startPollingTask(task.id);
      setIsHistoryOpen(false);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row w-screen h-screen bg-[#0c0d12] text-white overflow-hidden select-none">
      {/* Left Generation Sidebar Panel */}
      <GenerationSidebar
        onGenerateText={handleGenerateText}
        onGenerateImage={handleGenerateImage}
        onGenerateVideo={handleGenerateVideo}
        activeTask={activeTask}
        onCancelTask={() => {
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
          setActiveTask(null);
        }}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      {/* Main 3D Viewport Area */}
      <main className="flex-1 relative flex flex-col h-full overflow-hidden">
        {/* Viewport Top Header Navigation Bar */}
        <header className="absolute top-4 left-4 right-4 z-30 flex items-center justify-between pointer-events-none">
          {/* Top Left Title and Status Badge */}
          <div className="flex items-center gap-3 bg-[#131620]/90 border border-white/10 px-3.5 py-2 rounded-xl backdrop-blur-md shadow-xl pointer-events-auto">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
            <div className="text-xs">
              <span className="font-bold text-white tracking-wide">Viewport 3D</span>
              <span className="text-gray-400 mx-2">•</span>
              <span className="text-gray-300 font-mono text-[11px]">
                {currentTaskId === 'fixture-valid-test-cube'
                  ? 'Calibration Fixture'
                  : currentTaskId
                  ? `Task #${currentTaskId.slice(0, 8)}`
                  : 'Empty Canvas'}
              </span>
            </div>
          </div>

          {/* Top Right Quick Actions */}
          <div className="flex items-center gap-2 pointer-events-auto">
            <button
              onClick={() => setIsHistoryOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-[#131620]/90 hover:bg-[#1c2130] border border-white/10 rounded-xl text-xs font-semibold text-gray-200 transition-colors shadow-xl backdrop-blur-md cursor-pointer"
              title="Open Generation History"
            >
              <History className="w-4 h-4 text-blue-400" />
              <span className="hidden sm:inline">History</span>
              {taskHistory.length > 0 && (
                <span className="bg-blue-500/20 text-blue-400 border border-blue-500/30 px-1.5 py-0.2 rounded-full text-[10px] font-mono">
                  {taskHistory.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setIsSettingsOpen(true)}
              className="p-2 bg-[#131620]/90 hover:bg-[#1c2130] border border-white/10 rounded-xl text-gray-300 hover:text-white transition-colors shadow-xl backdrop-blur-md cursor-pointer"
              title="Engine Settings & Status"
            >
              <Settings2 className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Real Three.js 3D Canvas */}
        <div className="w-full h-full relative">
          <Viewer3D
            modelUrl={currentModelUrl}
            onModelLoaded={(stats) => setModelStats(stats)}
            shadingMode={shadingMode}
            autoRotate={autoRotate}
            showGrid={showGrid}
            onResetCamera={(fn) => {
              resetCameraFnRef.current = fn;
            }}
            onSetCameraView={(fn) => {
              setCameraViewFnRef.current = fn;
            }}
          />
        </div>

        {/* Collapsible Viewport Bottom Dock (Camera views, PBR/Wire/Clay, Grid, Download) */}
        <ViewerDock
          shadingMode={shadingMode}
          onShadingModeChange={setShadingMode}
          autoRotate={autoRotate}
          onAutoRotateToggle={() => setAutoRotate(!autoRotate)}
          showGrid={showGrid}
          onShowGridToggle={() => setShowGrid(!showGrid)}
          onResetCamera={() => resetCameraFnRef.current?.()}
          onSetCameraView={(view) => setCameraViewFnRef.current?.(view)}
          onDownload={handleDownloadModel}
          hasModel={Boolean(currentModelUrl)}
          modelStats={modelStats}
          fileSize={modelFileSize}
        />
      </main>

      {/* Task History Drawer */}
      <TaskHistoryDrawer
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        tasks={taskHistory}
        selectedTaskId={currentTaskId}
        onSelectTask={handleSelectTask}
        onDeleteTask={handleDeleteTask}
        onLoadTestFixture={handleLoadTestFixture}
      />

      {/* Engine Settings Modal */}
      <EngineSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  );
}
