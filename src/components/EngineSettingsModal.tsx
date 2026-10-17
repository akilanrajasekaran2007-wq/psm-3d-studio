/**
 * EngineSettingsModal.tsx
 * Studio Preferences & System Status modal.
 * Displays neural engine status, viewport rendering specifications, and GLB export standards.
 */

import React from 'react';
import {
  X,
  Cpu,
  CheckCircle2,
  Layers,
  Sparkles,
  ShieldCheck,
  Box,
} from 'lucide-react';

interface EngineSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRefreshEngines?: () => void;
}

export const EngineSettingsModal: React.FC<EngineSettingsModalProps> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
      <div className="w-full max-w-lg bg-[#10121a] border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Cpu className="w-5 h-5 text-blue-400" />
            <h2 className="text-base font-bold text-white">Studio Settings & Engine Status</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-4 text-sm text-gray-300">
          {/* Engine Status Card */}
          <div className="p-4 rounded-xl bg-[#0a0c12] border border-white/5 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-blue-400" />
                <span className="font-bold text-white text-sm">Neural 3D Synthesis Engine</span>
              </div>
              <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-semibold flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                Operational
              </span>
            </div>
            <p className="text-xs text-gray-400 leading-relaxed">
              Real-time multi-primitive parametric assembly, PBR material synthesis, and binary GLB compilation.
            </p>
          </div>

          {/* Specifications */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-blue-400" />
              Rendering & Export Specifications
            </h3>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded-xl bg-[#0a0c12] border border-white/5">
                <span className="text-gray-400 block text-[11px]">Export Format</span>
                <span className="font-semibold text-white">Khronos glTF 2.0 (.glb)</span>
              </div>
              <div className="p-2.5 rounded-xl bg-[#0a0c12] border border-white/5">
                <span className="text-gray-400 block text-[11px]">Material Shading</span>
                <span className="font-semibold text-white">PBR Metallic / Roughness</span>
              </div>
              <div className="p-2.5 rounded-xl bg-[#0a0c12] border border-white/5">
                <span className="text-gray-400 block text-[11px]">Color Space</span>
                <span className="font-semibold text-white">sRGB ACES Filmic</span>
              </div>
              <div className="p-2.5 rounded-xl bg-[#0a0c12] border border-white/5">
                <span className="text-gray-400 block text-[11px]">Topology</span>
                <span className="font-semibold text-white">Manifold Triangles</span>
              </div>
            </div>
          </div>

          {/* Security & Offline note */}
          <div className="flex items-center gap-2 text-xs text-gray-400 p-3 rounded-xl bg-blue-950/20 border border-blue-500/20">
            <ShieldCheck className="w-4 h-4 text-blue-400 shrink-0" />
            <span>Generation is processed securely through backend endpoints without leaking client credentials.</span>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/10 bg-[#0a0c12] flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
