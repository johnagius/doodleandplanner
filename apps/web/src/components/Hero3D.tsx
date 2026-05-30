import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Float, MeshDistortMaterial, Icosahedron } from '@react-three/drei';
import { useRef } from 'react';
import * as THREE from 'three';

/**
 * 3D hero scene (lazy-loaded). A floating, distorted "gem" with an iridescent
 * material over a drifting particle field, all reacting to the pointer. Mounted
 * behind the hero copy; falls back to the 2D shader while this chunk loads or
 * if WebGL/3D is unavailable.
 */

function Gem({ dark }: { dark: boolean }) {
  const mesh = useRef<THREE.Mesh>(null);
  const { pointer } = useThree();

  useFrame((_, dt) => {
    const m = mesh.current;
    if (!m) return;
    // Gentle auto-rotation, nudged toward the pointer.
    m.rotation.y += dt * 0.25 + pointer.x * dt * 0.6;
    m.rotation.x += dt * 0.12 + -pointer.y * dt * 0.4;
  });

  return (
    <Float speed={1.4} rotationIntensity={0.6} floatIntensity={1.1}>
      <Icosahedron ref={mesh} args={[1.6, 6]}>
        <MeshDistortMaterial
          color={dark ? '#6366f1' : '#8b8ef8'}
          emissive={dark ? '#3b1d6e' : '#c7b6ff'}
          emissiveIntensity={dark ? 0.55 : 0.35}
          roughness={0.18}
          metalness={0.85}
          distort={0.42}
          speed={1.6}
        />
      </Icosahedron>
    </Float>
  );
}

function Particles({ count = 240, dark }: { count?: number; dark: boolean }) {
  const points = useRef<THREE.Points>(null);
  const positions = useRef<Float32Array>();
  if (!positions.current) {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 14;
      arr[i * 3 + 1] = (Math.random() - 0.5) * 8;
      arr[i * 3 + 2] = (Math.random() - 0.5) * 6 - 2;
    }
    positions.current = arr;
  }
  useFrame((state) => {
    const p = points.current;
    if (!p) return;
    p.rotation.y = state.clock.elapsedTime * 0.03;
    p.rotation.x = Math.sin(state.clock.elapsedTime * 0.05) * 0.1;
  });
  return (
    <points ref={points}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={positions.current}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.05}
        sizeAttenuation
        color={dark ? '#c4b5fd' : '#a5b4fc'}
        transparent
        opacity={dark ? 0.8 : 0.6}
        depthWrite={false}
      />
    </points>
  );
}

export default function Hero3D({ className }: { className?: string }) {
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  return (
    <div className={className} aria-hidden data-testid="hero-3d">
      <Canvas
        camera={{ position: [0, 0, 6], fov: 50 }}
        dpr={[1, 2]}
        frameloop={reduced ? 'demand' : 'always'}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      >
        <ambientLight intensity={0.6} />
        <directionalLight
          position={[5, 5, 5]}
          intensity={1.2}
          color={dark ? '#a78bfa' : '#ffffff'}
        />
        <pointLight position={[-5, -3, 2]} intensity={1.4} color="#ec4899" />
        <pointLight position={[4, -2, 3]} intensity={1.0} color="#22d3ee" />
        <Gem dark={dark} />
        <Particles dark={dark} />
      </Canvas>
    </div>
  );
}
