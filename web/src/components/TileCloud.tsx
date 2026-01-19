import { useRef, useMemo, useState, useCallback, useEffect } from 'react';
import * as THREE from 'three';
import type { Track } from '../types';

interface Position3D {
  id: number;
  x: number;
  y: number;
  z: number;
}

interface Props {
  tracks: Track[];
  activeTrackId: number | null;
  onHoverStart: (trackId: number) => void;
  onHoverEnd: () => void;
  onClick: (trackId: number) => void;
}

const TILE_SIZE = 16;
const HOVER_SCALE = 1.5;
const SPACE_SIZE = 600; // -600 to +600 on each axis (more spread out)

function getSmallArtworkUrl(url: string | null): string | null {
  if (!url) return null;
  return url.replace(/-large\./, '-t50x50.').replace(/-t\d+x\d+\./, '-t50x50.');
}

// Seeded random for consistent positions
function seededRandom(seed: number) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function generate3DPositions(tracks: Track[]): Position3D[] {
  return tracks.map(track => {
    const seed = track.id;
    return {
      id: track.id,
      x: (seededRandom(seed) - 0.5) * 2 * SPACE_SIZE,
      y: (seededRandom(seed * 2) - 0.5) * 2 * SPACE_SIZE,
      z: (seededRandom(seed * 3) - 0.5) * 2 * SPACE_SIZE,
    };
  });
}

// Individual tile component
function Tile({
  track,
  position,
  isActive,
  isHovered,
  onHoverStart,
  onHoverEnd,
  onClick,
}: {
  track: Track;
  position: Position3D;
  isActive: boolean;
  isHovered: boolean;
  onHoverStart: () => void;
  onHoverEnd: () => void;
  onClick: () => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);
  const [texture, setTexture] = useState<THREE.Texture | null>(null);

  // Force material update when texture changes
  useEffect(() => {
    if (materialRef.current && texture) {
      materialRef.current.map = texture;
      materialRef.current.needsUpdate = true;
    }
  }, [texture]);

  // Load texture
  useEffect(() => {
    const artworkUrl = getSmallArtworkUrl(track.artwork_url);
    if (!artworkUrl) return;

    let cancelled = false;
    const loader = new THREE.TextureLoader();

    loader.load(
      artworkUrl,
      (tex) => {
        if (!cancelled) {
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.needsUpdate = true;
          setTexture(tex);
        }
      },
      undefined,
      (err) => {
        // Error loading texture - keep placeholder
        console.warn('Failed to load texture:', artworkUrl, err);
      }
    );

    return () => {
      cancelled = true;
    };
  }, [track.artwork_url]);

  const scale = isHovered || isActive ? HOVER_SCALE : 1;

  return (
    <mesh
      ref={meshRef}
      position={[position.x, position.y, position.z]}
      scale={[scale, scale, scale]}
      onPointerOver={(e) => {
        e.stopPropagation();
        console.log('Hover tile:', {
          id: track.id,
          title: track.title,
          artwork_url: track.artwork_url,
          small_url: getSmallArtworkUrl(track.artwork_url),
          hasTexture: !!texture,
          textureImage: texture?.image,
          imageComplete: texture?.image?.complete,
          imageWidth: texture?.image?.naturalWidth,
          imageHeight: texture?.image?.naturalHeight,
          position: { x: position.x, y: position.y, z: position.z },
        });
        onHoverStart();
      }}
      onPointerOut={(e) => {
        e.stopPropagation();
        onHoverEnd();
      }}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <planeGeometry args={[TILE_SIZE, TILE_SIZE]} />
      <meshBasicMaterial
        ref={materialRef}
        color={texture ? 0xffffff : 0x333333}
        map={texture}
        side={THREE.DoubleSide}
        toneMapped={false}
      />
      {isActive && (
        <lineSegments>
          <edgesGeometry args={[new THREE.PlaneGeometry(TILE_SIZE, TILE_SIZE)]} />
          <lineBasicMaterial color="#ff0000" linewidth={2} />
        </lineSegments>
      )}
    </mesh>
  );
}

export function TileCloud({
  tracks,
  activeTrackId,
  onHoverStart,
  onHoverEnd,
  onClick,
}: Props) {
  const [hoveredId, setHoveredId] = useState<number | null>(null);

  // Generate 3D positions
  const positions = useMemo(() => generate3DPositions(tracks), [tracks]);

  // Create a map for quick position lookup
  const positionMap = useMemo(() => {
    const map = new Map<number, Position3D>();
    positions.forEach(pos => map.set(pos.id, pos));
    return map;
  }, [positions]);

  const handleHoverStart = useCallback((trackId: number) => {
    setHoveredId(trackId);
    onHoverStart(trackId);
  }, [onHoverStart]);

  const handleHoverEnd = useCallback(() => {
    setHoveredId(null);
    onHoverEnd();
  }, [onHoverEnd]);

  const handleClick = useCallback((trackId: number) => {
    onClick(trackId);
  }, [onClick]);

  return (
    <group>
      {tracks.map(track => {
        const pos = positionMap.get(track.id);
        if (!pos) return null;

        return (
          <Tile
            key={track.id}
            track={track}
            position={pos}
            isActive={track.id === activeTrackId}
            isHovered={track.id === hoveredId}
            onHoverStart={() => handleHoverStart(track.id)}
            onHoverEnd={handleHoverEnd}
            onClick={() => handleClick(track.id)}
          />
        );
      })}
    </group>
  );
}
