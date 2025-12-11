
import React, { useRef } from 'react';
import { useFrame, ThreeElements } from '@react-three/fiber';
import * as THREE from 'three';
import '../types';

const vertexShader = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragmentShader = `
uniform float uTime;
varying vec2 vUv;

// Simplex 2D noise
vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }
float snoise(vec2 v){
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
           -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy) );
  vec2 x0 = v -   i + dot(i, C.xx);
  vec2 i1;
  i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 ))
  + i.x + vec3(0.0, i1.x, 1.0 ));
  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
  m = m*m ;
  m = m*m ;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

void main() {
  vec2 uv = vUv;
  
  // Create wavy aurora lines
  float noise1 = snoise(vec2(uv.x * 3.0, uv.y * 2.0 - uTime * 0.1));
  float noise2 = snoise(vec2(uv.x * 4.0 + 10.0, uv.y * 3.0 - uTime * 0.15));
  
  float aurora = 0.0;
  
  // Combine layers
  float wave = sin(uv.x * 10.0 + uTime * 0.5 + noise1 * 5.0) * 0.5 + 0.5;
  float intensity = smoothstep(0.0, 0.8, wave * (1.0 - uv.y)); // Fade at top
  
  // Vertical streaks
  float streaks = smoothstep(0.3, 0.7, noise2);
  
  aurora = intensity * streaks;
  
  // Colors: Green/Teal at bottom, Purple at top
  vec3 colorA = vec3(0.0, 1.0, 0.6); // Teal/Green
  vec3 colorB = vec3(0.6, 0.0, 1.0); // Purple
  
  vec3 finalColor = mix(colorA, colorB, uv.y + noise1 * 0.2);
  
  // Alpha fade at bottom horizon
  float alpha = aurora * smoothstep(0.0, 0.2, uv.y);
  
  gl_FragColor = vec4(finalColor, alpha * 0.6);
}
`;

export const Aurora: React.FC = () => {
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  useFrame((state) => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = state.clock.elapsedTime;
    }
  });

  return (
    <mesh position={[0, 10, -30]} scale={[80, 40, 1]}>
      <planeGeometry args={[1, 1, 64, 64]} />
      <shaderMaterial
        ref={materialRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={{
          uTime: { value: 0 }
        }}
        transparent
        depthWrite={false}
        side={THREE.DoubleSide}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
};