import { useEffect, useRef, useState, useCallback } from "react";
import {
  Application,
  Container,
  Sprite,
  Graphics,
  Texture,
  Assets,
  Text,
  TextStyle,
} from "pixi.js";
import { Viewport } from "pixi-viewport";
import type {
  Track,
  CircleTilePosition,
  GenreComboNode,
  GenreEdge,
  CircleGraphLayout,
} from "../types";

const TILE_SIZE = 40;
const TILE_GAP = 4;
const RING_GAP = 4;
const CIRCLE_PADDING = 40;
const SECTION_PADDING = 20;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5.0;
const MODAL_ANIMATION_DURATION = 300;
const MODAL_PADDING = 40;
// Cursor SVG data URLs
const CURSOR_DEFAULT = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Ccircle cx='16' cy='16' r='14' fill='none' stroke='black' stroke-width='2'/%3E%3C/svg%3E") 16 16, auto`;
const CURSOR_ZOOM_IN = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Ccircle cx='16' cy='16' r='14' fill='none' stroke='black' stroke-width='2'/%3E%3Cline x1='10' y1='16' x2='22' y2='16' stroke='black' stroke-width='2'/%3E%3Cline x1='16' y1='10' x2='16' y2='22' stroke='black' stroke-width='2'/%3E%3C/svg%3E") 16 16, auto`;
const CURSOR_ZOOM_OUT = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Ccircle cx='16' cy='16' r='14' fill='none' stroke='black' stroke-width='2'/%3E%3Cline x1='10' y1='16' x2='22' y2='16' stroke='black' stroke-width='2'/%3E%3C/svg%3E") 16 16, auto`;
const CURSOR_ARROW_LEFT = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Ccircle cx='16' cy='16' r='14' fill='none' stroke='black' stroke-width='2'/%3E%3Cline x1='9' y1='16' x2='23' y2='16' stroke='black' stroke-width='2'/%3E%3Cpath d='M9 16 L14 11 M9 16 L14 21' stroke='black' stroke-width='2' fill='none'/%3E%3C/svg%3E") 16 16, auto`;
const CURSOR_ARROW_RIGHT = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Ccircle cx='16' cy='16' r='14' fill='none' stroke='black' stroke-width='2'/%3E%3Cline x1='9' y1='16' x2='23' y2='16' stroke='black' stroke-width='2'/%3E%3Cpath d='M23 16 L18 11 M23 16 L18 21' stroke='black' stroke-width='2' fill='none'/%3E%3C/svg%3E") 16 16, auto`;
const CURSOR_ARROW_UP = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Ccircle cx='16' cy='16' r='14' fill='none' stroke='black' stroke-width='2'/%3E%3Cline x1='16' y1='9' x2='16' y2='23' stroke='black' stroke-width='2'/%3E%3Cpath d='M16 9 L11 14 M16 9 L21 14' stroke='black' stroke-width='2' fill='none'/%3E%3C/svg%3E") 16 16, auto`;
const CURSOR_ARROW_DOWN = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Ccircle cx='16' cy='16' r='14' fill='none' stroke='black' stroke-width='2'/%3E%3Cline x1='16' y1='9' x2='16' y2='23' stroke='black' stroke-width='2'/%3E%3Cpath d='M16 23 L11 18 M16 23 L21 18' stroke='black' stroke-width='2' fill='none'/%3E%3C/svg%3E") 16 16, auto`;

function getArtworkUrl(url: string | null, size: "small" | "large"): string {
  if (!url) return "";
  const sizeStr = size === "small" ? "t200x200" : "t500x500";
  return url
    .replace(/-large\./, `-${sizeStr}.`)
    .replace(/-t\d+x\d+\./, `-${sizeStr}.`);
}

// --- Genre Combo Grouping ---

const MAX_GENRES_PER_TRACK = 2;
const MIN_COMBO_TRACKS = 5;

/** Count how often each genre appears across all tracks. */
function buildGenreFrequency(tracks: Track[]): Map<string, number> {
  const freq = new Map<string, number>();
  for (const track of tracks) {
    if (!track.nts_genres) continue;
    for (const g of track.nts_genres) {
      const key = g.toLowerCase();
      freq.set(key, (freq.get(key) ?? 0) + 1);
    }
  }
  return freq;
}

/**
 * Pick the top N genres for a track by global frequency.
 * Returns sorted array for deterministic combo keys.
 */
function pickTopGenres(
  genres: string[] | null,
  freq: Map<string, number>,
  maxGenres: number,
): string[] {
  if (!genres || genres.length === 0) return [];
  const normalized = genres.map((g) => g.toLowerCase());
  if (normalized.length <= maxGenres) return normalized.sort();
  // Sort by frequency descending, then alphabetically for ties
  const sorted = [...normalized].sort((a, b) => {
    const diff = (freq.get(b) ?? 0) - (freq.get(a) ?? 0);
    return diff !== 0 ? diff : a.localeCompare(b);
  });
  return sorted.slice(0, maxGenres).sort();
}

/**
 * Group tracks by their top-2 genre combo.
 * Combos with fewer than minTracks get folded into "other".
 */
function groupTracksByTopGenres(
  tracks: Track[],
  minTracks: number,
): Map<string, { tracks: Track[]; genres: string[] }> {
  const freq = buildGenreFrequency(tracks);

  // First pass: group by top-2 combo key
  const rawGroups = new Map<string, { tracks: Track[]; genres: string[] }>();
  for (const track of tracks) {
    const topGenres = pickTopGenres(
      track.nts_genres,
      freq,
      MAX_GENRES_PER_TRACK,
    );
    const key = topGenres.length > 0 ? topGenres.join("/") : "uncategorized";
    if (!rawGroups.has(key)) {
      rawGroups.set(key, { tracks: [], genres: topGenres });
    }
    rawGroups.get(key)!.tracks.push(track);
  }

  // Second pass: fold small combos into "other"
  const result = new Map<string, { tracks: Track[]; genres: string[] }>();
  for (const [key, group] of rawGroups) {
    if (group.tracks.length >= minTracks) {
      result.set(key, group);
    } else {
      if (!result.has("other")) {
        result.set("other", { tracks: [], genres: [] });
      }
      result.get("other")!.tracks.push(...group.tracks);
    }
  }

  return result;
}

// --- Circular Tile Arrangement ---

function calculateCircularTilePositions(
  tracks: Track[],
  comboKey: string,
): { positions: CircleTilePosition[]; radius: number } {
  const positions: CircleTilePosition[] = [];
  const cellSize = TILE_SIZE + TILE_GAP;

  if (tracks.length === 0) {
    return { positions, radius: 0 };
  }

  // Ring 0: center tile
  let placed = 0;

  // Place center tile
  positions.push({
    trackId: tracks[0].id,
    comboKey,
    x: -TILE_SIZE / 2,
    y: -TILE_SIZE / 2,
    ring: 0,
    angleIndex: 0,
  });
  placed = 1;

  let ring = 1;
  let outerRadius = 0;

  while (placed < tracks.length) {
    const ringRadius = ring * (cellSize + RING_GAP);
    const circumference = 2 * Math.PI * ringRadius;
    const capacity = Math.max(6, Math.floor(circumference / cellSize));
    const toPlace = Math.min(capacity, tracks.length - placed);

    for (let i = 0; i < toPlace; i++) {
      const angle = (2 * Math.PI * i) / capacity;
      const cx = Math.cos(angle) * ringRadius - TILE_SIZE / 2;
      const cy = Math.sin(angle) * ringRadius - TILE_SIZE / 2;

      positions.push({
        trackId: tracks[placed].id,
        comboKey,
        x: cx,
        y: cy,
        ring,
        angleIndex: i,
      });
      placed++;
    }

    outerRadius = ringRadius + TILE_SIZE / 2;
    ring++;
  }

  // For a single tile, give it a small radius
  if (tracks.length === 1) {
    outerRadius = TILE_SIZE / 2;
  }

  return { positions, radius: outerRadius };
}

// --- Edge Computation ---

function computeGenreEdges(nodes: GenreComboNode[]): GenreEdge[] {
  const genreIndex = new Map<string, string[]>();
  for (const node of nodes) {
    for (const genre of node.genres) {
      if (!genreIndex.has(genre)) {
        genreIndex.set(genre, []);
      }
      genreIndex.get(genre)!.push(node.key);
    }
  }

  const edgeMap = new Map<string, Set<string>>();
  for (const [genre, nodeKeys] of genreIndex) {
    for (let i = 0; i < nodeKeys.length; i++) {
      for (let j = i + 1; j < nodeKeys.length; j++) {
        const a = nodeKeys[i];
        const b = nodeKeys[j];
        const edgeKey = a < b ? `${a}|${b}` : `${b}|${a}`;
        if (!edgeMap.has(edgeKey)) {
          edgeMap.set(edgeKey, new Set());
        }
        edgeMap.get(edgeKey)!.add(genre);
      }
    }
  }

  const edges: GenreEdge[] = [];
  for (const [edgeKey, sharedGenres] of edgeMap) {
    const [sourceKey, targetKey] = edgeKey.split("|");
    edges.push({
      sourceKey,
      targetKey,
      sharedGenres: Array.from(sharedGenres),
    });
  }

  return edges;
}

// --- Row-based Strip Packing Layout ---

/**
 * Pack circles into a rectangular area using row-based strip packing.
 * Places circles left-to-right, wrapping to new rows like text.
 * Nodes must be sorted by radius descending.
 */
function packCircles(nodes: GenreComboNode[]): void {
  if (nodes.length === 0) return;

  const pad = CIRCLE_PADDING;

  // Estimate total area to determine target width (~16:10 aspect ratio)
  let totalArea = 0;
  for (const node of nodes) {
    const d = (node.radius + pad) * 2;
    totalArea += d * d;
  }
  const targetWidth = Math.sqrt(totalArea * 1.6);

  // Place circles in rows, left to right
  let cursorX = pad;
  let cursorY = pad;
  let rowHeight = 0;

  for (const node of nodes) {
    const diameter = node.radius * 2 + pad;

    // If this circle won't fit in the current row, start a new row
    if (cursorX + diameter > targetWidth && cursorX > pad) {
      cursorX = pad;
      cursorY += rowHeight + pad;
      rowHeight = 0;
    }

    node.cx = cursorX + node.radius;
    node.cy = cursorY + node.radius;

    cursorX += diameter + pad;
    rowHeight = Math.max(rowHeight, diameter);
  }
}

// --- Orchestration ---

function calculateCircleGraphLayout(tracks: Track[]): CircleGraphLayout {
  const comboGroups = groupTracksByTopGenres(tracks, MIN_COMBO_TRACKS);
  const tileSize = TILE_SIZE;

  // Create nodes with circular tile positions
  const nodes: GenreComboNode[] = [];
  for (const [key, { tracks: groupTracks, genres }] of comboGroups) {
    const displayLabel =
      key === "other" || key === "uncategorized" ? key : genres.join(" / ");
    const { positions, radius } = calculateCircularTilePositions(
      groupTracks,
      key,
    );

    nodes.push({
      key,
      genres,
      displayLabel,
      tracks: groupTracks,
      tilePositions: positions,
      radius,
      cx: 0,
      cy: 0,
    });
  }

  // Sort by size descending (packCircles expects this order)
  nodes.sort((a, b) => b.tracks.length - a.tracks.length);

  // Compute edges from shared genres
  const edges = computeGenreEdges(nodes);

  // Run circle packing layout
  packCircles(nodes);

  // Build nodeMap and compute total dimensions
  const nodeMap = new Map<string, GenreComboNode>();
  let maxX = 0,
    maxY = 0;
  for (const node of nodes) {
    nodeMap.set(node.key, node);
    maxX = Math.max(maxX, node.cx + node.radius + CIRCLE_PADDING);
    maxY = Math.max(maxY, node.cy + node.radius + CIRCLE_PADDING);
  }

  return {
    nodes,
    edges,
    nodeMap,
    totalWidth: maxX,
    totalHeight: maxY,
    tileSize,
  };
}

// --- Component ---

interface TileCanvasProps {
  tracks: Track[];
  activeTrack: Track | null;
  previewTrack: Track | null;
  onHover: (track: Track) => void;
  onHoverEnd: () => void;
  onClick: (track: Track) => void;
  onSectionChange?: (section: GenreComboNode | null) => void;
}

export function TileCanvas({
  tracks,
  activeTrack,
  previewTrack,
  onHover,
  onHoverEnd,
  onClick,
  onSectionChange,
}: TileCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const viewportRef = useRef<Viewport | null>(null);
  const tilesRef = useRef<
    Map<
      number,
      {
        sprite: Sprite;
        outline: Graphics;
        genreComboNode: GenreComboNode;
      }
    >
  >(new Map());
  const circleGraphLayoutRef = useRef<CircleGraphLayout | null>(null);
  const activeTrackRef = useRef<Track | null>(null);
  const previewTrackRef = useRef<Track | null>(null);
  const modalContainerRef = useRef<Container | null>(null);
  const modalHitAreaRef = useRef<Graphics | null>(null);
  const edgesGraphicsRef = useRef<Graphics | null>(null);
  const highlightEdgesRef = useRef<Graphics | null>(null);

  const [containerSize, setContainerSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [cursor, setCursor] = useState(CURSOR_DEFAULT);
  const [expandedSection, setExpandedSection] = useState<GenreComboNode | null>(
    null,
  );
  const expandedSectionRef = useRef<GenreComboNode | null>(null);
  const isAnimatingRef = useRef(false);
  const cursorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDraggingRef = useRef<boolean>(false);
  const lastMousePosRef = useRef<{ x: number; y: number } | null>(null);
  const onSectionChangeRef = useRef(onSectionChange);
  const onHoverRef = useRef(onHover);
  const onHoverEndRef = useRef(onHoverEnd);
  const onClickRef = useRef(onClick);
  const openCircleModalRef = useRef<((node: GenreComboNode) => void) | null>(
    null,
  );
  const closeSectionModalRef = useRef<(() => void) | null>(null);
  const modalTilesRef = useRef<
    Map<number, { sprite: Sprite; outline: Graphics }>
  >(new Map());

  // Keep refs in sync
  activeTrackRef.current = activeTrack;
  previewTrackRef.current = previewTrack;
  expandedSectionRef.current = expandedSection;
  onSectionChangeRef.current = onSectionChange;
  onHoverRef.current = onHover;
  onHoverEndRef.current = onHoverEnd;
  onClickRef.current = onClick;

  // Open a circle node as a modal popup
  const openCircleModal = useCallback((node: GenreComboNode) => {
    const app = appRef.current;
    const container = containerRef.current;
    const layout = circleGraphLayoutRef.current;
    if (!app || !container || !layout || isAnimatingRef.current) return;

    isAnimatingRef.current = true;

    const screenWidth = container.clientWidth;
    const screenHeight = container.clientHeight;

    // Create modal layer if it doesn't exist
    if (!modalContainerRef.current) {
      const modalLayer = new Container();
      modalLayer.zIndex = 1000;
      app.stage.addChild(modalLayer);
      modalContainerRef.current = modalLayer;
    }

    const modalLayer = modalContainerRef.current;
    modalLayer.removeChildren();
    modalTilesRef.current.clear();

    // Create invisible hit area to detect clicks outside the section
    const hitArea = new Graphics();
    hitArea.rect(0, 0, screenWidth, screenHeight);
    hitArea.fill({ color: 0x000000, alpha: 0.001 });
    hitArea.eventMode = "static";
    hitArea.cursor = "default";
    hitArea.on("pointertap", () => {
      closeSectionModalRef.current?.();
    });
    modalLayer.addChild(hitArea);
    modalHitAreaRef.current = hitArea;

    // Calculate target size to fit ~80% of screen with padding
    const maxWidth = screenWidth - MODAL_PADDING * 2;
    const maxHeight = screenHeight - MODAL_PADDING * 2;

    // Calculate optimal cols/rows for expanded view (rectangular grid in modal)
    const expandedTileSize = TILE_SIZE * 2;
    const expandedGap = TILE_GAP * 2;

    const availableWidth = maxWidth - SECTION_PADDING * 2;
    const expandedCols = Math.max(
      2,
      Math.floor(
        (availableWidth + expandedGap) / (expandedTileSize + expandedGap),
      ),
    );
    const expandedRows = Math.ceil(node.tracks.length / expandedCols);

    const sectionWidth =
      expandedCols * (expandedTileSize + expandedGap) -
      expandedGap +
      SECTION_PADDING * 2;
    const sectionHeight =
      expandedRows * (expandedTileSize + expandedGap) -
      expandedGap +
      SECTION_PADDING * 2 +
      40;

    const scaleX = maxWidth / sectionWidth;
    const scaleY = maxHeight / sectionHeight;
    const targetScale = Math.min(scaleX, scaleY, 1);

    const finalWidth = sectionWidth * targetScale;
    const finalHeight = sectionHeight * targetScale;

    // Create expanded section container
    const expandedContainer = new Container();
    expandedContainer.eventMode = "static";
    expandedContainer.on("pointertap", (e) => {
      e.stopPropagation();
    });

    const targetX = (screenWidth - finalWidth) / 2;
    const targetY = (screenHeight - finalHeight) / 2;

    const viewport = viewportRef.current;
    if (!viewport) {
      isAnimatingRef.current = false;
      return;
    }

    // Section background
    const bg = new Graphics();
    bg.rect(0, 0, sectionWidth, sectionHeight);
    bg.fill({ color: 0xffffff });
    bg.stroke({ width: 2, color: 0x000000 });
    expandedContainer.addChild(bg);

    // Genre label
    const labelStyle = new TextStyle({
      fontFamily: "Arial, sans-serif",
      fontSize: 40,
      fill: 0x666666,
      fontWeight: "bold",
    });
    const label = new Text({ text: node.displayLabel, style: labelStyle });
    label.position.set(SECTION_PADDING, 10);
    expandedContainer.addChild(label);

    // Create tiles in rectangular grid
    for (let i = 0; i < node.tracks.length; i++) {
      const track = node.tracks[i];
      const col = i % expandedCols;
      const row = Math.floor(i / expandedCols);

      const tileX = SECTION_PADDING + col * (expandedTileSize + expandedGap);
      const tileY =
        SECTION_PADDING + 50 + row * (expandedTileSize + expandedGap);

      const outline = new Graphics();
      outline.rect(-3, -3, expandedTileSize + 6, expandedTileSize + 6);
      outline.stroke({ width: 2, color: 0x000000 });
      outline.position.set(tileX, tileY);
      outline.visible = false;
      expandedContainer.addChild(outline);

      const sprite = new Sprite(Texture.WHITE);
      sprite.width = expandedTileSize;
      sprite.height = expandedTileSize;
      sprite.position.set(tileX, tileY);
      sprite.tint = 0xcccccc;
      sprite.eventMode = "static";
      sprite.cursor = "pointer";

      const artworkUrl = getArtworkUrl(track.artwork_url, "small");
      if (artworkUrl) {
        Assets.load<Texture>(artworkUrl)
          .then((texture) => {
            sprite.texture = texture;
            sprite.tint = 0xffffff;
          })
          .catch(() => {});
      }

      modalTilesRef.current.set(track.id, { sprite, outline });

      sprite.on("pointerenter", () => {
        onHoverRef.current(track);
      });

      sprite.on("pointerleave", () => {
        onHoverEndRef.current();
      });

      sprite.on("pointertap", (e) => {
        e.stopPropagation();
        onClickRef.current(track);
      });

      expandedContainer.addChild(sprite);
    }

    // Animate scale and position
    expandedContainer.scale.set(0.3);
    expandedContainer.position.set(screenWidth / 2, screenHeight / 2);
    expandedContainer.pivot.set(sectionWidth / 2, sectionHeight / 2);

    modalLayer.addChild(expandedContainer);

    const startTime = performance.now();
    const startScale = 0.3;
    const endScale = targetScale;
    const startX = screenWidth / 2;
    const startY = screenHeight / 2;
    const endX = targetX + finalWidth / 2;
    const endY = targetY + finalHeight / 2;

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / MODAL_ANIMATION_DURATION, 1);
      const eased = 1 - Math.pow(1 - progress, 3);

      const currentScale = startScale + (endScale - startScale) * eased;
      const currentX = startX + (endX - startX) * eased;
      const currentY = startY + (endY - startY) * eased;

      expandedContainer.scale.set(currentScale);
      expandedContainer.position.set(currentX, currentY);

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        isAnimatingRef.current = false;
        setExpandedSection(node);
        onSectionChangeRef.current?.(node);
        updateModalTileAppearances();
      }
    };

    requestAnimationFrame(animate);
  }, []);

  openCircleModalRef.current = openCircleModal;

  // Close the modal popup
  const closeSectionModal = useCallback(() => {
    const modalLayer = modalContainerRef.current;
    if (!modalLayer || isAnimatingRef.current) return;

    isAnimatingRef.current = true;

    const expandedContainer = modalLayer.children[
      modalLayer.children.length - 1
    ] as Container;
    if (!expandedContainer) {
      isAnimatingRef.current = false;
      return;
    }

    const startTime = performance.now();
    const startScale = expandedContainer.scale.x;
    const startAlpha = 1;

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / (MODAL_ANIMATION_DURATION * 0.7), 1);
      const eased = progress * progress * progress;

      const currentScale = startScale * (1 - eased * 0.3);
      const currentAlpha = startAlpha * (1 - eased);

      expandedContainer.scale.set(currentScale);
      expandedContainer.alpha = currentAlpha;

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        modalLayer.removeChildren();
        modalTilesRef.current.clear();
        isAnimatingRef.current = false;
        setExpandedSection(null);
        onSectionChangeRef.current?.(null);
        onHoverEndRef.current();
      }
    };

    requestAnimationFrame(animate);
  }, []);

  closeSectionModalRef.current = closeSectionModal;

  // Update modal tile appearances
  const updateModalTileAppearances = useCallback(() => {
    const active = activeTrackRef.current;
    const preview = previewTrackRef.current;

    modalTilesRef.current.forEach((tile, trackId) => {
      tile.outline.visible = false;

      if (
        active &&
        trackId === active.id &&
        (!preview || preview.id !== active.id)
      ) {
        tile.outline.visible = true;
        tile.outline.clear();
        tile.outline.rect(
          -3,
          -3,
          tile.sprite.width + 6,
          tile.sprite.height + 6,
        );
        tile.outline.stroke({ width: 2, color: 0x000000 });
      }

      if (preview && trackId === preview.id) {
        tile.outline.visible = true;
        tile.outline.clear();
        tile.outline.rect(
          -3,
          -3,
          tile.sprite.width + 6,
          tile.sprite.height + 6,
        );
        tile.outline.stroke({ width: 2, color: 0xff0000 });
      }
    });
  }, []);

  // Handle Escape key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && expandedSectionRef.current) {
        closeSectionModal();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeSectionModal]);

  // Wheel event for zoom cursor
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (isDraggingRef.current) return;

      if (cursorTimeoutRef.current) {
        clearTimeout(cursorTimeoutRef.current);
      }

      if (e.deltaY < 0) {
        setCursor(CURSOR_ZOOM_IN);
      } else if (e.deltaY > 0) {
        setCursor(CURSOR_ZOOM_OUT);
      }

      cursorTimeoutRef.current = setTimeout(() => {
        setCursor(CURSOR_DEFAULT);
      }, 150);
    };

    container.addEventListener("wheel", handleWheel);

    return () => {
      container.removeEventListener("wheel", handleWheel);
      if (cursorTimeoutRef.current) {
        clearTimeout(cursorTimeoutRef.current);
      }
    };
  }, []);

  // Drag events for directional cursor
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleMouseDown = (e: MouseEvent) => {
      isDraggingRef.current = true;
      lastMousePosRef.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current || !lastMousePosRef.current) return;

      const deltaX = e.clientX - lastMousePosRef.current.x;
      const deltaY = e.clientY - lastMousePosRef.current.y;

      if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) {
        if (Math.abs(deltaX) > Math.abs(deltaY)) {
          setCursor(deltaX > 0 ? CURSOR_ARROW_LEFT : CURSOR_ARROW_RIGHT);
        } else {
          setCursor(deltaY > 0 ? CURSOR_ARROW_UP : CURSOR_ARROW_DOWN);
        }
        lastMousePosRef.current = { x: e.clientX, y: e.clientY };
      }
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      lastMousePosRef.current = null;
      setCursor(CURSOR_DEFAULT);
    };

    container.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      container.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  // Update tile appearance helper
  const updateTileAppearance = useCallback(
    (
      tile: {
        sprite: Sprite;
        outline: Graphics;
        genreComboNode: GenreComboNode;
      },
      scale: number,
      showOutline: boolean,
      outlineColor: number,
    ) => {
      const layout = circleGraphLayoutRef.current;
      if (!layout) return;

      const baseSize = layout.tileSize;
      const newSize = baseSize * scale;
      tile.sprite.width = newSize;
      tile.sprite.height = newSize;
      tile.outline.visible = showOutline;

      if (showOutline) {
        tile.outline.clear();
        tile.outline.rect(-3, -3, newSize + 6, newSize + 6);
        tile.outline.stroke({ width: 2, color: outlineColor });
      }
    },
    [],
  );

  // Draw highlighted edges for a given node
  const drawHighlightEdges = useCallback((nodeKey: string) => {
    const layout = circleGraphLayoutRef.current;
    const highlight = highlightEdgesRef.current;
    if (!layout || !highlight) return;

    highlight.clear();

    const node = layout.nodeMap.get(nodeKey);
    if (!node) return;

    for (const edge of layout.edges) {
      if (edge.sourceKey !== nodeKey && edge.targetKey !== nodeKey) continue;

      const source = layout.nodeMap.get(edge.sourceKey);
      const target = layout.nodeMap.get(edge.targetKey);
      if (!source || !target) continue;

      const alpha = Math.min(0.8, 0.3 + edge.sharedGenres.length * 0.15);
      highlight.moveTo(source.cx, source.cy);
      highlight.lineTo(target.cx, target.cy);
      highlight.stroke({ width: 2, color: 0x000000, alpha });
    }
  }, []);

  const clearHighlightEdges = useCallback(() => {
    const highlight = highlightEdgesRef.current;
    if (highlight) {
      highlight.clear();
    }
  }, []);

  // Update active/preview track highlighting
  useEffect(() => {
    const layout = circleGraphLayoutRef.current;
    if (!layout) return;

    // Reset all tiles
    tilesRef.current.forEach((tile) => {
      updateTileAppearance(tile, 1, false, 0x000000);
    });

    // Active track (if not preview)
    if (activeTrack && (!previewTrack || previewTrack.id !== activeTrack.id)) {
      const tile = tilesRef.current.get(activeTrack.id);
      if (tile) {
        updateTileAppearance(tile, 2, true, 0x000000);
      }
    }

    // Preview track (takes precedence)
    if (previewTrack) {
      const tile = tilesRef.current.get(previewTrack.id);
      if (tile) {
        updateTileAppearance(tile, 2, true, 0xff0000);
      }
    }

    // Also update modal tiles if modal is open
    if (expandedSection) {
      updateModalTileAppearances();
    }
  }, [
    activeTrack,
    previewTrack,
    updateTileAppearance,
    expandedSection,
    updateModalTileAppearances,
  ]);

  // ResizeObserver to track container size changes
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setContainerSize((prev) => {
          if (
            !prev ||
            Math.abs(prev.width - width) > 1 ||
            Math.abs(prev.height - height) > 1
          ) {
            return { width, height };
          }
          return prev;
        });
      }
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, []);

  // Main initialization effect
  useEffect(() => {
    console.log(
      "[TileCanvas] Effect triggered, tracks:",
      tracks.length,
      "containerSize:",
      containerSize,
    );
    if (!containerRef.current || tracks.length === 0 || !containerSize) {
      console.log(
        "[TileCanvas] Skipping init - container:",
        !!containerRef.current,
        "tracks:",
        tracks.length,
        "containerSize:",
        containerSize,
      );
      return;
    }

    const container = containerRef.current;
    let isCleanedUp = false;

    async function init() {
      console.log("[TileCanvas] Initializing PixiJS...");
      const app = new Application();
      await app.init({
        background: "#ffffff",
        width: container.clientWidth,
        height: container.clientHeight,
        antialias: true,
      });

      if (isCleanedUp) {
        app.destroy(true, { children: true });
        return;
      }

      container.appendChild(app.canvas);
      appRef.current = app;

      const screenWidth = container.clientWidth;
      const screenHeight = container.clientHeight;

      // Calculate circle graph layout
      const layout = calculateCircleGraphLayout(tracks);
      circleGraphLayoutRef.current = layout;

      console.log(
        "[TileCanvas] Layout calculated:",
        layout.nodes.length,
        "genre combo nodes,",
        layout.edges.length,
        "edges",
      );

      const viewport = new Viewport({
        screenWidth,
        screenHeight,
        worldWidth: layout.totalWidth,
        worldHeight: layout.totalHeight,
        events: app.renderer.events,
      });

      app.stage.addChild(viewport);
      viewportRef.current = viewport;

      viewport
        .drag()
        .pinch()
        .wheel()
        .clampZoom({ minScale: MIN_ZOOM, maxScale: MAX_ZOOM });

      // Layer 1: Edge lines (bottom)
      const edgesGfx = new Graphics();
      for (const edge of layout.edges) {
        const source = layout.nodeMap.get(edge.sourceKey);
        const target = layout.nodeMap.get(edge.targetKey);
        if (!source || !target) continue;

        const alpha = Math.min(0.5, 0.15 + edge.sharedGenres.length * 0.1);
        edgesGfx.moveTo(source.cx, source.cy);
        edgesGfx.lineTo(target.cx, target.cy);
        edgesGfx.stroke({ width: 2, color: 0x999999, alpha });
      }
      viewport.addChild(edgesGfx);
      edgesGraphicsRef.current = edgesGfx;

      // Layer 2: Circle outlines + labels
      const circlesContainer = new Container();
      for (const node of layout.nodes) {
        // Circle outline
        const circleGfx = new Graphics();
        circleGfx.circle(node.cx, node.cy, node.radius + TILE_SIZE / 2);
        circleGfx.stroke({ width: 10, color: 0xcccccc, alpha: 0.5 });
        circlesContainer.addChild(circleGfx);

        // Text label above circle
        const labelStyle = new TextStyle({
          fontFamily: "Arial, sans-serif",
          fontSize: 10,
          fill: 0x000000,
          fontWeight: "bold",
        });
        const label = new Text({ text: node.displayLabel, style: labelStyle });
        label.anchor.set(0.5, 1);
        label.position.set(node.cx, node.cy - node.radius - TILE_SIZE / 2 - 4);
        circlesContainer.addChild(label);
      }
      viewport.addChild(circlesContainer);

      // Layer 3: Tile sprites
      const tilesContainer = new Container();

      for (const node of layout.nodes) {
        for (const pos of node.tilePositions) {
          const track = node.tracks.find((t) => t.id === pos.trackId);
          if (!track) continue;

          const worldX = node.cx + pos.x;
          const worldY = node.cy + pos.y;

          // Outline
          const outline = new Graphics();
          outline.rect(-3, -3, layout.tileSize + 6, layout.tileSize + 6);
          outline.stroke({ width: 2, color: 0x000000 });
          outline.position.set(worldX, worldY);
          outline.visible = false;
          tilesContainer.addChild(outline);

          // Sprite
          const sprite = new Sprite(Texture.WHITE);
          sprite.width = layout.tileSize;
          sprite.height = layout.tileSize;
          sprite.position.set(worldX, worldY);
          sprite.tint = 0xcccccc;
          sprite.eventMode = "static";

          // Load artwork
          const artworkUrl = getArtworkUrl(track.artwork_url, "small");
          if (artworkUrl) {
            Assets.load<Texture>(artworkUrl)
              .then((texture) => {
                sprite.texture = texture;
                sprite.tint = 0xffffff;
              })
              .catch(() => {});
          }

          tilesRef.current.set(track.id, {
            sprite,
            outline,
            genreComboNode: node,
          });

          // Hover: highlight edges for this node's circle
          sprite.on("pointerenter", () => {
            drawHighlightEdges(node.key);
          });

          sprite.on("pointerleave", () => {
            clearHighlightEdges();
          });

          // Click: open modal for this circle's genre combo
          sprite.on("pointertap", () => {
            if (!expandedSectionRef.current && !isAnimatingRef.current) {
              openCircleModalRef.current?.(node);
            }
          });

          tilesContainer.addChild(sprite);
        }
      }
      viewport.addChild(tilesContainer);

      // Layer 4: Edge highlights (on hover) — on top
      const highlightGfx = new Graphics();
      viewport.addChild(highlightGfx);
      highlightEdgesRef.current = highlightGfx;

      // Initial viewport position - show overview
      const zoomX = screenWidth / layout.totalWidth;
      const zoomY = screenHeight / layout.totalHeight;
      const initialZoom = Math.max(Math.min(zoomX, zoomY) * 0.9, MIN_ZOOM);

      viewport.scale.set(initialZoom);
      viewport.moveCenter(layout.totalWidth / 2, layout.totalHeight / 2);

      console.log(
        "[TileCanvas] Created",
        tilesRef.current.size,
        "tiles in",
        layout.nodes.length,
        "circle groups",
      );
    }

    init();

    return () => {
      isCleanedUp = true;
      if (appRef.current) {
        appRef.current.destroy(true, { children: true });
        appRef.current = null;
      }
      tilesRef.current.clear();
      modalTilesRef.current.clear();
      modalContainerRef.current = null;
      circleGraphLayoutRef.current = null;
      edgesGraphicsRef.current = null;
      highlightEdgesRef.current = null;
      setExpandedSection(null);
    };
  }, [tracks, containerSize, drawHighlightEdges, clearHighlightEdges]);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        position: "absolute",
        top: 0,
        left: 0,
        cursor: cursor,
      }}
    />
  );
}
