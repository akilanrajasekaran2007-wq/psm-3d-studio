/**
 * ImageSnapshotModal.tsx
 * Instant camera snapshot modal for Image-to-3D generation.
 * Allows users to snap a photo directly from their webcam to instantly generate a 3D model.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Camera, X, Check, RotateCcw, AlertTriangle, SwitchCamera } from 'lucide-react';
import { getCameraStream, FacingMode } from '../utils/camera.ts';

interface ImageSnapshotModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCaptureImage: (imageDataUrl: string) => void;
}

export const ImageSnapshotModal: React.FC<ImageSnapshotModalProps> = ({
  isOpen,
  onClose,
  onCaptureImage,
}) => {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('user');
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const videoPreviewRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const stopStream = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
  }, [stream]);

  const startCamera = useCallback(async (mode: FacingMode) => {
    setErrorMsg(null);
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setErrorMsg('Camera access is not supported by your browser.');
      return;
    }

    try {
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }

      const newStream = await getCameraStream(mode);

      setStream(newStream);
      if (videoPreviewRef.current) {
        videoPreviewRef.current.srcObject = newStream;
        videoPreviewRef.current.play().catch(() => {});
      }
    } catch (err: any) {
      console.error('Camera initialization error:', err.name, err.message);
      
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError' || err.message?.includes('Permission denied')) {
        setErrorMsg('Camera access was denied. Please check your browser address bar to ensure camera permission is granted for this specific website (not just AI Studio).');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setErrorMsg('No camera hardware was found on your device.');
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        setErrorMsg('Camera is in use by another application.');
      } else if (err.name === 'OverconstrainedError') {
        setErrorMsg('Camera does not support the requested resolution.');
      } else {
        setErrorMsg(`Camera error (${err.name}): ${err.message}`);
      }
    }
  }, [stream]);

  useEffect(() => {
    if (isOpen) {
      setCapturedImage(null);
      startCamera(facingMode);
    } else {
      stopStream();
    }
    return () => {
      stopStream();
    };
  }, [isOpen]);

  const handleToggleFacingMode = () => {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextMode);
    startCamera(nextMode);
  };

  const handleSnapPhoto = () => {
    if (!videoPreviewRef.current || !canvasRef.current) return;
    const video = videoPreviewRef.current;
    const canvas = canvasRef.current;

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    setCapturedImage(dataUrl);
  };

  const handleRetake = () => {
    setCapturedImage(null);
    startCamera(facingMode);
  };

  const handleConfirm = () => {
    if (!capturedImage) return;
    onCaptureImage(capturedImage);
    stopStream();
    onClose();
  };

  const handleClose = () => {
    stopStream();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-xs">
      <div className="w-full max-w-xl bg-[#10121a] border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-[92vh]">
        {/* Header */}
        <div className="p-3.5 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-600/20 text-blue-400 flex items-center justify-center border border-blue-500/30">
              <Camera className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Take Instant Photo Snapshot</h3>
              <p className="text-[11px] text-gray-400">Capture a live photo for Image-to-3D</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!capturedImage && (
              <button
                type="button"
                onClick={handleToggleFacingMode}
                className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer text-xs flex items-center gap-1 border border-white/5"
                title="Switch Camera"
              >
                <SwitchCamera className="w-4 h-4" />
                <span className="text-[10px] hidden sm:inline capitalize">{facingMode}</span>
              </button>
            )}

            <button
              onClick={handleClose}
              className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Viewport / Snapshot Box */}
        <div className="relative bg-black aspect-video w-full flex items-center justify-center overflow-hidden">
          {errorMsg ? (
            <div className="p-6 text-center max-w-sm space-y-4">
              <AlertTriangle className="w-10 h-10 text-amber-400 mx-auto mb-1" />
              <div>
                <p className="text-sm text-white font-bold mb-2">Camera Access Denied</p>
                <p className="text-xs text-gray-300 leading-relaxed mb-4">{errorMsg}</p>
              </div>

              <div className="bg-[#1e2230] p-4 rounded-xl text-left border border-white/10 space-y-2">
                <p className="text-[11px] font-bold text-white uppercase tracking-wider">How to Fix:</p>
                <ol className="list-decimal list-inside text-[10px] text-gray-400 space-y-1">
                  <li>Click the <span className="font-semibold text-white">Lock icon</span> in your address bar.</li>
                  <li>Find <span className="font-semibold text-white">Camera</span> in the settings list.</li>
                  <li>Toggle it to <span className="font-semibold text-white">On</span> (or select "Reset permission").</li>
                  <li>Refresh this page and try again.</li>
                </ol>
              </div>

              <div className="flex items-center justify-center gap-2 pt-2">
                <button
                  onClick={() => startCamera(facingMode)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-500 transition-colors cursor-pointer"
                >
                  Retry Camera
                </button>
                <button
                  onClick={handleClose}
                  className="px-4 py-2 bg-white/10 text-gray-200 rounded-lg text-xs font-semibold hover:bg-white/15 transition-colors cursor-pointer"
                >
                  Use Upload Instead
                </button>
              </div>
            </div>
          ) : capturedImage ? (
            <div className="w-full h-full relative">
              <img src={capturedImage} alt="Captured Snapshot" className="w-full h-full object-contain" />
              <div className="absolute top-2 left-2 px-2.5 py-1 rounded-md bg-black/70 border border-white/10 text-[11px] text-emerald-400 font-semibold">
                ✓ Snapshot Captured
              </div>
            </div>
          ) : (
            <div className="w-full h-full relative">
              <video
                ref={videoPreviewRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 border-2 border-dashed border-white/20 pointer-events-none flex items-center justify-center">
                <span className="text-[11px] text-white/70 bg-black/60 px-3 py-1 rounded-lg border border-white/10">
                  Align Object in Frame
                </span>
              </div>
            </div>
          )}
          <canvas ref={canvasRef} className="hidden" />
        </div>

        {/* Actions Bar */}
        <div className="p-3.5 bg-[#0a0c12] border-t border-white/10 flex items-center justify-between gap-2">
          {capturedImage ? (
            <>
              <button
                type="button"
                onClick={handleRetake}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-white/5 hover:bg-white/10 text-gray-300 transition-colors cursor-pointer border border-white/10"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Retake Photo
              </button>

              <button
                type="button"
                onClick={handleConfirm}
                className="flex items-center gap-1.5 px-6 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-lg shadow-blue-500/20 active:scale-95 transition-all cursor-pointer"
              >
                <Check className="w-4 h-4" />
                Use Photo for 3D
              </button>
            </>
          ) : (
            <>
              <div className="text-[11px] text-gray-400">Position subject clearly in view</div>
              <button
                type="button"
                onClick={handleSnapPhoto}
                disabled={!stream || Boolean(errorMsg)}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white shadow-lg shadow-blue-500/25 active:scale-95 transition-all cursor-pointer"
              >
                <Camera className="w-4 h-4" />
                Take Snapshot
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
