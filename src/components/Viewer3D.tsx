/**
 * Viewer3D.tsx
 * High-performance 3D Model Viewer using Three.js and GLTFLoader.
 * Implements camera controls, bounding box fitting, contact grounding,
 * shading modes (PBR, Wireframe, Clay), and resource cleanup.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RotateCw, AlertTriangle, RefreshCw, ZoomIn, Box } from 'lucide-react';

export type ShadingMode = 'pbr' | 'wireframe' | 'clay';

interface Viewer3DProps {
  modelUrl: string | null;
  onModelLoaded?: (stats: { polycount: number; vertexCount: number; meshCount: number }) => void;
  shadingMode?: ShadingMode;
  autoRotate?: boolean;
  autoRotateSpeed?: number;
  showGrid?: boolean;
  onResetCamera?: (resetFn: () => void) => void;
  onSetCameraView?: (viewFn: (view: 'front' | 'top' | 'isometric' | 'side') => void) => void;
}

export const Viewer3D: React.FC<Viewer3DProps> = ({
  modelUrl,
  onModelLoaded,
  shadingMode = 'pbr',
  autoRotate = true,
  autoRotateSpeed = 1.5,
  showGrid = true,
  onResetCamera,
  onSetCameraView,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Three.js internal references
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const currentModelRef = useRef<THREE.Group | null>(null);
  const gridHelperRef = useRef<THREE.GridHelper | null>(null);
  const animFrameId = useRef<number | null>(null);
  const originalMaterials = useRef<Map<THREE.Mesh, THREE.Material | THREE.Material[]>>(new Map());

  // Clay material cache
  const clayMaterialRef = useRef<THREE.MeshStandardMaterial>(
    new THREE.MeshStandardMaterial({
      color: 0xd1d5db,
      roughness: 0.7,
      metalness: 0.1,
    })
  );

  // Initialize Three.js scene
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;

    // 1. Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0c0d12);
    scene.fog = new THREE.Fog(0x0c0d12, 12, 35);
    sceneRef.current = scene;

    // 2. Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(2.5, 2.0, 3.2);
    cameraRef.current = camera;

    // 3. WebGL Renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      alpha: false,
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;
    container.appendChild(renderer.domElement);

    // 4. Studio Environment Lighting
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();
    const roomEnv = new RoomEnvironment();
    scene.environment = pmremGenerator.fromScene(roomEnv, 0.04).texture;
    pmremGenerator.dispose();

    // Key Light
    const keyLight = new THREE.DirectionalLight(0xfff5eb, 2.2);
    keyLight.position.set(4, 6, 3);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    // Fill Light
    const fillLight = new THREE.HemisphereLight(0x7c8ba1, 0x1a1c23, 1.2);
    fillLight.position.set(0, 8, 0);
    scene.add(fillLight);

    // Rim/Backlight
    const rimLight = new THREE.DirectionalLight(0x4080ff, 1.5);
    rimLight.position.set(-4, 3, -3);
    scene.add(rimLight);

    // Grid Floor
    const gridHelper = new THREE.GridHelper(12, 24, 0x3b82f6, 0x1f2430);
    gridHelper.position.y = 0;
    scene.add(gridHelper);
    gridHelperRef.current = gridHelper;

    // Soft Contact Shadow Plane directly on floor
    const shadowGeo = new THREE.PlaneGeometry(8, 8);
    const shadowMat = new THREE.ShadowMaterial({ opacity: 0.4 });
    const shadowPlane = new THREE.Mesh(shadowGeo, shadowMat);
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = 0.001;
    shadowPlane.receiveShadow = true;
    scene.add(shadowPlane);

    // 5. OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.minDistance = 0.5;
    controls.maxDistance = 25;
    controls.maxPolarAngle = Math.PI / 2 + 0.05; // allow looking slightly from below floor
    controls.target.set(0, 0.6, 0);
    controlsRef.current = controls;

    // 6. Render Loop
    let lastTime = performance.now();
    const animate = (time: number) => {
      animFrameId.current = requestAnimationFrame(animate);
      const delta = (time - lastTime) / 1000;
      lastTime = time;

      if (controlsRef.current) {
        controlsRef.current.update();
      }

      if (currentModelRef.current && autoRotate) {
        currentModelRef.current.rotation.y += delta * 0.4 * autoRotateSpeed;
      }

      renderer.render(scene, camera);
    };
    animFrameId.current = requestAnimationFrame(animate);

    // 7. Resize Observer
    const handleResize = () => {
      if (!container || !rendererRef.current || !cameraRef.current) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };

    window.addEventListener('resize', handleResize);
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    // Cleanup on unmount
    return () => {
      if (animFrameId.current) cancelAnimationFrame(animFrameId.current);
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();

      if (rendererRef.current && rendererRef.current.domElement) {
        container.removeChild(rendererRef.current.domElement);
        rendererRef.current.dispose();
      }
    };
  }, []);

  // Update Grid visibility
  useEffect(() => {
    if (gridHelperRef.current) {
      gridHelperRef.current.visible = showGrid;
    }
  }, [showGrid]);

  // Camera reset helper
  const resetCamera = useCallback(() => {
    if (!cameraRef.current || !controlsRef.current) return;
    cameraRef.current.position.set(2.5, 2.0, 3.2);
    controlsRef.current.target.set(0, 0.6, 0);
    controlsRef.current.update();
  }, []);

  // Camera view presets
  const setCameraView = useCallback((view: 'front' | 'top' | 'isometric' | 'side') => {
    if (!cameraRef.current || !controlsRef.current) return;
    const dist = 3.5;
    const targetY = 0.6;
    controlsRef.current.target.set(0, targetY, 0);

    switch (view) {
      case 'front':
        cameraRef.current.position.set(0, targetY, dist);
        break;
      case 'top':
        cameraRef.current.position.set(0, dist + targetY, 0.001);
        break;
      case 'side':
        cameraRef.current.position.set(dist, targetY, 0);
        break;
      case 'isometric':
      default:
        cameraRef.current.position.set(dist * 0.7, dist * 0.6 + targetY, dist * 0.7);
        break;
    }
    controlsRef.current.update();
  }, []);

  // Bind camera controllers to parent callbacks
  useEffect(() => {
    if (onResetCamera) onResetCamera(resetCamera);
    if (onSetCameraView) onSetCameraView(setCameraView);
  }, [onResetCamera, onSetCameraView, resetCamera, setCameraView]);

  // Load Model whenever modelUrl changes
  useEffect(() => {
    if (!modelUrl) {
      // Clear previous model if any
      if (currentModelRef.current && sceneRef.current) {
        sceneRef.current.remove(currentModelRef.current);
        disposeHierarchy(currentModelRef.current);
        currentModelRef.current = null;
      }
      return;
    }

    setLoading(true);
    setLoadProgress(0);
    setLoadError(null);

    const loader = new GLTFLoader();

    loader.load(
      modelUrl,
      (gltf) => {
        if (!sceneRef.current) return;

        // Remove old model
        if (currentModelRef.current) {
          sceneRef.current.remove(currentModelRef.current);
          disposeHierarchy(currentModelRef.current);
          currentModelRef.current = null;
          originalMaterials.current.clear();
        }

        const model = gltf.scene;
        currentModelRef.current = model;

        // Gather geometry statistics and cache original materials
        let totalVertices = 0;
        let totalTriangles = 0;
        let totalMeshes = 0;

        model.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            totalMeshes++;

            if (mesh.geometry) {
              const pos = mesh.geometry.attributes.position;
              if (pos) totalVertices += pos.count;
              if (mesh.geometry.index) {
                totalTriangles += mesh.geometry.index.count / 3;
              } else if (pos) {
                totalTriangles += pos.count / 3;
              }
            }

            if (mesh.material) {
              originalMaterials.current.set(mesh, mesh.material);
            }
          }
        });

        // 1. Calculate Bounding Box
        const bbox = new THREE.Box3().setFromObject(model);
        const size = bbox.getSize(new THREE.Vector3());
        const center = bbox.getCenter(new THREE.Vector3());

        // Check for empty/invalid geometry
        if (size.length() < 0.0001) {
          setLoadError('The loaded 3D file does not contain valid geometry.');
          setLoading(false);
          return;
        }

        // 2. Normalize scale so object fits nicely (target max dimension ~ 1.8 units)
        const maxDim = Math.max(size.x, size.y, size.z);
        const scaleFactor = 1.8 / (maxDim || 1);
        model.scale.setScalar(scaleFactor);

        // Recalculate box after scale
        bbox.setFromObject(model);
        const scaledSize = bbox.getSize(new THREE.Vector3());
        const scaledCenter = bbox.getCenter(new THREE.Vector3());

        // Center on X and Z, and place base flush on grid (y = 0)
        model.position.x = -scaledCenter.x;
        model.position.z = -scaledCenter.z;
        model.position.y = -bbox.min.y;

        // Apply Shading Mode
        applyShadingMode(model, shadingMode);

        sceneRef.current.add(model);

        // Adjust camera target to center of scaled model
        if (controlsRef.current && cameraRef.current) {
          controlsRef.current.target.set(0, scaledSize.y * 0.5, 0);
          cameraRef.current.position.set(scaledSize.x * 1.5, scaledSize.y * 1.2 + 0.5, scaledSize.z * 1.8 + 1.2);
          controlsRef.current.update();
        }

        setLoading(false);
        setLoadProgress(100);

        if (onModelLoaded) {
          onModelLoaded({
            polycount: Math.round(totalTriangles),
            vertexCount: totalVertices,
            meshCount: totalMeshes,
          });
        }
      },
      (xhr) => {
        if (xhr.total > 0) {
          const percent = Math.round((xhr.loaded / xhr.total) * 100);
          setLoadProgress(percent);
        }
      },
      (error: any) => {
        console.error('Failed to load GLB:', error);
        setLoading(false);
        setLoadError(`Failed to load 3D model asset (${error?.message || 'Network or parse error'}).`);
      }
    );
  }, [modelUrl]);

  // Apply Shading Mode dynamically
  const applyShadingMode = (model: THREE.Group, mode: ShadingMode) => {
    model.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        const origMat = originalMaterials.current.get(mesh);

        if (mode === 'clay') {
          mesh.material = clayMaterialRef.current;
        } else if (mode === 'wireframe') {
          if (origMat) {
            if (Array.isArray(origMat)) {
              origMat.forEach((m) => ((m as THREE.MeshStandardMaterial).wireframe = true));
              mesh.material = origMat;
            } else {
              (origMat as THREE.MeshStandardMaterial).wireframe = true;
              mesh.material = origMat;
            }
          }
        } else {
          // 'pbr'
          if (origMat) {
            if (Array.isArray(origMat)) {
              origMat.forEach((m) => ((m as THREE.MeshStandardMaterial).wireframe = false));
              mesh.material = origMat;
            } else {
              (origMat as THREE.MeshStandardMaterial).wireframe = false;
              mesh.material = origMat;
            }
          }
        }
      }
    });
  };

  useEffect(() => {
    if (currentModelRef.current) {
      applyShadingMode(currentModelRef.current, shadingMode);
    }
  }, [shadingMode]);

  // Clean memory
  const disposeHierarchy = (obj: THREE.Object3D) => {
    obj.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) {
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach((m) => m.dispose());
          } else {
            mesh.material.dispose();
          }
        }
      }
    });
  };

  return (
    <div className="relative w-full h-full min-h-[400px] overflow-hidden select-none bg-[#0c0d12]">
      {/* 3D WebGL Canvas Container */}
      <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {/* Loading Overlay */}
      {loading && (
        <div className="absolute inset-0 bg-black/70 backdrop-blur-xs flex flex-col items-center justify-center pointer-events-none z-20">
          <div className="w-14 h-14 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mb-4" />
          <p className="text-white font-medium text-base">Loading 3D Model...</p>
          {loadProgress > 0 && (
            <p className="text-blue-400 text-sm font-mono mt-1">{loadProgress}%</p>
          )}
        </div>
      )}

      {/* Error Overlay */}
      {loadError && (
        <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center p-6 text-center z-20">
          <AlertTriangle className="w-12 h-12 text-red-400 mb-3" />
          <h4 className="text-lg font-bold text-white mb-1">Model Render Error</h4>
          <p className="text-gray-400 text-sm max-w-md mb-4">{loadError}</p>
          <button
            onClick={() => {
              if (modelUrl) {
                setLoadError(null);
                setLoading(true);
              }
            }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
            Retry Loading
          </button>
        </div>
      )}

      {/* Empty State Prompt */}
      {!modelUrl && !loading && !loadError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center pointer-events-none z-10">
          <div className="w-20 h-20 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-4 text-blue-400">
            <Box className="w-10 h-10 animate-pulse" />
          </div>
          <h3 className="text-xl font-bold text-white mb-2">3D Viewport Ready</h3>
          <p className="text-gray-400 text-sm max-w-sm mb-4">
            Enter a prompt or upload an image to generate an interactive 3D asset, or load the calibration test fixture.
          </p>
        </div>
      )}
    </div>
  );
};
