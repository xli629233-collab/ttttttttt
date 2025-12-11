onsole.log("App 启动了", process.env.GEMINI_API_KEY)
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Environment, Stars, Image, Float } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import { Snow } from './components/Snow';
import { Tree, usePolkaDotTexture } from './components/Tree';
import { Aurora } from './components/Aurora';
import { AppMode, PhotoData, GestureType, TreeStyle, TreeShape } from './types';
import { initializeHandDetection, detectHands } from './services/gesture';

const MOCK_PHOTOS: PhotoData[] = Array.from({ length: 24 }).map((_, i) => ({
  id: `p-${i}`,
  url: `https://picsum.photos/seed/${i + 888}/600/400`,
}));

const TREE_COLORS = [
    '#064e3b', // Deep Green (Default)
    '#FFD700', // Pure Gold (Glowing)
    '#FFFFFF', // Pure White/Silver (Glowing)
    'rainbow'  // Seven-color
];

const Ground = () => (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -9, 0]} receiveShadow>
        <circleGeometry args={[50, 64]} />
        <meshStandardMaterial color="#1e293b" roughness={0.6} metalness={0.4} />
    </mesh>
);

// -- Focus Mode Polaroid --
const PolaroidFocus: React.FC<{ photo: PhotoData; onClose: () => void }> = ({ photo, onClose }) => {
    const { camera, size } = useThree();
    const groupRef = useRef<THREE.Group>(null);
    const overlayRef = useRef<THREE.Mesh>(null);
    const scaleRef = useRef(0);
    
    // Generate texture: White BG, Red/Green dots
    const bgColor = '#ffffff';
    const dotColors = ['#ef4444', '#22c55e'];
    const texture = usePolkaDotTexture(bgColor, dotColors);

    // Fixed distance from camera to ensure it's always "in front"
    const distance = 6; 

    useFrame((state, delta) => {
        // Calculate Scale to fill 50% of the screen area
        const vFov = (camera as THREE.PerspectiveCamera).fov;
        const height = 2 * Math.tan((vFov * Math.PI / 180) / 2) * distance;
        const width = height * (size.width / size.height);
        // Geometry is approx 5 x 6.5. Area ~ 32.5
        // We want Scale^2 * 32.5 = 0.5 * (width * height)
        const targetScale = Math.sqrt((0.5 * width * height) / 32.5);

        // Smoothly animate scale
        scaleRef.current = THREE.MathUtils.lerp(scaleRef.current, targetScale, delta * 12);
        
        // 1. Lock Photo to Camera Center
        if (groupRef.current) {
            const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
            const pos = camera.position.clone().add(forward.multiplyScalar(distance));
            
            groupRef.current.position.copy(pos);
            groupRef.current.lookAt(camera.position);
            groupRef.current.scale.setScalar(scaleRef.current);
        }

        // 2. Lock Overlay behind Photo
        if (overlayRef.current) {
            const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
            // Place slightly further than the photo so it's behind it
            const pos = camera.position.clone().add(forward.multiplyScalar(distance + 2));
            
            overlayRef.current.position.copy(pos);
            overlayRef.current.lookAt(camera.position);
        }
    });

    return (
        <>
            {/* Transparent Overlay to catch background clicks - Moves with camera */}
            <mesh 
                ref={overlayRef}
                onClick={(e) => { e.stopPropagation(); onClose(); }}
                onPointerOver={() => document.body.style.cursor = 'pointer'}
                onPointerOut={() => document.body.style.cursor = 'auto'}>
                <planeGeometry args={[100, 100]} />
                <meshBasicMaterial transparent opacity={0} />
            </mesh>

            <Float speed={2} rotationIntensity={0.05} floatIntensity={0.05}>
                <group 
                    ref={groupRef}
                    // Initial position doesn't matter, overridden by useFrame
                    onClick={(e) => {
                        e.stopPropagation();
                        onClose();
                    }}
                    onPointerOver={() => document.body.style.cursor = 'pointer'} 
                    onPointerOut={() => document.body.style.cursor = 'auto'}
                >
                    {/* Textured Card */}
                    <mesh position={[0, -0.6, -0.05]}>
                        <boxGeometry args={[5, 6.5, 0.1]} />
                        <meshStandardMaterial map={texture} roughness={0.9} />
                    </mesh>
                    {/* Photo */}
                    <Image url={photo.url} position={[0, 0.5, 0.01]} scale={[4.5, 4.5]} toneMapped={false} />
                    {/* Shine */}
                    <mesh position={[0, 0.5, 0.02]}>
                        <planeGeometry args={[4.5, 4.5]} />
                        <meshPhysicalMaterial transparent opacity={0.15} roughness={0} clearcoat={1} />
                    </mesh>
                </group>
            </Float>
        </>
    )
}

// -- Guide Overlay Component (Invisible to Canvas Recorder) --
const GuideOverlay: React.FC<{ type: 'scroll' | 'diagonal' | 'click' | 'doubleClick' | null }> = ({ type }) => {
    if (!type) return null;
    return (
        <div className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none">
            {type === 'scroll' && (
                <div className="flex flex-col items-center animate-bounce bg-black/40 backdrop-blur-sm p-6 rounded-3xl border border-white/20">
                    <span className="text-6xl mb-2 text-yellow-400">⬆️</span>
                    <span className="text-white text-3xl font-bold tracking-wider font-handwriting-cn">向上滑动</span>
                    <span className="text-white/70 text-sm mt-1">Scroll Up to Explode</span>
                </div>
            )}
            {type === 'diagonal' && (
                <div className="flex flex-col items-center animate-pulse bg-black/40 backdrop-blur-sm p-6 rounded-3xl border border-white/20">
                    <span className="text-6xl mb-2 text-purple-400">↗️</span>
                    <span className="text-white text-3xl font-bold tracking-wider font-handwriting-cn">斜着滑动</span>
                    <span className="text-white/70 text-sm mt-1">Swipe Diagonally</span>
                </div>
            )}
            {type === 'click' && (
                <div className="flex flex-col items-center bg-black/40 backdrop-blur-sm p-6 rounded-3xl border border-white/20 animate-pulse">
                     <span className="text-6xl mb-2 text-cyan-400">✨</span>
                     <span className="text-white text-3xl font-bold tracking-wider font-handwriting-cn">照片闪光</span>
                     <span className="text-white/70 text-sm mt-1">Click to View</span>
                </div>
            )}
            {type === 'doubleClick' && (
                <div className="flex flex-col items-center bg-black/40 backdrop-blur-sm p-6 rounded-3xl border border-white/20 animate-bounce">
                     <span className="text-6xl mb-2 text-pink-400">👆👆</span>
                     <span className="text-white text-3xl font-bold tracking-wider font-handwriting-cn">进入相册</span>
                     <span className="text-white/70 text-sm mt-1">Enter Album</span>
                </div>
            )}
        </div>
    );
};

const App: React.FC = () => {
  const [photos, setPhotos] = useState<PhotoData[]>(MOCK_PHOTOS);
  const [mode, setMode] = useState<AppMode>('tree');
  const [activePhoto, setActivePhoto] = useState<PhotoData | null>(null);
  
  // Interaction States
  const [isExploded, setIsExploded] = useState(false);
  const [isTwinkling, setIsTwinkling] = useState(false);
  
  // Tree Config
  const [treeColorIndex, setTreeColorIndex] = useState(0);
  const [treeStyle, setTreeStyle] = useState<TreeStyle>('classic');
  const [treeShape, setTreeShape] = useState<TreeShape>('tree');

  const [isRecording, setIsRecording] = useState(false);
  const [gestureX, setGestureX] = useState(0);
  const [showGreeting, setShowGreeting] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  
  // Menu State
  const [menuOpen, setMenuOpen] = useState(false);
  const [showRewardModal, setShowRewardModal] = useState(false);

  // Guide State for Video
  const [guideType, setGuideType] = useState<'scroll' | 'diagonal' | 'click' | 'doubleClick' | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const albumRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunks = useRef<Blob[]>([]);

  // Scroll / Swipe Accumulator for "Long Scroll"
  const scrollAccumulator = useRef(0);
  const scrollTimeout = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  const handleDoubleClick = useCallback(() => {
    if (mode === 'tree') {
      setTreeColorIndex((prev) => (prev + 1) % TREE_COLORS.length);
    }
  }, [mode]);

  useEffect(() => {
    const startWebcam = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
        await initializeHandDetection();
      } catch (e) {
        console.warn("Camera permission denied", e);
      }
    };
    startWebcam();
  }, []);

  useEffect(() => {
    let animationFrameId: number;
    const loop = () => {
      if (videoRef.current && mode === 'tree') {
        const result = detectHands(videoRef.current);
        
        if (result) {
            // Handle specific gestures
            if (result.gesture === 'Closed_Fist') {
                setIsExploded(true);
                setIsTwinkling(false);
            } 
            else if (result.gesture === 'Open_Palm') {
                // Palm enables rotation and restores tree
                setIsExploded(false);
                setGestureX(prev => prev * 0.9 + result.x * 0.1);
                setIsTwinkling(false);
            } 
            else if (result.gesture === 'Victory') {
                // Victory enables twinkle star light
                setIsTwinkling(true);
                setIsExploded(false); // Restore tree if it was exploded
                setGestureX(prev => prev * 0.95); // Dampen rotation
            } else {
                setGestureX(prev => prev * 0.95);
            }
        } else {
             setGestureX(prev => prev * 0.95);
        }
      }
      animationFrameId = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(animationFrameId);
  }, [mode]);

  useEffect(() => {
    if(audioUrl && audioRef.current) {
        audioRef.current.src = audioUrl;
        audioRef.current.play().catch(e => console.log("Audio play failed", e));
    }
  }, [audioUrl]);

  // -- Scroll Interaction (Mouse/Trackpad) --
  const handleWheel = (e: React.WheelEvent) => {
      if (mode !== 'tree') return;
      
      if (scrollTimeout.current) clearTimeout(scrollTimeout.current);

      scrollAccumulator.current += e.deltaY;

      // Reset accumulator if scrolling stops for 200ms
      scrollTimeout.current = window.setTimeout(() => {
          scrollAccumulator.current = 0;
      }, 200);

      const threshold = 500; // High threshold for "Long Scroll"

      // Scroll Up (Negative Delta) -> Explode
      if (scrollAccumulator.current < -threshold && !isExploded) {
          setIsExploded(true);
          scrollAccumulator.current = 0;
      } 
      // Scroll Down (Positive Delta) -> Restore
      else if (scrollAccumulator.current > threshold && isExploded) {
          setIsExploded(false);
          scrollAccumulator.current = 0;
      }
  };

  // -- Touch Interaction (Mobile Swipe) --
  const handleTouchStart = (e: React.TouchEvent) => {
      touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
      if (touchStartY.current === null || mode !== 'tree') return;
      
      const currentY = e.touches[0].clientY;
      const diff = touchStartY.current - currentY; // Positive = Drag Up (Finger moves UP)
      
      const swipeThreshold = 150; // Pixels for "Long Swipe"

      // Slide Up (Finger moves UP) -> Explode
      if (diff > swipeThreshold && !isExploded) {
          setIsExploded(true);
          touchStartY.current = null; // Reset to prevent repeated triggering
      } 
      // Slide Down (Finger moves DOWN) -> Restore
      else if (diff < -swipeThreshold && isExploded) {
          setIsExploded(false);
          touchStartY.current = null;
      }
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newPhotos: PhotoData[] = Array.from(e.target.files).map((file: File) => ({
        id: file.name + Date.now(),
        url: URL.createObjectURL(file),
      }));
      setPhotos(prev => [...prev, ...newPhotos]);
    }
  };

  const handleAudioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
          const url = URL.createObjectURL(e.target.files[0]);
          setAudioUrl(url);
      }
  }

  const handlePhotoClick = (photo: PhotoData) => {
    if (mode === 'tree') {
      setActivePhoto(photo);
      setMode('focus');
    }
  };

  const handleCloseFocus = () => {
      if (mode === 'focus') {
          setMode('tree');
          setActivePhoto(null);
      }
  };

  const toggleTreeStyle = () => {
      setTreeStyle(prev => {
          if (prev === 'classic') return 'crayon';
          if (prev === 'crayon') return 'geometric';
          return 'classic';
      });
  };

  const toggleTreeShape = () => {
      setTreeShape(prev => {
          if (prev === 'tree') return 'snowman';
          if (prev === 'snowman') return 'reindeer';
          if (prev === 'reindeer') return 'santa';
          return 'tree';
      });
  };

  const generateVideo = useCallback(() => {
    if (isRecording) return;
    setIsRecording(true);
    setMenuOpen(false); // Close menu
    setShowRewardModal(false);
    setMode('tree');
    setShowGreeting(false);
    setIsExploded(false); // Start collapsed
    setIsTwinkling(false);
    setGestureX(0);

    const canvas = document.querySelector('canvas');
    if (!canvas) return;
    
    // Setup Recorder
    const stream = canvas.captureStream(30);
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' });
    mediaRecorderRef.current = recorder;
    recordedChunks.current = [];

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunks.current.push(e.data);
    };

    recorder.onstop = () => {
      const blob = new Blob(recordedChunks.current, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'christmas-memory.webm';
      a.click();
      setIsRecording(false);
      setMode('tree');
      setShowGreeting(false);
      setIsExploded(false);
      setGuideType(null);
      setGestureX(0);
      setIsTwinkling(false);
    };

    recorder.start();

    // -- Choreographed Sequence (4 Steps) --
    
    // 0s: Start
    
    // Step 1: Scroll Up -> Explode
    setTimeout(() => setGuideType('scroll'), 1500); // Show Guide
    setTimeout(() => {
        setIsExploded(true);
        setGuideType(null);
    }, 4000); // Action

    // Reset for Step 2
    setTimeout(() => setIsExploded(false), 7000);

    // Step 2: Diagonal Swipe -> Twinkle + Rotate
    setTimeout(() => setGuideType('diagonal'), 8500); // Show Guide
    setTimeout(() => {
        setGuideType(null);
        setIsTwinkling(true);
        setGestureX(0.5); // Simulate rotation
    }, 11000); // Action

    // Reset for Step 3
    setTimeout(() => {
        setIsTwinkling(false);
        setGestureX(0);
    }, 14000);

    // Step 3: Flash (Click) -> Focus Photo
    setTimeout(() => setGuideType('click'), 15000); // Show Guide
    setTimeout(() => {
        setGuideType(null);
        setActivePhoto(photos[0]);
        setMode('focus');
    }, 17500); // Action

    // Close Focus
    setTimeout(() => {
        setMode('tree');
        setActivePhoto(null);
    }, 20500);

    // Step 4: Album -> Enter Album -> Auto Scroll
    setTimeout(() => setGuideType('doubleClick'), 22000); // Show Guide
    setTimeout(() => {
        setGuideType(null);
        setMode('album');
    }, 24500); // Enter Album Action
    
    // Auto Scroll Album for 4 seconds
    setTimeout(() => {
        const scrollSpeed = 3;
        const interval = setInterval(() => {
            if (albumRef.current) {
                albumRef.current.scrollLeft += scrollSpeed;
            }
        }, 16);

        // Stop scrolling after 4s
        setTimeout(() => clearInterval(interval), 4000);
    }, 25500);

    // Greeting & End
    setTimeout(() => setShowGreeting(true), 30000);
    setTimeout(() => recorder.stop(), 34000);

  }, [isRecording, photos]);

  return (
    <div 
        className="w-full h-screen bg-[#000] relative text-slate-100 font-handwriting-cn selection:bg-amber-500/30 overflow-hidden"
        onWheel={handleWheel}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onDoubleClick={handleDoubleClick}
    >
      <video ref={videoRef} className="hidden" muted playsInline />
      <audio ref={audioRef} loop crossOrigin="anonymous" />

      {/* Guide Overlay for Video Generation - HTML Layer (Not recorded by canvas stream) */}
      <GuideOverlay type={guideType} />

      <Canvas 
        ref={canvasRef}
        shadows 
        dpr={[1, 1.5]} 
        gl={{ preserveDrawingBuffer: true, toneMapping: THREE.ACESFilmicToneMapping }}
        camera={{ position: [0, 2, 24], fov: 45 }}
      >
        <color attach="background" args={['#000']} />
        
        {/* Atmosphere */}
        <Aurora />
        <Stars radius={100} depth={50} count={3000} factor={4} saturation={1} fade speed={1} />
        
        <ambientLight intensity={0.2} color="#4c1d95" />
        <spotLight position={[10, 20, 10]} angle={0.5} intensity={1.5} color="#fbbf24" castShadow />
        <pointLight position={[-10, 5, -10]} intensity={2} color="#2dd4bf" distance={40} />

        <group position={[0, -2, 0]}>
            <Snow />
            <Ground />
            
            <group visible={mode !== 'album' || isRecording}>
                <Tree 
                    photos={photos} 
                    onPhotoClick={handlePhotoClick} 
                    isExploded={isExploded}
                    isTwinkling={isTwinkling}
                    gestureRotation={gestureX}
                    foliageColor={TREE_COLORS[treeColorIndex]}
                    treeStyle={treeStyle}
                    shape={treeShape}
                />
            </group>
        </group>

        {/* Focus Mode moved outside the main group to allow locking to camera independent of scene transform */}
        {mode === 'focus' && activePhoto && (
            <PolaroidFocus 
                photo={activePhoto} 
                onClose={handleCloseFocus} 
            />
        )}

        <EffectComposer enableNormalPass={false}>
          <Bloom luminanceThreshold={1} intensity={1.2} levels={9} mipmapBlur />
          <Vignette eskil={false} offset={0.1} darkness={0.5} />
        </EffectComposer>

        <OrbitControls 
            enabled={mode === 'tree'}
            enableZoom={mode === 'tree'} 
            enablePan={false} 
            maxPolarAngle={Math.PI / 1.9} 
            minPolarAngle={Math.PI / 3}
            autoRotate={mode === 'tree' && !isRecording && gestureX === 0}
            autoRotateSpeed={0.5}
        />
      <Canvas 
  shadows 
  style={{ width: '100vw', height: '100vh', background: 'black' }} 
  camera={{ position: [0, 0, 8], fov: 45 }}
>

      {/* --- UI Controls --- */}
      
      {/* Recording Indicator (Top Right) */}
      <div className={`absolute top-6 right-6 z-50 flex items-center gap-3 bg-red-500/20 px-4 py-2 rounded-full backdrop-blur border border-red-500/50 transition-opacity duration-300 ${isRecording ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
          <div className="w-3 h-3 bg-red-500 rounded-full animate-ping" />
          <span className="text-white font-bold font-mono tracking-widest text-sm">REC</span>
      </div>

      {/* Shape Toggle - Moved to Home Page (Top Left) */}
      <div className={`absolute top-8 left-8 z-50 transition-opacity duration-500 ${isRecording ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
        <button 
            onClick={toggleTreeShape}
            className="w-16 h-16 rounded-2xl bg-white/10 hover:bg-white/20 backdrop-blur-xl border border-white/20 flex items-center justify-center shadow-[0_8px_32px_0_rgba(31,38,135,0.37)] transition-all duration-300 hover:scale-105 active:scale-95 group relative"
        >
            <span className="text-4xl filter drop-shadow-lg transform group-hover:rotate-12 transition-transform duration-300">
                {treeShape === 'tree' ? '🎄' : treeShape === 'snowman' ? '⛄' : treeShape === 'reindeer' ? '🦌' : '🎅'}
            </span>
             {/* Label Tooltip */}
             <div className="absolute left-full ml-4 px-4 py-2 bg-black/60 backdrop-blur-md rounded-xl border border-white/10 text-white font-bold whitespace-nowrap opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-[-10px] group-hover:translate-x-0 pointer-events-none">
                 <div className="text-xs text-white/60 mb-0.5 uppercase tracking-wider">切换造型</div>
                 <div className="text-lg">
                    {treeShape === 'tree' ? '圣诞树' : treeShape === 'snowman' ? '雪人' : treeShape === 'reindeer' ? '麋鹿' : '圣诞老人'}
                 </div>
            </div>
        </button>
      </div>

      {/* Reward Button (Top Right) */}
      <div className={`absolute top-8 right-8 z-50 transition-opacity duration-500 ${isRecording ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
        <button 
            onClick={() => setShowRewardModal(true)}
            className="w-16 h-16 rounded-2xl bg-white/10 hover:bg-white/20 backdrop-blur-xl border border-white/20 flex items-center justify-center shadow-[0_8px_32px_0_rgba(31,38,135,0.37)] transition-all duration-300 hover:scale-105 active:scale-95 group relative"
        >
            <span className="text-4xl filter drop-shadow-lg transform group-hover:rotate-12 transition-transform duration-300">🧧</span>
             {/* Label Tooltip */}
             <div className="absolute right-full mr-4 px-4 py-2 bg-black/60 backdrop-blur-md rounded-xl border border-white/10 text-white font-bold whitespace-nowrap opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-[10px] group-hover:translate-x-0 pointer-events-none flex flex-col items-end">
                 <div className="text-xs text-white/60 mb-0.5 uppercase tracking-wider">支持作者</div>
                 <div className="text-lg">打赏</div>
            </div>
        </button>
      </div>

      {/* Gesture Hint (Bottom Center) */}
      <div className={`absolute bottom-6 left-1/2 -translate-x-1/2 transition-opacity duration-500 pointer-events-none z-30 w-max ${isRecording || mode === 'album' ? 'opacity-0' : 'opacity-100'}`}>
          <div className="text-white/80 text-sm md:text-base bg-black/40 backdrop-blur-md px-5 py-2 rounded-full border border-white/10 flex items-center gap-4 shadow-lg">
               <span className="flex items-center gap-1"><span className="text-xl">✋</span> 旋转</span>
               <div className="w-px h-4 bg-white/20"></div>
               <span className="flex items-center gap-1"><span className="text-xl">✌️</span> 星光</span>
               <div className="w-px h-4 bg-white/20"></div>
               <span className="flex items-center gap-1"><span className="text-xl">✊</span> 爆炸</span>
          </div>
      </div>

      {/* Collapsible Floating Action Menu (Bottom Right) */}
      <div className={`absolute bottom-8 right-8 z-40 flex flex-col items-end gap-4 transition-opacity duration-500 ${isRecording ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
          
          {/* Menu Items */}
          <div className={`flex flex-col gap-3 transition-all duration-300 origin-bottom ${menuOpen ? 'translate-y-0 opacity-100 scale-100' : 'translate-y-10 opacity-0 scale-90 pointer-events-none'}`}>
              
              {/* Upload Photos */}
              <label className="flex items-center gap-3 cursor-pointer group justify-end">
                  <span className="text-white text-sm font-bold shadow-black/50 drop-shadow-md opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 backdrop-blur px-2 py-1 rounded-lg pointer-events-none">上传照片</span>
                  <div className="w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/20 flex items-center justify-center shadow-lg transition-transform hover:scale-110 active:scale-95">
                      <span className="text-xl">📷</span>
                      <input type="file" multiple accept="image/*" onChange={handlePhotoUpload} className="hidden" />
                  </div>
              </label>

              {/* Music */}
              <label className="flex items-center gap-3 cursor-pointer group justify-end">
                  <span className="text-white text-sm font-bold shadow-black/50 drop-shadow-md opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 backdrop-blur px-2 py-1 rounded-lg pointer-events-none">背景音乐</span>
                  <div className="w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/20 flex items-center justify-center shadow-lg transition-transform hover:scale-110 active:scale-95">
                      <span className="text-xl">🎵</span>
                      <input type="file" accept="audio/*" onChange={handleAudioUpload} className="hidden" />
                  </div>
              </label>

              {/* Video Generation */}
              <div className="flex items-center gap-3 group justify-end">
                  <span className="text-white text-sm font-bold shadow-black/50 drop-shadow-md opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 backdrop-blur px-2 py-1 rounded-lg pointer-events-none">生成视频</span>
                  <button 
                      onClick={() => { setMenuOpen(false); generateVideo(); }}
                      className="w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/20 flex items-center justify-center shadow-lg transition-transform hover:scale-110 active:scale-95"
                  >
                      <span className="text-xl">🎥</span>
                  </button>
              </div>

              {/* Album Toggle */}
               <div className="flex items-center gap-3 group justify-end">
                  <span className="text-white text-sm font-bold shadow-black/50 drop-shadow-md opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 backdrop-blur px-2 py-1 rounded-lg pointer-events-none">
                      {mode === 'album' ? '返回' : '相册'}
                  </span>
                  <button 
                      onClick={() => { setMenuOpen(false); setMode(mode === 'album' ? 'tree' : 'album'); }}
                      className="w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/20 flex items-center justify-center shadow-lg transition-transform hover:scale-110 active:scale-95"
                  >
                      <span className="text-xl">{mode === 'album' ? '🎄' : '🖼️'}</span>
                  </button>
              </div>
          </div>

          {/* Main FAB Trigger */}
          <button 
              onClick={() => setMenuOpen(!menuOpen)}
              className={`w-14 h-14 rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(251,191,36,0.3)] border border-white/20 transition-all duration-300 hover:scale-105 active:scale-95 z-50 ${menuOpen ? 'bg-red-500/80 rotate-90' : 'bg-amber-500/80 hover:bg-amber-500'}`}
          >
              <span className="text-2xl text-white drop-shadow-md">{menuOpen ? '✕' : '⚙️'}</span>
          </button>
      </div>

      {/* Greeting Overlay */}
      <div className={`absolute inset-0 flex items-center justify-center pointer-events-none transition-all duration-1000 ${showGreeting ? 'opacity-100 scale-100' : 'opacity-0 scale-90'}`}>
        <div className="text-center z-40">
            <h1 className="font-handwriting-en text-8xl md:text-9xl text-[#fbbf24] animate-pulse drop-shadow-none">
                Merry Christmas
            </h1>
        </div>
      </div>

      {/* Transparent Album Overlay */}
      {mode === 'album' && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-end pb-20 bg-gradient-to-t from-black/80 via-transparent to-transparent">
             <div ref={albumRef} className="flex overflow-x-auto w-full px-[50vw] gap-8 items-center snap-x snap-mandatory no-scrollbar h-[400px] py-10">
                {photos.map((photo) => (
                    <div 
                        key={photo.id} 
                        className="snap-center shrink-0 w-64 h-80 relative group cursor-pointer transition-all duration-300 hover:scale-110 hover:-translate-y-6"
                        onClick={() => {
                            setActivePhoto(photo);
                            setMode('focus');
                        }}
                    >
                         {/* Styles updated to match the 3D frame variant roughly */}
                         <div 
                            className="w-full h-full p-3 pb-12 shadow-[0_10px_30px_rgba(0,0,0,0.5)] transform rotate-1 group-hover:rotate-0 transition-transform"
                            style={{ 
                                backgroundColor: '#ffffff',
                                backgroundImage: `
                                    radial-gradient(#ef4444 3px, transparent 4px),
                                    radial-gradient(#22c55e 3px, transparent 4px)
                                `,
                                backgroundSize: '40px 40px',
                                backgroundPosition: '0 0, 20px 20px'
                            }}
                         >
                            <img src={photo.url} className="w-full h-full object-cover bg-gray-200" alt="memory" />
                            <div className="absolute bottom-4 left-0 w-full text-center text-slate-800 text-sm font-handwriting-en">Memory</div>
                         </div>
                    </div>
                ))}
             </div>
             <p className="text-white/60 mt-4 text-xl animate-bounce">← 滑动浏览回忆 →</p>
             <div 
                className="absolute inset-0 -z-10 cursor-pointer" 
                onClick={() => setMode('tree')} // Clicking empty space returns to tree
             />
          </div>
      )}

      {/* Reward Modal */}
      {showRewardModal && (
        <div 
            className="absolute inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-in fade-in duration-200"
            onClick={() => setShowRewardModal(false)}
        >
             <div 
                className="bg-zinc-900/90 border border-white/20 rounded-3xl p-8 max-w-sm w-full backdrop-blur-xl shadow-2xl relative transform transition-all animate-in zoom-in-95 duration-200" 
                onClick={e => e.stopPropagation()}
            >
                <button 
                    onClick={() => setShowRewardModal(false)}
                    className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white/60 hover:text-white transition-colors"
                >
                    ✕
                </button>
                <div className="text-center">
                    <div className="text-6xl mb-4 animate-bounce">🧧</div>
                    <h3 className="text-3xl font-bold text-amber-400 mb-2 font-handwriting-cn">给作者加鸡腿</h3>
                    <p className="text-white/70 mb-8 text-base font-handwriting-en">Thank you for your support! ❤️</p>
                    
                    {/* Placeholder for QR Code */}
                    <div className="relative group mx-auto w-48 h-48 bg-white rounded-2xl p-2 shadow-lg mb-6 overflow-hidden">
                         <div className="w-full h-full border-2 border-dashed border-gray-300 rounded-xl flex items-center justify-center bg-gray-50 text-gray-400 flex-col gap-2">
                             <span className="text-4xl">📷</span>
                             <span className="text-xs">此处放置收款码</span>
                         </div>
                    </div>
                    
                    <p className="text-white/40 text-xs">微信 / 支付宝 扫一扫</p>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default App;
