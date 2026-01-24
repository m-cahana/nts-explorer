import { useRef, useMemo, useState, useEffect, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, useTexture } from '@react-three/drei';
import type { OrbitControlsImpl } from 'three-stdlib';
import { Vector3, MathUtils, Mesh, Group, LinearFilter, DoubleSide, MOUSE } from 'three';
import type { Track } from '../types';

interface Props {
  tracks: Track[];
  activeTrackId: number | null;
  onHoverStart: (trackId: number) => void;
  onHoverEnd: () => void;
  onClick: (trackId: number) => void;
  isReady?: boolean; // True when welcome overlay is dismissed
}

const CLOUD_RADIUS = 800;
const TILE_SIZE = 60;

// Seeded random for deterministic positions
function seededRandom(seed: number) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

// Convert spherical to cartesian coordinates
function sphericalToCartesian(radius: number, theta: number, phi: number) {
  return {
    x: radius * Math.sin(phi) * Math.cos(theta),
    y: radius * Math.sin(phi) * Math.sin(theta),
    z: radius * Math.cos(phi),
  };
}

// Get small artwork URL
function getSmallArtworkUrl(url: string | null): string | null {
  if (!url) return null;
  return url.replace(/-large\./, '-t200x200.').replace(/-t\d+x\d+\./, '-t200x200.');
}

// Single tile component
function Tile({
  track,
  position,
  isActive,
  isHovered,
  onPointerOver,
  onPointerOut,
  onClick,
}: {
  track: Track;
  position: [number, number, number];
  isActive: boolean;
  isHovered: boolean;
  onPointerOver: () => void;
  onPointerOut: () => void;
  onClick: () => void;
}) {
  const meshRef = useRef<Mesh>(null);
  const artworkUrl = getSmallArtworkUrl(track.artwork_url)!;

  // Load texture
  const texture = useTexture(artworkUrl, (tex) => {
    tex.minFilter = LinearFilter;
    tex.magFilter = LinearFilter;
  });

  // Scale animation for hover
  const targetScale = isHovered ? 1.3 : 1;
  const tempScaleVec = useMemo(() => new Vector3(), []);

  useFrame(() => {
    if (meshRef.current) {
      // Smooth scale transition - reuse vector to avoid allocation
      meshRef.current.scale.lerp(
        tempScaleVec.set(targetScale, targetScale, targetScale),
        0.1
      );
    }
  });

  return (
    <mesh
      ref={meshRef}
      position={position}
      onPointerOver={(e) => {
        e.stopPropagation();
        onPointerOver();
      }}
      onPointerOut={(e) => {
        e.stopPropagation();
        onPointerOut();
      }}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <planeGeometry args={[TILE_SIZE, TILE_SIZE]} />
      <meshBasicMaterial
        map={texture}
        side={DoubleSide}
        transparent
      />
      {/* Active indicator ring */}
      {isActive && (
        <mesh position={[0, 0, 0.1]}>
          <ringGeometry args={[TILE_SIZE / 2 + 2, TILE_SIZE / 2 + 4, 32]} />
          <meshBasicMaterial color="#000" side={DoubleSide} />
        </mesh>
      )}
    </mesh>
  );
}

// Camera controller with intro animation
function CameraController({
  isReady,
  focusPosition
}: {
  isReady: boolean;
  focusPosition: Vector3 | null;
}) {
  const { camera } = useThree();
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const [introComplete, setIntroComplete] = useState(false);
  const prevFocusPosition = useRef<Vector3 | null>(null);

  // Track focus position changes to mark intro complete (avoid setState in useEffect)

  // Intro animation and focus animation
  useFrame(() => {
    if (!isReady) return;

    // Check if focus position changed - mark intro complete
    if (focusPosition && focusPosition !== prevFocusPosition.current) {
      prevFocusPosition.current = focusPosition;
      setIntroComplete(true);
    }

    // Intro animation - zoom out from close to far
    if (!introComplete) {
      const targetDistance = 1500;
      const currentDistance = camera.position.length();

      if (currentDistance < targetDistance - 10) {
        const direction = camera.position.clone().normalize();
        const newDistance = MathUtils.lerp(currentDistance, targetDistance, 0.02);
        camera.position.copy(direction.multiplyScalar(newDistance));
      } else {
        setIntroComplete(true);
      }
    }

    // Focus animation - smooth lerp to clicked tile
    if (focusPosition && controlsRef.current && introComplete) {
      // Lerp the orbit target toward the focused tile
      controlsRef.current.target.lerp(focusPosition, 0.1);

      // Zoom in toward the focused tile
      const targetZoomDistance = 250;
      const currentTarget = controlsRef.current.target;
      const directionToTarget = camera.position.clone().sub(currentTarget).normalize();
      const currentDistanceFromTarget = camera.position.distanceTo(currentTarget);

      if (Math.abs(currentDistanceFromTarget - targetZoomDistance) > 2) {
        const newDistance = MathUtils.lerp(
          currentDistanceFromTarget,
          targetZoomDistance,
          0.2
        );
        camera.position.copy(
          currentTarget.clone().add(directionToTarget.multiplyScalar(newDistance))
        );
      }
    }
  });

  // Set initial camera position (close for intro)
  useEffect(() => {
    camera.position.set(0, 0, 300);
  }, [camera]);

  return (
    <OrbitControls
      ref={controlsRef}
      enableDamping={false}
      enableZoom={true}
      enablePan={false}
      minDistance={200}
      maxDistance={2500}
      mouseButtons={{
        LEFT: MOUSE.ROTATE,
        MIDDLE: MOUSE.DOLLY,
        RIGHT: MOUSE.ROTATE,
      }}
    />
  );
}

// Billboard effect - tiles always face camera
function BillboardTiles({
  tracks,
  activeTrackId,
  hoveredTrackId,
  onHoverStart,
  onHoverEnd,
  onClick,
}: {
  tracks: Track[];
  activeTrackId: number | null;
  hoveredTrackId: number | null;
  onHoverStart: (trackId: number) => void;
  onHoverEnd: () => void;
  onClick: (trackId: number) => void;
}) {
  const groupRef = useRef<Group>(null);
  const { camera } = useThree();

  // Calculate 3D positions for all tracks
  const positions = useMemo(() => {
    return tracks.map(track => {
      // Distribute in a spherical cloud
      const theta = seededRandom(track.id) * Math.PI * 2;
      const phi = seededRandom(track.id * 2) * Math.PI;
      const radius = CLOUD_RADIUS * (0.3 + seededRandom(track.id * 3) * 0.7);

      const pos = sphericalToCartesian(radius, theta, phi);
      return [pos.x, pos.y, pos.z] as [number, number, number];
    });
  }, [tracks]);

  // Make all tiles face the camera (billboard effect)
  useFrame(() => {
    if (groupRef.current) {
      groupRef.current.children.forEach(child => {
        if (child instanceof Mesh) {
          child.lookAt(camera.position);
        }
      });
    }
  });

  return (
    <group ref={groupRef}>
      {tracks.map((track, index) => (
        <Tile
          key={track.id}
          track={track}
          position={positions[index]}
          isActive={track.id === activeTrackId}
          isHovered={track.id === hoveredTrackId}
          onPointerOver={() => onHoverStart(track.id)}
          onPointerOut={onHoverEnd}
          onClick={() => onClick(track.id)}
        />
      ))}
    </group>
  );
}

// Main component
export function ThreeTileCloud({
  tracks,
  activeTrackId,
  onHoverStart,
  onHoverEnd,
  onClick,
  isReady = false,
}: Props) {
  const [hoveredTrackId, setHoveredTrackId] = useState<number | null>(null);
  const [focusPosition, setFocusPosition] = useState<Vector3 | null>(null);
  const cursorRef = useRef<HTMLDivElement>(null);

  // Handle hover
  const handleHoverStart = useCallback((trackId: number) => {
    setHoveredTrackId(trackId);
    onHoverStart(trackId);
  }, [onHoverStart]);

  const handleHoverEnd = useCallback(() => {
    setHoveredTrackId(null);
    onHoverEnd();
  }, [onHoverEnd]);

  // Handle click - focus on tile and play
  const handleClick = useCallback((trackId: number) => {
    // Find position of clicked track
    const trackIndex = tracks.findIndex(t => t.id === trackId);
    if (trackIndex !== -1) {
      const theta = seededRandom(trackId) * Math.PI * 2;
      const phi = seededRandom(trackId * 2) * Math.PI;
      const radius = CLOUD_RADIUS * (0.3 + seededRandom(trackId * 3) * 0.7);
      const pos = sphericalToCartesian(radius, theta, phi);
      setFocusPosition(new Vector3(pos.x, pos.y, pos.z));
    }
    onClick(trackId);
  }, [tracks, onClick]);

  // Track mouse for custom cursor - use direct DOM manipulation to avoid re-renders
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (cursorRef.current) {
        cursorRef.current.style.left = `${e.clientX}px`;
        cursorRef.current.style.top = `${e.clientY}px`;
      }
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  // Limit tracks for performance and filter out tracks without artwork
  const limitedTracks = useMemo(() => {
    return tracks.filter(t => t.artwork_url).slice(0, 500);
  }, [tracks]);

  return (
    <div style={{ width: '100%', height: '100%', cursor: 'none' }}>
      {/* Custom circle cursor - positioned via ref to avoid re-renders */}
      <div
        ref={cursorRef}
        style={{
          position: 'fixed',
          left: 0,
          top: 0,
          width: '24px',
          height: '24px',
          border: '2px solid #000',
          borderRadius: '50%',
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
          zIndex: 9999,
          transition: 'width 0.1s, height 0.1s',
        }}
      />

      <Canvas
        camera={{ fov: 60, near: 1, far: 5000 }}
        style={{ background: 'white' }}
      >
        <ambientLight intensity={1} />

        <CameraController isReady={isReady} focusPosition={focusPosition} />

        <BillboardTiles
          tracks={limitedTracks}
          activeTrackId={activeTrackId}
          hoveredTrackId={hoveredTrackId}
          onHoverStart={handleHoverStart}
          onHoverEnd={handleHoverEnd}
          onClick={handleClick}
        />
      </Canvas>
    </div>
  );
}
