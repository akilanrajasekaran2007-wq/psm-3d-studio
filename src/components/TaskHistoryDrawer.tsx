/**
 * TaskHistoryDrawer.tsx
 * Slide-over drawer displaying generation history, metadata, GLB downloads,
 * and quick-test fixture loading.
 */

import React from 'react';
import {
  History,
  X,
  Download,
  Trash2,
  Box,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Sparkles,
  ExternalLink,
} from 'lucide-react';
import { TaskItem } from '../types.ts';

interface TaskHistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  tasks: TaskItem[];
  selectedTaskId: string | null;
  onSelectTask: (task: TaskItem) => void;
  onDeleteTask: (taskId: string) => void;
  onLoadTestFixture: () => void;
}

export const TaskHistoryDrawer: React.FC<TaskHistoryDrawerProps> = ({
  isOpen,
  onClose,
  tasks,
  selectedTaskId,
  onSelectTask,
  onDeleteTask,
  onLoadTestFixture,
}) => {
  if (!isOpen) return null;

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return '';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-xs">
      <div className="w-full max-w-md bg-[#10121a] border-l border-white/10 h-full flex flex-col shadow-2xl">
        {/* Drawer Header */}
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-blue-400" />
            <h2 className="text-base font-bold text-white">Generation History</h2>
            <span className="text-xs bg-white/10 text-gray-300 px-2 py-0.5 rounded-full font-mono">
              {tasks.length}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Quick Calibration Test Action */}
        <div className="p-3 bg-blue-950/30 border-b border-blue-500/20 flex items-center justify-between">
          <div className="text-xs text-blue-200">
            <p className="font-semibold">Viewer Calibration Fixture</p>
            <p className="text-[11px] text-blue-400">Load known valid GLB to verify WebGL renderer</p>
          </div>
          <button
            onClick={() => {
              onLoadTestFixture();
              onClose();
            }}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <Box className="w-3.5 h-3.5" />
            Load Test
          </button>
        </div>

        {/* Task Cards List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {tasks.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-gray-500">
              <Box className="w-12 h-12 mb-2 stroke-[1.5]" />
              <p className="text-sm font-medium text-gray-400">No generation history yet</p>
              <p className="text-xs max-w-xs mt-1">
                Your generated 3D models and tasks will appear here with instant preview and download options.
              </p>
            </div>
          ) : (
            tasks.map((task) => {
              const isSelected = selectedTaskId === task.id;
              return (
                <div
                  key={task.id}
                  onClick={() => onSelectTask(task)}
                  className={`p-3 rounded-xl border transition-all cursor-pointer relative group ${
                    isSelected
                      ? 'bg-blue-600/15 border-blue-500/60 shadow-lg shadow-blue-500/10'
                      : 'bg-[#0a0c12] border-white/5 hover:border-white/15'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <span className="text-[11px] font-mono text-gray-400 flex items-center gap-1">
                      <span className="capitalize">
                        {task.type === 'video-to-3d' && task.videoDuration
                          ? `Video to 3D (${task.videoDuration}s)`
                          : task.type.replace('-', ' ')}
                      </span>
                      <span>•</span>
                      <span>{formatDate(task.createdAt)}</span>
                    </span>

                    <span
                      className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full flex items-center gap-1 ${
                        task.status === 'SUCCEEDED'
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : task.status === 'FAILED'
                          ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                          : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                      }`}
                    >
                      {task.status === 'SUCCEEDED' ? (
                        <CheckCircle2 className="w-3 h-3" />
                      ) : task.status === 'FAILED' ? (
                        <AlertTriangle className="w-3 h-3" />
                      ) : (
                        <Clock className="w-3 h-3 animate-spin" />
                      )}
                      {task.status}
                    </span>
                  </div>

                  <p className="text-xs font-semibold text-white line-clamp-2 mb-2">
                    {task.prompt || 'Untitled 3D generation'}
                  </p>

                  <div className="flex items-center justify-between text-[11px] text-gray-400 pt-2 border-t border-white/5">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-300">
                        Neural 3D Engine
                      </span>
                      {task.fileSize && (
                        <>
                          <span>•</span>
                          <span className="font-mono text-emerald-400">
                            {formatFileSize(task.fileSize)}
                          </span>
                        </>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      {task.status === 'SUCCEEDED' && task.modelUrl && (
                        <a
                          href={task.modelUrl}
                          download={`model-${task.id.slice(0, 8)}.glb`}
                          onClick={(e) => e.stopPropagation()}
                          className="p-1 rounded text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                          title="Download GLB"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </a>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteTask(task.id);
                        }}
                        className="p-1 rounded text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                        title="Delete Task"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
