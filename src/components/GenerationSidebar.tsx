/**
 * GenerationSidebar.tsx
 * Comprehensive generation controls supporting:
 *   1. Text to 3D
 *   2. Image to 3D
 *   3. Video to 3D (Upload & Camera Recording with strict <=10s validation)
 */

import React, { useState, useRef } from 'react';
import {
  Wand2,
  Image as ImageIcon,
  Type,
  Video,
  Camera,
  Cpu,
  Sliders,
  Sparkles,
  Upload,
  X,
  AlertCircle,
  Settings2,
  RefreshCw,
  Clock,
  CheckCircle2,
  RotateCcw,
  Film,
  Layers,
} from 'lucide-react';
import { ArtStyle, EngineType, GenerationSettings, TaskItem } from '../types.ts';
import { VideoRecorderModal } from './VideoRecorderModal.tsx';
import { ImageSnapshotModal } from './ImageSnapshotModal.tsx';
import { processAndExtractVideoFrames } from '../utils/videoExtractor.ts';

interface GenerationSidebarProps {
  onGenerateText: (prompt: string, settings: GenerationSettings) => Promise<void>;
  onGenerateImage: (imageDataUrl: string, settings: GenerationSettings) => Promise<void>;
  onGenerateVideo: (
    videoPayload: { video?: string; frames: string[]; bestFrame?: string; duration: number; prompt: string },
    settings: GenerationSettings
  ) => Promise<void>;
  activeTask: TaskItem | null;
  onCancelTask?: () => void;
  onOpenSettings: () => void;
}

const PROMPT_SUGGESTIONS = [
  'Cyberpunk combat mech with twin plasma cannons',
  'Low-poly stylized Japanese shrine pagoda',
  'Futuristic antigravity hoverbike with glowing engine',
  'Medieval fantasy broadsword with gilded crossguard',
  'Vintage retro radio with vacuum tubes and brass knobs',
  'Cute low-poly crystalline dragon hatchling',
];

export const GenerationSidebar: React.FC<GenerationSidebarProps> = ({
  onGenerateText,
  onGenerateImage,
  onGenerateVideo,
  activeTask,
  onCancelTask,
  onOpenSettings,
}) => {
  const [mode, setMode] = useState<'text' | 'image' | 'video'>('text');

  // Text Mode state
  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('blurry, deformed, broken geometry');
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Image Mode state
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isSnapshotModalOpen, setIsSnapshotModalOpen] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Video Mode state
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoDataUrl, setVideoDataUrl] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState<number | null>(null);
  const [videoSize, setVideoSize] = useState<number | null>(null);
  const [videoFrames, setVideoFrames] = useState<string[]>([]);
  const [selectedFrameIndex, setSelectedFrameIndex] = useState<number>(0);
  const [isExtractingFrames, setIsExtractingFrames] = useState(false);
  const [videoValidationError, setVideoValidationError] = useState<string | null>(null);
  const [isRecorderOpen, setIsRecorderOpen] = useState(false);
  const videoInputRef = useRef<HTMLInputElement>(null);

  // Shared Settings
  const [artStyle, setArtStyle] = useState<ArtStyle>('realistic');
  const [symmetryMode, setSymmetryMode] = useState<'off' | 'auto' | 'on'>('auto');
  const [targetPolycount, setTargetPolycount] = useState<number>(30000);

  const isGenerating = activeTask?.status === 'QUEUED' || activeTask?.status === 'PROCESSING';

  // Handle Image Upload
  const handleImageUpload = (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('Please upload a valid image file (PNG, JPG, WEBP).');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      setSelectedImage(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  // Process Video (File or Camera Recording)
  const handleProcessVideoSource = async (fileOrBlob: File | Blob) => {
    setVideoValidationError(null);
    setIsExtractingFrames(true);

    try {
      // Decode, validate duration strictly <= 10.0s, and extract 6 multi-view viewpoints with sharpness evaluation
      const result = await processAndExtractVideoFrames(fileOrBlob, 10.05, 6);

      const blobUrl = URL.createObjectURL(fileOrBlob);
      setVideoUrl(blobUrl);
      setVideoDuration(result.duration);
      setVideoSize(result.fileSize);
      setVideoFrames(result.frames);
      setSelectedFrameIndex(result.bestFrameIndex ?? 0);

      // Read Data URL for backend payload
      const reader = new FileReader();
      reader.onloadend = () => {
        setVideoDataUrl(reader.result as string);
      };
      reader.readAsDataURL(fileOrBlob);
    } catch (err: any) {
      console.error('Video validation error:', err);
      // Clean up previous video
      if (videoUrl) URL.revokeObjectURL(videoUrl);
      setVideoUrl(null);
      setVideoDataUrl(null);
      setVideoDuration(null);
      setVideoSize(null);
      setVideoFrames([]);
      setSelectedFrameIndex(0);
      setVideoValidationError(err.message || 'Video processing failed.');
    } finally {
      setIsExtractingFrames(false);
    }
  };

  // Remove current video
  const handleRemoveVideo = () => {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl(null);
    setVideoDataUrl(null);
    setVideoDuration(null);
    setVideoSize(null);
    setVideoFrames([]);
    setSelectedFrameIndex(0);
    setVideoValidationError(null);
    if (videoInputRef.current) videoInputRef.current.value = '';
  };

  // Form Submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isGenerating || isExtractingFrames) return;

    const settings: GenerationSettings = {
      engine: 'gemini',
      artStyle,
      negativePrompt,
      symmetryMode,
      topology: 'triangle',
      targetPolycount,
      enablePbr: true,
      surfaceMode: 'hard',
    };

    if (mode === 'text') {
      if (!prompt.trim()) return;
      await onGenerateText(prompt, settings);
    } else if (mode === 'image') {
      if (!selectedImage) return;
      await onGenerateImage(selectedImage, settings);
    } else if (mode === 'video') {
      if (!videoFrames || videoFrames.length === 0 || videoValidationError) return;
      const targetBestFrame = videoFrames[selectedFrameIndex] || videoFrames[0];
      await onGenerateVideo(
        {
          video: videoDataUrl || undefined,
          frames: videoFrames,
          bestFrame: targetBestFrame,
          duration: videoDuration || 0,
          prompt: prompt.trim() || '360° Video 3D Reconstruction from Best Frame',
        },
        settings
      );
    }
  };

  const formatFileSize = (bytes?: number | null) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <aside className="w-full lg:w-[440px] bg-[#10121a] border-r border-white/10 flex flex-col h-full overflow-y-auto">
      {/* Top Header */}
      <div className="p-4 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Wand2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white tracking-tight flex items-center gap-1.5">
              PSM 3D Studio
              <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">
                AI Engine
              </span>
            </h1>
            <p className="text-xs text-gray-400">Generative 3D Asset Synthesis</p>
          </div>
        </div>

        <button
          onClick={onOpenSettings}
          className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
          title="Studio Preferences"
        >
          <Settings2 className="w-5 h-5" />
        </button>
      </div>

      {/* 3 Generation Modes Switcher Tabs */}
      <div className="p-4 pb-0">
        <div className="grid grid-cols-3 p-1 bg-[#0a0c12]/90 backdrop-blur-md rounded-2xl border border-white/10 text-xs font-semibold shadow-inner">
          <button
            type="button"
            onClick={() => setMode('text')}
            className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl transition-all cursor-pointer ${
              mode === 'text'
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/25 font-bold border border-blue-400/30'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Type className="w-3.5 h-3.5" />
            <span>Text to 3D</span>
          </button>

          <button
            type="button"
            onClick={() => setMode('image')}
            className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl transition-all cursor-pointer ${
              mode === 'image'
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/25 font-bold border border-blue-400/30'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <ImageIcon className="w-3.5 h-3.5" />
            <span>Image to 3D</span>
          </button>

          <button
            type="button"
            onClick={() => setMode('video')}
            className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl transition-all cursor-pointer relative ${
              mode === 'video'
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/25 font-bold border border-blue-400/30'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Video className="w-3.5 h-3.5" />
            <span>Video to 3D</span>
            <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/50 absolute top-2 right-2 animate-pulse" />
          </button>
        </div>
      </div>

      {/* Generation Form */}
      <form onSubmit={handleSubmit} className="p-4 flex-1 flex flex-col gap-4">
        {/* Active Engine Badge */}
        <div className="flex items-center justify-between px-3.5 py-2.5 bg-[#0a0c12] rounded-xl border border-white/5 text-xs">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-blue-400" />
            <span className="font-semibold text-gray-200">Neural 3D Engine</span>
          </div>
          <span className="text-[11px] text-emerald-400 font-semibold px-2 py-0.5 rounded-md bg-emerald-400/10 border border-emerald-400/20">
            Active
          </span>
        </div>

        {/* MODE 1: TEXT TO 3D */}
        {mode === 'text' && (
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-200 flex items-center justify-between">
              <span>Text to 3D Prompt</span>
              <span className="text-[11px] font-normal text-gray-400">{prompt.length}/500</span>
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Type your 3D model prompt here (e.g., Futuristic hoverbike, Medieval shield)..."
              rows={4}
              maxLength={500}
              required
              className="w-full bg-[#0a0c12] border border-white/20 rounded-xl p-3 text-sm text-gray-100 placeholder-gray-400 focus:outline-none focus:border-blue-500 transition-colors resize-none shadow-inner"
            />

            {/* Prompt Inspiration Badges */}
            <div className="space-y-1">
              <span className="text-[11px] font-medium text-gray-500 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-indigo-400" />
                Prompt Ideas:
              </span>
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1">
                {PROMPT_SUGGESTIONS.map((item, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setPrompt(item)}
                    className="text-[11px] bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white px-2 py-1 rounded-md transition-colors text-left cursor-pointer border border-white/5"
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* MODE 2: IMAGE TO 3D */}
        {mode === 'image' && (
          <div className="space-y-3">
            <label className="text-xs font-bold text-gray-200">
              Reference Image for 3D Reconstruction
            </label>

            <input
              type="file"
              ref={imageInputRef}
              onChange={(e) => e.target.files?.[0] && handleImageUpload(e.target.files[0])}
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
            />

            {!selectedImage ? (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => imageInputRef.current?.click()}
                  className="p-4 rounded-xl border border-white/10 bg-[#0a0c12] hover:bg-white/5 hover:border-blue-500/40 text-left transition-all cursor-pointer flex flex-col items-center justify-center text-center gap-1.5 group"
                >
                  <div className="w-10 h-10 rounded-full bg-blue-600/15 group-hover:bg-blue-600/25 text-blue-400 flex items-center justify-center transition-colors">
                    <Upload className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-bold text-white">Upload Image</span>
                  <span className="text-[10px] text-gray-500">PNG, JPG, WEBP</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsSnapshotModalOpen(true)}
                  className="p-4 rounded-xl border border-white/10 bg-[#0a0c12] hover:bg-white/5 hover:border-purple-500/40 text-left transition-all cursor-pointer flex flex-col items-center justify-center text-center gap-1.5 group"
                >
                  <div className="w-10 h-10 rounded-full bg-purple-600/15 group-hover:bg-purple-600/25 text-purple-400 flex items-center justify-center transition-colors">
                    <Camera className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-bold text-white">Take Snapshot</span>
                  <span className="text-[10px] text-gray-500">Instant Webcam Photo</span>
                </button>
              </div>
            ) : (
              <div className="relative rounded-xl overflow-hidden border border-white/10 bg-[#0a0c12] p-3 space-y-2">
                <div className="flex items-center gap-3">
                  <img
                    src={selectedImage}
                    alt="Upload preview"
                    className="w-16 h-16 object-cover rounded-lg border border-white/10"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-white truncate">Image ready for 3D generation</p>
                    <p className="text-[11px] text-emerald-400">AI spatial analysis enabled</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedImage(null)}
                    className="p-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors cursor-pointer"
                    title="Remove Image"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-center justify-between pt-1 border-t border-white/5">
                  <button
                    type="button"
                    onClick={() => imageInputRef.current?.click()}
                    className="text-[11px] font-semibold text-blue-400 hover:text-blue-300 cursor-pointer flex items-center gap-1"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Upload Different Image
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsSnapshotModalOpen(true)}
                    className="text-[11px] font-semibold text-purple-400 hover:text-purple-300 cursor-pointer flex items-center gap-1"
                  >
                    <Camera className="w-3 h-3" />
                    Take New Snapshot
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* MODE 3: VIDEO TO 3D */}
        {mode === 'video' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs">
              <label className="font-semibold text-gray-300 flex items-center gap-1.5">
                <Film className="w-3.5 h-3.5 text-blue-400" />
                Orbital Video Input
              </label>
              <span className="text-[11px] text-amber-400 font-mono">Max 10 seconds</span>
            </div>

            {/* Hidden file input */}
            <input
              type="file"
              ref={videoInputRef}
              onChange={(e) => {
                if (e.target.files?.[0]) handleProcessVideoSource(e.target.files[0]);
              }}
              accept="video/mp4,video/webm,video/quicktime,video/mov"
              className="hidden"
            />

            {/* Upload & Record Action Buttons */}
            {!videoUrl && (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => videoInputRef.current?.click()}
                  className="p-4 rounded-xl border border-white/10 bg-[#0a0c12] hover:bg-white/5 hover:border-blue-500/40 text-left transition-all cursor-pointer flex flex-col items-center justify-center text-center gap-1.5 group"
                >
                  <div className="w-10 h-10 rounded-full bg-blue-600/15 group-hover:bg-blue-600/25 text-blue-400 flex items-center justify-center transition-colors">
                    <Upload className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-bold text-white">Upload Video</span>
                  <span className="text-[10px] text-gray-500">MP4, WebM, MOV</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsRecorderOpen(true)}
                  className="p-4 rounded-xl border border-white/10 bg-[#0a0c12] hover:bg-white/5 hover:border-red-500/40 text-left transition-all cursor-pointer flex flex-col items-center justify-center text-center gap-1.5 group"
                >
                  <div className="w-10 h-10 rounded-full bg-red-600/15 group-hover:bg-red-600/25 text-red-400 flex items-center justify-center transition-colors">
                    <Camera className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-bold text-white">Record Video</span>
                  <span className="text-[10px] text-gray-500">10s Camera Scan</span>
                </button>
              </div>
            )}

            {/* Validation Error Alert Box */}
            {videoValidationError && (
              <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-500/30 flex items-start gap-2.5 text-xs text-amber-200">
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-semibold text-amber-300">Validation Notice</p>
                  <p className="text-[11px] mt-0.5">{videoValidationError}</p>
                </div>
              </div>
            )}

            {/* Frame Extraction Spinner */}
            {isExtractingFrames && (
              <div className="p-4 rounded-xl bg-[#0a0c12] border border-blue-500/30 flex items-center gap-3">
                <RefreshCw className="w-5 h-5 text-blue-400 animate-spin" />
                <div className="text-xs">
                  <p className="font-semibold text-white">Extracting Multi-View Keyframes...</p>
                  <p className="text-[11px] text-gray-400">Validating 10-second duration & visual viewpoints</p>
                </div>
              </div>
            )}

            {/* Video Preview Card */}
            {videoUrl && !isExtractingFrames && (
              <div className="rounded-xl overflow-hidden border border-white/10 bg-[#0a0c12] p-3 space-y-2.5">
                <div className="relative rounded-lg overflow-hidden bg-black aspect-video">
                  <video
                    src={videoUrl}
                    controls
                    loop
                    playsInline
                    className="w-full h-full object-contain"
                  />
                  <div className="absolute top-2 left-2 flex items-center gap-1.5">
                    <span className="px-2 py-0.5 rounded-md bg-black/70 text-emerald-400 font-mono text-[10px] border border-white/10">
                      {videoDuration ? `${videoDuration}s` : '10s'} duration
                    </span>
                    {videoSize && (
                      <span className="px-2 py-0.5 rounded-md bg-black/70 text-gray-300 font-mono text-[10px] border border-white/10">
                        {formatFileSize(videoSize)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Replace & Remove Actions */}
                <div className="flex items-center justify-between gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => videoInputRef.current?.click()}
                    className="flex items-center gap-1 text-[11px] font-semibold text-blue-400 hover:text-blue-300 cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Replace Video
                  </button>

                  <button
                    type="button"
                    onClick={handleRemoveVideo}
                    className="flex items-center gap-1 text-[11px] font-semibold text-red-400 hover:text-red-300 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                    Remove Video
                  </button>
                </div>

                {/* Extracted Multi-View Angles Strip & Best Frame Selector */}
                {videoFrames.length > 0 && (
                  <div className="pt-2 border-t border-white/5 space-y-2">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="flex items-center gap-1.5 font-bold text-amber-300">
                        <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                        Target 3D Reference Frame
                      </span>
                      <span className="text-[10px] text-gray-400 font-mono">
                        Frame #{selectedFrameIndex + 1} of {videoFrames.length}
                      </span>
                    </div>

                    {/* Selected Best Frame Card */}
                    <div className="p-2.5 rounded-xl bg-amber-950/25 border border-amber-500/40 flex items-center gap-3 shadow-md">
                      <div className="relative w-14 h-14 rounded-lg overflow-hidden border-2 border-amber-400 shrink-0 shadow-sm">
                        <img
                          src={videoFrames[selectedFrameIndex]}
                          alt={`Selected Best Frame #${selectedFrameIndex + 1}`}
                          className="w-full h-full object-cover"
                        />
                        <span className="absolute bottom-0 inset-x-0 bg-amber-500 text-black text-[8px] font-black text-center uppercase tracking-tighter">
                          Best Frame
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-white flex items-center gap-1">
                          Reconstructing 3D Model from this Frame
                        </p>
                        <p className="text-[10px] text-gray-400 mt-0.5 leading-snug">
                          Chosen as the primary view for 3D geometry and textures. Click any viewpoint below to change.
                        </p>
                      </div>
                    </div>

                    {/* Clickable Viewpoints Strip */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[10px] text-gray-400">
                        <span>Click any frame to select as best frame:</span>
                        <span className="text-amber-400 font-mono">Click to choose</span>
                      </div>

                      <div className="grid grid-cols-6 gap-1.5">
                        {videoFrames.map((frame, i) => {
                          const isSelected = selectedFrameIndex === i;
                          return (
                            <button
                              key={i}
                              type="button"
                              onClick={() => setSelectedFrameIndex(i)}
                              className={`relative aspect-square rounded-md overflow-hidden border transition-all cursor-pointer group ${
                                isSelected
                                  ? 'border-amber-400 ring-2 ring-amber-400/50 scale-[1.04] shadow-md z-10'
                                  : 'border-white/10 bg-black/50 hover:border-white/30 opacity-70 hover:opacity-100'
                              }`}
                              title={isSelected ? 'Active Best Frame' : `Click to choose Frame #${i + 1} as 3D Model Target`}
                            >
                              <img
                                src={frame}
                                alt={`Viewpoint ${i + 1}`}
                                className="w-full h-full object-cover"
                              />
                              <span
                                className={`absolute bottom-0 inset-x-0 text-[8px] font-mono text-center ${
                                  isSelected
                                    ? 'bg-amber-500 text-black font-bold'
                                    : 'bg-black/80 text-gray-300'
                                }`}
                              >
                                {isSelected ? '★ Best' : `#${i + 1}`}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Art Style Selection */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-gray-200">Art & Texture Style</label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: 'realistic', label: 'Realistic' },
              { id: 'cartoon', label: 'Cartoon / Toon' },
              { id: 'low-poly', label: 'Low Poly' },
              { id: 'pbr', label: 'PBR Metallic' },
              { id: 'sculpture', label: 'Sculpture' },
            ].map((style) => (
              <button
                key={style.id}
                type="button"
                onClick={() => setArtStyle(style.id as ArtStyle)}
                className={`py-2 px-2.5 rounded-xl text-xs font-semibold border text-center transition-all cursor-pointer ${
                  artStyle === style.id
                    ? 'border-blue-500 bg-blue-600/25 text-blue-300 shadow-md shadow-blue-500/20 ring-1 ring-blue-500/40 font-bold'
                    : 'border-white/10 bg-[#0a0c12]/80 text-gray-400 hover:text-white hover:bg-white/5 hover:border-white/20'
                }`}
              >
                {style.label}
              </button>
            ))}
          </div>
        </div>

        {/* Collapsible Advanced Settings */}
        <div className="border-t border-white/5 pt-2">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center justify-between w-full text-xs text-gray-400 hover:text-white py-1 cursor-pointer font-medium"
          >
            <span className="flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-blue-400" />
              Advanced Generation Parameters
            </span>
            <span>{showAdvanced ? '−' : '+'}</span>
          </button>

          {showAdvanced && (
            <div className="mt-3 space-y-3 bg-[#0a0c12]/60 p-3 rounded-xl border border-white/5">
              {/* Symmetry */}
              <div>
                <label className="text-xs text-gray-300 font-medium block mb-1">Symmetry Mode</label>
                <div className="grid grid-cols-3 gap-1">
                  {(['off', 'auto', 'on'] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSymmetryMode(s)}
                      className={`py-1 text-xs rounded-md border text-center uppercase font-semibold cursor-pointer ${
                        symmetryMode === s
                          ? 'border-blue-500 bg-blue-500/20 text-blue-400'
                          : 'border-white/5 bg-[#12141d] text-gray-400 hover:text-white'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* Target Polycount */}
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-gray-300 font-medium">Target Polycount</span>
                  <span className="text-blue-400 font-mono font-semibold">
                    {(targetPolycount / 1000).toFixed(0)}k tris
                  </span>
                </div>
                <input
                  type="range"
                  min="10000"
                  max="50000"
                  step="5000"
                  value={targetPolycount}
                  onChange={(e) => setTargetPolycount(Number(e.target.value))}
                  className="w-full accent-blue-500 cursor-pointer"
                />
              </div>

              {/* Negative Prompt */}
              <div>
                <label className="text-xs text-gray-300 font-medium block mb-1">
                  Negative Prompt
                </label>
                <input
                  type="text"
                  value={negativePrompt}
                  onChange={(e) => setNegativePrompt(e.target.value)}
                  placeholder="low quality, artifacts, floating geometry"
                  className="w-full bg-[#12141d] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          )}
        </div>

        {/* Active Task Status Tracker Card */}
        {activeTask && (
          <div className="mt-auto p-3 rounded-xl bg-blue-950/20 border border-blue-500/30 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-blue-300 flex items-center gap-1.5">
                {activeTask.status === 'SUCCEEDED' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : activeTask.status === 'FAILED' ? (
                  <AlertCircle className="w-4 h-4 text-red-400" />
                ) : (
                  <Clock className="w-4 h-4 text-blue-400 animate-spin" />
                )}
                {activeTask.status === 'SUCCEEDED'
                  ? '3D Model Ready'
                  : activeTask.status === 'FAILED'
                  ? 'Reconstruction Error'
                  : activeTask.stage || 'Synthesizing 3D Asset...'}
              </span>
              <span className="font-mono text-blue-400 font-bold">{activeTask.progress}%</span>
            </div>

            {/* Real Progress Bar */}
            <div className="w-full h-2 bg-black/40 rounded-full overflow-hidden border border-white/5">
              <div
                className={`h-full transition-all duration-300 rounded-full ${
                  activeTask.status === 'FAILED'
                    ? 'bg-red-500'
                    : activeTask.status === 'SUCCEEDED'
                    ? 'bg-emerald-500'
                    : 'bg-gradient-to-r from-blue-500 to-indigo-500'
                }`}
                style={{ width: `${Math.max(activeTask.progress, 5)}%` }}
              />
            </div>

            {activeTask.error && (
              <p className="text-[11px] text-red-400 font-medium bg-red-950/40 p-2 rounded-lg border border-red-500/20">
                {activeTask.error}
              </p>
            )}

            {isGenerating && onCancelTask && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={onCancelTask}
                  className="text-[11px] text-gray-400 hover:text-red-400 transition-colors cursor-pointer"
                >
                  Cancel Task
                </button>
              </div>
            )}
          </div>
        )}

        {/* Submit Generate Action Button */}
        <button
          type="submit"
          disabled={
            isGenerating ||
            isExtractingFrames ||
            Boolean(videoValidationError) ||
            (mode === 'text' && !prompt.trim()) ||
            (mode === 'image' && !selectedImage) ||
            (mode === 'video' && (!videoFrames || videoFrames.length === 0))
          }
          className="w-full py-3.5 px-4 rounded-xl font-bold text-sm bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-500 hover:via-indigo-500 hover:to-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white shadow-xl shadow-blue-500/25 active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer"
        >
          {isGenerating ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>
                {activeTask?.stage ? activeTask.stage : 'Generating 3D Asset...'}
              </span>
            </>
          ) : isExtractingFrames ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Extracting Keyframes...</span>
            </>
          ) : mode === 'video' ? (
            <>
              <Film className="w-4 h-4" />
              <span>Reconstruct 3D Model from Video</span>
            </>
          ) : (
            <>
              <Wand2 className="w-4 h-4" />
              <span>Generate 3D Model</span>
            </>
          )}
        </button>
      </form>

      {/* Camera Video Recorder Modal */}
      <VideoRecorderModal
        isOpen={isRecorderOpen}
        onClose={() => setIsRecorderOpen(false)}
        onConfirmVideo={(blob, dataUrl, duration) => {
          handleProcessVideoSource(blob);
        }}
      />

      {/* Image Snapshot Modal */}
      <ImageSnapshotModal
        isOpen={isSnapshotModalOpen}
        onClose={() => setIsSnapshotModalOpen(false)}
        onCaptureImage={(dataUrl) => {
          setSelectedImage(dataUrl);
        }}
      />
    </aside>
  );
};
