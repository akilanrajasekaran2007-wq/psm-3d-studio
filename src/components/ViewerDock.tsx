/**
 * ViewerDock.tsx
 * Sleek, collapsible bottom control dock for the 3D viewport.
 * Consolidates camera presets, shading modes, auto-spin, grid toggle, and GLB download.
 */

import React, { useState } from 'react';
import {
  RotateCw,
  Eye,
  Grid,
  Download,
  ChevronDown,
  ChevronUp,
  Camera,
  Layers,
  Sparkles,
} from 'lucide-react';
import { ShadingMode } from './Viewer3D.tsx';

interface ViewerDockProps {
  shadingMode: ShadingMode;
  onShadingModeChange: (mode: ShadingMode) => void;
  autoRotate: boolean;
  onAutoRotateToggle: () => void;
  showGrid: boolean;
  onShowGridToggle: () => void;
  onResetCamera: () => void;
  onSetCameraView: (view: 'front' | 'top' | 'isometric' | 'side') => void;
  onDownload: () => void;
  hasModel: boolean;
  modelStats?: { polycount: number; vertexCount: number; meshCount: number } | null;
  fileSize?: number;
}

export const ViewerDock: React.FC<ViewerDockProps> = ({
  shadingMode,
  onShadingModeChange,
  autoRotate,
  onAutoRotateToggle,
  showGrid,
  onShowGridToggle,
  onResetCamera,
  onSetCameraView,
  onDownload,
  hasModel,
  modelStats,
  fileSize,
}) => {
  const [collapsed, setCollapsed] = useState(false);

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center pointer-events-auto max-w-[min(940px,94vw)] transition-transform duration-300">
      {/* Collapse / Expand Toggle Tab */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-1.5 px-3 py-1 bg-[#131620]/90 border border-white/10 border-b-0 rounded-t-lg text-xs font-medium text-gray-300 hover:text-white hover:bg-[#1a1f2e] transition-colors shadow-lg cursor-pointer"
        title="Toggle HUD (Zen Mode)"
      >
        {collapsed ? (
          <>
            <ChevronUp className="w-3.5 h-3.5 text-blue-400" />
            <span>Show Viewport Controls</span>
          </>
        ) : (
          <>
            <ChevronDown className="w-3.5 h-3.5 text-blue-400" />
            <span>Hide Controls</span>
          </>
        )}
      </button>

      {/* Main Unified Dock Panel */}
      {!collapsed && (
        <div className="bg-[#131620]/95 border border-white/10 rounded-2xl rounded-t-none p-3 shadow-2xl backdrop-blur-md flex flex-wrap items-center justify-between gap-3 text-sm text-gray-300">
          {/* Shading Mode Swatches */}
          <div className="flex items-center gap-1 bg-[#0a0c12]/80 p-1 rounded-xl border border-white/5">
            <button
              onClick={() => onShadingModeChange('pbr')}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
                shadingMode === 'pbr'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-400 hover:text-white'
              }`}
              title="Full PBR Shading & Material Textures"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>PBR</span>
            </button>
            <button
              onClick={() => onShadingModeChange('wireframe')}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
                shadingMode === 'wireframe'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-400 hover:text-white'
              }`}
              title="Inspect Polygon Topology & Wireframe"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Wire</span>
            </button>
            <button
              onClick={() => onShadingModeChange('clay')}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
                shadingMode === 'clay'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-400 hover:text-white'
              }`}
              title="Matte Clay Shader"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Clay</span>
            </button>
          </div>

          <div className="h-5 w-[1px] bg-white/10 hidden sm:block" />

          {/* Camera Angles */}
          <div className="flex items-center gap-1 bg-[#0a0c12]/80 p-1 rounded-xl border border-white/5">
            <span className="text-[11px] font-semibold text-gray-500 uppercase px-1.5">View:</span>
            <button
              onClick={() => onSetCameraView('isometric')}
              className="px-2 py-1 rounded-md text-xs font-medium text-gray-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
              title="Isometric 3/4 View"
            >
              Iso
            </button>
            <button
              onClick={() => onSetCameraView('front')}
              className="px-2 py-1 rounded-md text-xs font-medium text-gray-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
              title="Front Ortho-Style View"
            >
              Front
            </button>
            <button
              onClick={() => onSetCameraView('side')}
              className="px-2 py-1 rounded-md text-xs font-medium text-gray-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
              title="Side Profile View"
            >
              Side
            </button>
            <button
              onClick={() => onSetCameraView('top')}
              className="px-2 py-1 rounded-md text-xs font-medium text-gray-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
              title="Top View"
            >
              Top
            </button>
            <button
              onClick={onResetCamera}
              className="px-2 py-1 rounded-md text-xs font-medium text-blue-400 hover:text-blue-300 hover:bg-white/5 transition-colors cursor-pointer flex items-center gap-1"
              title="Reset Camera Position"
            >
              <Camera className="w-3 h-3" />
              Reset
            </button>
          </div>

          <div className="h-5 w-[1px] bg-white/10 hidden sm:block" />

          {/* Viewport Toggles (Auto Rotate & Grid) */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={onAutoRotateToggle}
              className={`p-2 rounded-xl text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 border ${
                autoRotate
                  ? 'bg-blue-600/20 border-blue-500/50 text-blue-400'
                  : 'bg-[#0a0c12]/80 border-white/5 text-gray-400 hover:text-white'
              }`}
              title="Toggle Auto-Turntable Rotation"
            >
              <RotateCw className={`w-3.5 h-3.5 ${autoRotate ? 'animate-spin' : ''}`} />
              <span className="hidden md:inline">Turntable</span>
            </button>

            <button
              onClick={onShowGridToggle}
              className={`p-2 rounded-xl text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 border ${
                showGrid
                  ? 'bg-blue-600/20 border-blue-500/50 text-blue-400'
                  : 'bg-[#0a0c12]/80 border-white/5 text-gray-400 hover:text-white'
              }`}
              title="Toggle Ground Grid"
            >
              <Grid className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Grid</span>
            </button>
          </div>

          {/* Model Statistics & Download Action */}
          {hasModel && (
            <div className="flex items-center gap-2 ml-auto">
              {modelStats && (
                <div className="hidden lg:flex items-center gap-2 text-[11px] font-mono text-gray-400 bg-[#0a0c12]/80 px-2.5 py-1.5 rounded-lg border border-white/5">
                  <span>{(modelStats.polycount / 1000).toFixed(1)}k tris</span>
                  <span>•</span>
                  <span>{modelStats.meshCount} meshes</span>
                  {fileSize && (
                    <>
                      <span>•</span>
                      <span className="text-emerald-400">{formatFileSize(fileSize)}</span>
                    </>
                  )}
                </div>
              )}

              <button
                onClick={onDownload}
                className="flex items-center gap-2 px-3.5 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-semibold rounded-xl shadow-lg shadow-blue-500/20 active:scale-95 transition-all cursor-pointer"
                title="Download genuine GLB binary asset"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download GLB</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
