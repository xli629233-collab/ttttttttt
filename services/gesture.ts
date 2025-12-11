import { FilesetResolver, HandLandmarker, NormalizedLandmark } from "@mediapipe/tasks-vision";
import { GestureType } from "../types";

let handLandmarker: HandLandmarker | undefined;
let lastVideoTime = -1;

export const initializeHandDetection = async () => {
  try {
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
    );
    handLandmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
        delegate: "GPU"
      },
      numHands: 1,
      runningMode: "VIDEO"
    });
    return true;
  } catch (error) {
    console.error("Failed to init MediaPipe:", error);
    return false;
  }
};

const isFingerExtended = (landmarks: NormalizedLandmark[], tipIdx: number, pipIdx: number, wristIdx: number = 0): boolean => {
  const wrist = landmarks[wristIdx];
  const tip = landmarks[tipIdx];
  const pip = landmarks[pipIdx]; // Proximal Interphalangeal Joint

  // Calculate distance to wrist
  const dTip = Math.hypot(tip.x - wrist.x, tip.y - wrist.y);
  const dPip = Math.hypot(pip.x - wrist.x, pip.y - wrist.y);

  // If tip is further from wrist than PIP, it's likely extended
  return dTip > dPip;
};

const detectGesture = (landmarks: NormalizedLandmark[]): GestureType => {
  // Finger Indices:
  // Thumb: 4 (Tip), 2 (MCP) - Thumb is tricky, handled separately or ignored for simple logic
  // Index: 8 (Tip), 6 (PIP)
  // Middle: 12 (Tip), 10 (PIP)
  // Ring: 16 (Tip), 14 (PIP)
  // Pinky: 20 (Tip), 18 (PIP)

  const indexExt = isFingerExtended(landmarks, 8, 6);
  const middleExt = isFingerExtended(landmarks, 12, 10);
  const ringExt = isFingerExtended(landmarks, 16, 14);
  const pinkyExt = isFingerExtended(landmarks, 20, 18);

  // Count extended non-thumb fingers
  const extendedCount = [indexExt, middleExt, ringExt, pinkyExt].filter(Boolean).length;

  // 1. Victory (Peace): Index & Middle extended, Ring & Pinky curled
  if (indexExt && middleExt && !ringExt && !pinkyExt) {
    return 'Victory';
  }

  // 2. Open Palm: At least 3 fingers extended (usually 4)
  if (extendedCount >= 3) {
    return 'Open_Palm';
  }

  // 3. Closed Fist: 0 or 1 finger extended (sometimes thumb sticks out in fist)
  if (extendedCount === 0) {
    return 'Closed_Fist';
  }

  return 'None';
};

export const detectHands = (video: HTMLVideoElement): { x: number; gesture: GestureType } | null => {
  if (!handLandmarker || video.currentTime === lastVideoTime) return null;
  
  lastVideoTime = video.currentTime;
  const results = handLandmarker.detectForVideo(video, performance.now());
  
  if (results.landmarks && results.landmarks.length > 0) {
    const landmarks = results.landmarks[0];
    
    // Get gesture
    const gesture = detectGesture(landmarks);

    // Get index finger tip (landmark 8) for X position
    const indexTip = landmarks[8];
    
    // Return centered normalized X (-1 to 1)
    // MediaPipe x is 0(left) to 1(right). 
    return { 
      x: (indexTip.x - 0.5) * 2,
      gesture
    }; 
  }
  return null;
};