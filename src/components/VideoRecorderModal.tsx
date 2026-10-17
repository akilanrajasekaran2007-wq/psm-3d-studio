/**
 * VideoRecorderModal.tsx
 * Camera recording modal for Video-to-3D scanning.
 * Supports rear/front camera switching, 10-second auto-stop countdown,
 * recording guidance, and preview/retake workflow.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Video,
  X,
  Camera,
  RotateCcw,
  Check,
  AlertTriangle,
  Info,
  Clock,
  Sparkles,
  SwitchCamera,
} from 'lucide-react';
import { getCameraStream, FacingMode } from '../utils/camera.ts';

interface VideoRecorderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmVideo: (videoBlob: Blob, videoDataUrl: string, duration: number) => void;
}

export const VideoRecorderModal: React.FC<VideoRecorderModalProps> = ({
  isOpen,
  onClose,
  onConfirmVideo,
}) => {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [isRecording, setIsRecording] = useState(false);
  const [countdown, setCountdown] = useState(10);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [recordedDuration, setRecordedDuration] = useState<number>(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showTips, setShowTips] = useState(true);

  const videoPreviewRef = useRef<HTMLVideoElement>(null);
  const playbackRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);

  // Stop camera tracks cleanly
  const stopStream = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
  }, [stream]);

  // Request camera and start preview
  const startCamera = useCallback(async (mode: FacingMode) => {
    setErrorMsg(null);
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setErrorMsg('Camera access is not supported by your browser.');
      return;
    }

    try {
      // First stop any existing tracks
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

  // Start camera on modal open
  useEffect(() => {
    if (isOpen) {
      setRecordedBlob(null);
      setRecordedUrl(null);
      setIsRecording(false);
      setCountdown(10);
      startCamera(facingMode);
    } else {
      stopStream();
      if (timerRef.current) clearInterval(timerRef.current);
    }

    return () => {
      stopStream();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isOpen]);

  // Toggle front/rear camera
  const handleToggleFacingMode = () => {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextMode);
    startCamera(nextMode);
  };

  // Start Recording with 10-second countdown
  const startRecording = () => {
    if (!stream) return;
    recordedChunksRef.current = [];
    setErrorMsg(null);

    // Pick best supported MIME type
    const mimeTypes = [
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
      'video/mp4',
    ];
    let selectedMime = '';
    for (const mime of mimeTypes) {
      if (MediaRecorder.isTypeSupported(mime)) {
        selectedMime = mime;
        break;
      }
    }

    try {
      const recorder = new MediaRecorder(stream, selectedMime ? { mimeType: selectedMime } : undefined);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const durationSec = Math.min(10.0, (Date.now() - startTimeRef.current) / 1000);
        setRecordedDuration(Math.round(durationSec * 10) / 10);

        const mime = recorder.mimeType || 'video/webm';
        const blob = new Blob(recordedChunksRef.current, { type: mime });
        setRecordedBlob(blob);
        const url = URL.createObjectURL(blob);
        setRecordedUrl(url);
        setIsRecording(false);
      };

      recorder.start(250); // collect chunks every 250ms
      startTimeRef.current = Date.now();
      setIsRecording(true);
      setCountdown(10);

      // 10-second countdown ticker and auto-stop
      let remaining = 10;
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        remaining -= 1;
        setCountdown(remaining);
        if (remaining <= 0) {
          if (timerRef.current) clearInterval(timerRef.current);
          stopRecording();
        }
      }, 1000);
    } catch (err: any) {
      console.error('MediaRecorder start error:', err);
      setErrorMsg(`Failed to start recording: ${err.message}`);
    }
  };

  // Stop Recording
  const stopRecording = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  // Retake video
  const handleRetake = () => {
    if (recordedUrl) {
      URL.revokeObjectURL(recordedUrl);
    }
    setRecordedBlob(null);
    setRecordedUrl(null);
    setIsRecording(false);
    setCountdown(10);
    startCamera(facingMode);
  };

  // Confirm and pass video back to parent
  const handleConfirm = () => {
    if (!recordedBlob) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      onConfirmVideo(recordedBlob, dataUrl, recordedDuration);
      stopStream();
      onClose();
    };
    reader.readAsDataURL(recordedBlob);
  };

  const handleClose = () => {
    stopStream();
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
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
              <h3 className="text-sm font-bold text-white">Record 360° Object Video</h3>
              <p className="text-[11px] text-gray-400">10-second multi-view spatial capture</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!recordedUrl && (
              <button
                type="button"
                onClick={handleToggleFacingMode}
                className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer text-xs flex items-center gap-1 border border-white/5"
                title="Switch Camera (Front / Rear)"
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

        {/* Video Viewport / Preview Box */}
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
          ) : recordedUrl ? (
            // Recorded Video Playback Preview
            <div className="w-full h-full relative">
              <video
                ref={playbackRef}
                src={recordedUrl}
                controls
                autoPlay
                loop
                playsInline
                className="w-full h-full object-contain"
              />
              <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-black/70 border border-white/10 text-[11px] font-mono text-emerald-400">
                Duration: {recordedDuration.toFixed(1)}s (10s max)
              </div>
            </div>
          ) : (
            // Live Camera Stream
            <div className="w-full h-full relative">
              <video
                ref={videoPreviewRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />

              {/* Recording Active HUD Overlay */}
              {isRecording && (
                <div className="absolute inset-0 border-4 border-red-500 pointer-events-none flex flex-col justify-between p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-600 text-white text-xs font-bold shadow-lg">
                      <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                      REC
                    </div>

                    <div className="px-3 py-1 rounded-full bg-black/80 text-white font-mono text-xs font-bold border border-white/20 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-red-400" />
                      {countdown}s remaining
                    </div>
                  </div>

                  {/* Top object alignment reticle */}
                  <div className="self-center w-36 h-36 border border-dashed border-white/40 rounded-full flex items-center justify-center">
                    <span className="text-[10px] text-white/70 bg-black/50 px-2 py-0.5 rounded">
                      Keep Object Centered
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full h-1.5 bg-black/50 rounded-full overflow-hidden border border-white/10">
                    <div
                      className="h-full bg-red-500 transition-all duration-1000 ease-linear"
                      style={{ width: `${((10 - countdown) / 10) * 100}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Guidance Instructions Banner */}
        {showTips && !recordedUrl && (
          <div className="p-3 bg-[#0a0c12] border-t border-white/5 text-[11px] text-gray-300">
            <div className="flex items-center justify-between mb-1">
              <span className="font-semibold text-blue-400 flex items-center gap-1">
                <Info className="w-3.5 h-3.5" />
                Scanning Guidance (Best 3D Results):
              </span>
              <button
                onClick={() => setShowTips(false)}
                className="text-gray-500 hover:text-gray-300 text-[10px]"
              >
                Hide
              </button>
            </div>
            <ul className="grid grid-cols-2 gap-x-2 gap-y-1 text-gray-400 text-[10px] list-disc list-inside">
              <li>Keep the object centered throughout</li>
              <li>Move camera slowly around the object</li>
              <li>Capture front, sides, and rear views</li>
              <li>Ensure good, even lighting</li>
              <li>Avoid reflective or glass objects</li>
              <li>Complete 360° orbit within 10s</li>
            </ul>
            <p className="text-[10px] text-gray-500 mt-1 italic">
              Note: Short video may not capture every microscopic facet; optimal lighting and steady orbit yield the highest reconstruction fidelity.
            </p>
          </div>
        )}

        {/* Action Controls Bar */}
        <div className="p-3.5 bg-[#0a0c12] border-t border-white/10 flex items-center justify-between gap-2">
          {recordedUrl ? (
            <>
              <button
                type="button"
                onClick={handleRetake}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-white/5 hover:bg-white/10 text-gray-300 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Retake Video
              </button>

              <button
                type="button"
                onClick={handleConfirm}
                className="flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-lg shadow-blue-500/20 active:scale-95 transition-all cursor-pointer"
              >
                <Check className="w-4 h-4" />
                Use Video ({recordedDuration.toFixed(1)}s)
              </button>
            </>
          ) : (
            <>
              <div className="text-[11px] text-gray-400">
                {isRecording ? 'Recording in progress...' : 'Ready to record (10s max auto-stop)'}
              </div>

              {!isRecording ? (
                <button
                  type="button"
                  onClick={startRecording}
                  disabled={!stream || Boolean(errorMsg)}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white shadow-lg shadow-red-500/20 active:scale-95 transition-all cursor-pointer"
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-white" />
                  Start Recording
                </button>
              ) : (
                <button
                  type="button"
                  onClick={stopRecording}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-gray-200 hover:bg-white text-black shadow-lg active:scale-95 transition-all cursor-pointer"
                >
                  <span className="w-2.5 h-2.5 rounded-sm bg-red-600" />
                  Stop Recording ({countdown}s)
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
