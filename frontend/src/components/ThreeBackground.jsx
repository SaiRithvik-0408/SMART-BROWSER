import React, { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Stars } from '@react-three/drei';
import * as THREE from 'three';

function Globe({ active }) {
  const groupRef = useRef();
  const ringRef = useRef();

  useFrame((_, dt) => {
    if (groupRef.current) groupRef.current.rotation.y += dt * (active ? 0.18 : 0.08);
    if (ringRef.current)  ringRef.current.rotation.z  += dt * 0.25;
  });

  return (
    <group ref={groupRef} position={[0, 0, 0]}>
      <mesh>
        <icosahedronGeometry args={[2.2, 3]} />
        <meshBasicMaterial
          color={active ? '#7aa2ff' : '#3b4a8a'}
          wireframe
          transparent
          opacity={0.55}
        />
      </mesh>
      <mesh>
        <sphereGeometry args={[2.15, 48, 48]} />
        <meshBasicMaterial color={active ? '#0c1840' : '#0a1130'} transparent opacity={0.55} />
      </mesh>
      <mesh ref={ringRef} rotation={[Math.PI / 2.4, 0, 0]}>
        <torusGeometry args={[2.9, 0.012, 16, 200]} />
        <meshBasicMaterial color={active ? '#a78bfa' : '#4b3b8a'} transparent opacity={0.8} />
      </mesh>
    </group>
  );
}

function Particles({ count = 600, active }) {
  const ref = useRef();
  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 3 + Math.random() * 6;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      arr[i * 3 + 0] = r * Math.sin(phi) * Math.cos(theta);
      arr[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      arr[i * 3 + 2] = r * Math.cos(phi);
    }
    return arr;
  }, [count]);

  useFrame((_, dt) => {
    if (ref.current) {
      ref.current.rotation.y += dt * (active ? 0.05 : 0.02);
      ref.current.rotation.x += dt * 0.01;
    }
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={positions.length / 3}
          array={positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.035}
        color={active ? '#7aa2ff' : '#6b7bb8'}
        transparent
        opacity={0.85}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

export default function ThreeBackground({ active = false }) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
        background:
          'radial-gradient(1200px 700px at 50% 20%, rgba(122,162,255,0.10), transparent 60%),' +
          'radial-gradient(900px 600px at 80% 90%, rgba(167,139,250,0.10), transparent 60%),' +
          '#05060f',
      }}
    >
      <Canvas camera={{ position: [0, 0, 7], fov: 55 }}>
        <ambientLight intensity={0.6} />
        <Stars radius={60} depth={40} count={2000} factor={3} fade speed={0.6} />
        <Particles active={active} />
        <Globe active={active} />
      </Canvas>
    </div>
  );
}
