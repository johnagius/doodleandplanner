import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Float, MeshDistortMaterial, Icosahedron } from '@react-three/drei';
import { useEffect, useMemo, useRef } from 'react';
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  PointsMaterial,
  Points as ThreePoints,
  type Group,
} from 'three';
import { useThemeIsDark } from '../lib/useTheme.js';

/**
 * 3D hero scene (lazy-loaded). A floating, distorted "gem" with an iridescent
 * material over a drifting particle field, all reacting to the pointer. Mounted
 * behind the hero copy; falls back to the 2D shader while this chunk loads or
 * if WebGL/3D is unavailable.
 */

function Gem({ dark }: { dark: boolean }) {
  // Rotate a wrapping group so we never depend on drei's mesh ref typing.
  const group = useRef<Group | null>(null);
  const { pointer } = useThree();

  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;
    // Gentle auto-rotation, nudged toward the pointer.
    g.rotation.y += dt * 0.25 + pointer.x * dt * 0.6;
    g.rotation.x += dt * 0.12 + -pointer.y * dt * 0.4;
  });

  return (
    <Float speed={1.4} rotationIntensity={0.6} floatIntensity={1.1}>
      <group ref={(node) => void (group.current = node)}>
        <Icosahedron args={[1.6, 6]}>
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
      </group>
    </Float>
  );
}

function Particles({ count = 240, dark }: { count?: number; dark: boolean }) {
  const group = useRef<Group | null>(null);

  // Build the THREE.Points object imperatively (avoids fragile <bufferAttribute>
  // JSX typing) and render it via <primitive>.
  const object = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 14;
      arr[i * 3 + 1] = (Math.random() - 0.5) * 8;
      arr[i * 3 + 2] = (Math.random() - 0.5) * 6 - 2;
    }
    const geom = new BufferGeometry();
    geom.setAttribute('position', new BufferAttribute(arr, 3));
    const mat = new PointsMaterial({
      size: 0.05,
      sizeAttenuation: true,
      color: new Color(dark ? '#c4b5fd' : '#a5b4fc'),
      transparent: true,
      opacity: dark ? 0.8 : 0.6,
      depthWrite: false,
    });
    return new ThreePoints(geom, mat);
  }, [count, dark]);

  // <primitive> does not auto-dispose objects it didn't create, so free the
  // geometry/material when the object is replaced (theme/count) or unmounts.
  useEffect(
    () => () => {
      object.geometry.dispose();
      object.material.dispose();
    },
    [object],
  );

  useFrame((state) => {
    const g = group.current;
    if (!g) return;
    g.rotation.y = state.clock.elapsedTime * 0.03;
    g.rotation.x = Math.sin(state.clock.elapsedTime * 0.05) * 0.1;
  });

  return (
    <group ref={(node) => void (group.current = node)}>
      <primitive object={object} />
    </group>
  );
}

export default function Hero3D({ className }: { className?: string }) {
  const dark = useThemeIsDark();
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
