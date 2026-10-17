/**
 * videoExtractor.ts
 * Browser video processor and multi-view keyframe extractor.
 * Validates actual decodable duration (strictly <= 10s),
 * enforces file size boundaries, and samples representative multi-view keyframes for 3D reconstruction.
 */

export interface VideoExtractionResult {
  duration: number; // in seconds
  fileSize: number; // in bytes
  frames: string[]; // Base64 JPEG data URLs representing multi-view perspectives
  thumbnail: string;
  bestFrameIndex: number;
}

export async function processAndExtractVideoFrames(
  videoSource: Blob | File | string,
  maxDurationSeconds = 10.05,
  frameCount = 6
): Promise<VideoExtractionResult> {
  return new Promise((resolve, reject) => {
    let videoUrl = '';
    let fileSize = 0;

    if (typeof videoSource === 'string') {
      videoUrl = videoSource;
      fileSize = Math.round((videoSource.length * 3) / 4);
    } else {
      videoUrl = URL.createObjectURL(videoSource);
      fileSize = videoSource.size;
    }

    // 50MB file size limit
    if (fileSize > 50 * 1024 * 1024) {
      if (typeof videoSource !== 'string') URL.revokeObjectURL(videoUrl);
      return reject(new Error('Video file size exceeds maximum limit (50MB).'));
    }

    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;

    video.onerror = () => {
      if (typeof videoSource !== 'string') URL.revokeObjectURL(videoUrl);
      reject(new Error('Unable to decode video. Please ensure the file is a valid MP4, WebM, or MOV video.'));
    };

    video.onloadedmetadata = async () => {
      const duration = video.duration;

      // Strict 10-second duration validation
      if (!isFinite(duration) || duration <= 0) {
        if (typeof videoSource !== 'string') URL.revokeObjectURL(videoUrl);
        return reject(new Error('Invalid video stream or unreadable duration.'));
      }

      if (duration > maxDurationSeconds) {
        if (typeof videoSource !== 'string') URL.revokeObjectURL(videoUrl);
        return reject(new Error('Video must be 10 seconds or shorter. Please upload another video.'));
      }

      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          throw new Error('Canvas 2D context not available.');
        }

        // Set dimensions (downscale to max 640px width/height for fast inference while retaining clarity)
        const maxDim = 640;
        let width = video.videoWidth || 640;
        let height = video.videoHeight || 480;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        canvas.width = width;
        canvas.height = height;

        const frames: string[] = [];
        const sharpnessScores: number[] = [];
        // Sample evenly distributed timestamps across video
        const interval = duration / (frameCount + 1);

        for (let i = 1; i <= frameCount; i++) {
          const targetTime = Math.min(duration - 0.05, Math.max(0.05, i * interval));
          await seekToTime(video, targetTime);
          ctx.drawImage(video, 0, 0, width, height);

          // Measure clarity/variance of current frame
          const imgData = ctx.getImageData(0, 0, width, height);
          const d = imgData.data;
          let sum = 0, sumSq = 0;
          const totalSamples = Math.floor(d.length / 16);
          for (let j = 0; j < d.length; j += 16) {
            const lum = 0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2];
            sum += lum;
            sumSq += lum * lum;
          }
          const mean = sum / (totalSamples || 1);
          const variance = (sumSq / (totalSamples || 1)) - (mean * mean);
          sharpnessScores.push(variance);

          const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
          frames.push(dataUrl);
        }

        // Select best frame index (highest variance/clarity)
        let bestFrameIndex = 0;
        let maxScore = -1;
        for (let i = 0; i < sharpnessScores.length; i++) {
          if (sharpnessScores[i] > maxScore) {
            maxScore = sharpnessScores[i];
            bestFrameIndex = i;
          }
        }

        if (typeof videoSource !== 'string') URL.revokeObjectURL(videoUrl);

        resolve({
          duration: Math.round(duration * 10) / 10,
          fileSize,
          frames,
          thumbnail: frames[bestFrameIndex] || frames[0] || '',
          bestFrameIndex,
        });
      } catch (err: any) {
        if (typeof videoSource !== 'string') URL.revokeObjectURL(videoUrl);
        reject(new Error(`Failed to extract video frames: ${err.message}`));
      }
    };

    video.src = videoUrl;
    video.load();
  });
}

function seekToTime(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve) => {
    const onSeeked = () => {
      video.removeEventListener('seeked', onSeeked);
      resolve();
    };
    video.addEventListener('seeked', onSeeked);
    video.currentTime = time;
  });
}
