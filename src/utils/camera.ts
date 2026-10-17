export type FacingMode = 'user' | 'environment';

export async function checkCameraPermission(): Promise<'granted' | 'denied' | 'prompt'> {
  try {
    const result = await navigator.permissions.query({ name: 'camera' as PermissionName });
    return result.state;
  } catch (e) {
    return 'prompt';
  }
}

export async function getCameraStream(facingMode: FacingMode): Promise<MediaStream> {
  const status = await checkCameraPermission();
  if (status === 'denied') {
    const err = new Error('Permission denied');
    (err as any).name = 'NotAllowedError';
    throw err;
  }

  // 1. Attempt with ideal constraints
  const constraints: MediaStreamConstraints = {
    video: {
      facingMode: { ideal: facingMode },
    },
    audio: false,
  };

  try {
    return await navigator.mediaDevices.getUserMedia(constraints);
  } catch (err: any) {
    // 2. Fallback: try basic constraints
    try {
      return await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false,
      });
    } catch (fallbackErr: any) {
      // Categorize the error for the UI
      const error = new Error(fallbackErr.message);
      (error as any).name = fallbackErr.name;
      throw error;
    }
  }
}
