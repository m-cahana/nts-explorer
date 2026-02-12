import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { computeGridLayout } from "../lib/genreLayout";
import type { Track, GenreGroup } from "../types";
import "./GenreLines.css";

// Custom cursor SVGs
const CURSOR_DEFAULT = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Ccircle cx='16' cy='16' r='14' fill='none' stroke='black' stroke-width='2'/%3E%3C/svg%3E") 16 16, auto`;
const CURSOR_ZOOM_IN = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Ccircle cx='16' cy='16' r='14' fill='none' stroke='black' stroke-width='2'/%3E%3Cline x1='10' y1='16' x2='22' y2='16' stroke='black' stroke-width='2'/%3E%3Cline x1='16' y1='10' x2='16' y2='22' stroke='black' stroke-width='2'/%3E%3C/svg%3E") 16 16, auto`;
const CURSOR_ZOOM_OUT = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Ccircle cx='16' cy='16' r='14' fill='none' stroke='black' stroke-width='2'/%3E%3Cline x1='10' y1='16' x2='22' y2='16' stroke='black' stroke-width='2'/%3E%3C/svg%3E") 16 16, auto`;
const CURSOR_ARROW_LEFT = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Ccircle cx='16' cy='16' r='14' fill='none' stroke='black' stroke-width='2'/%3E%3Cline x1='9' y1='16' x2='23' y2='16' stroke='black' stroke-width='2'/%3E%3Cpath d='M9 16 L14 11 M9 16 L14 21' stroke='black' stroke-width='2' fill='none'/%3E%3C/svg%3E") 16 16, auto`;
const CURSOR_ARROW_RIGHT = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Ccircle cx='16' cy='16' r='14' fill='none' stroke='black' stroke-width='2'/%3E%3Cline x1='9' y1='16' x2='23' y2='16' stroke='black' stroke-width='2'/%3E%3Cpath d='M23 16 L18 11 M23 16 L18 21' stroke='black' stroke-width='2' fill='none'/%3E%3C/svg%3E") 16 16, auto`;
const CURSOR_ARROW_UP = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Ccircle cx='16' cy='16' r='14' fill='none' stroke='black' stroke-width='2'/%3E%3Cline x1='16' y1='9' x2='16' y2='23' stroke='black' stroke-width='2'/%3E%3Cpath d='M16 9 L11 14 M16 9 L21 14' stroke='black' stroke-width='2' fill='none'/%3E%3C/svg%3E") 16 16, auto`;
const CURSOR_ARROW_DOWN = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Ccircle cx='16' cy='16' r='14' fill='none' stroke='black' stroke-width='2'/%3E%3Cline x1='16' y1='9' x2='16' y2='23' stroke='black' stroke-width='2'/%3E%3Cpath d='M16 23 L11 18 M16 23 L21 18' stroke='black' stroke-width='2' fill='none'/%3E%3C/svg%3E") 16 16, auto`;

const COL_GAP = 6;
const ROW_GAP = 6;
const GRID_PAD = 20;
const MIN_TILE_SIZE = 16;

function getArtworkUrl(url: string | null): string {
  if (!url) return "";
  return url
    .replace(/-large\./, "-t500x500.")
    .replace(/-t\d+x\d+\./, "-t500x500.");
}

// --- useZoomPan hook ---

interface Transform {
  scale: number;
  translateX: number;
  translateY: number;
}

interface ZoomPanResult extends Transform {
  cursor: string;
  wasRecentDrag: () => boolean;
}

function useZoomPan(
  viewportRef: React.RefObject<HTMLDivElement | null>,
  fitTransform: Transform | null,
  contentSize: { width: number; height: number } | null,
): ZoomPanResult {
  const [transform, setTransform] = useState<Transform>({
    scale: 1,
    translateX: 0,
    translateY: 0,
  });
  const [cursor, setCursor] = useState(CURSOR_DEFAULT);
  const transformRef = useRef(transform);
  transformRef.current = transform;
  const fitTransformRef = useRef(fitTransform);
  fitTransformRef.current = fitTransform;
  const contentSizeRef = useRef(contentSize);
  contentSizeRef.current = contentSize;

  // Clamp translation so the grid edges never pull past the viewport edges.
  // When the rendered grid is smaller than the viewport in a dimension, center it.
  const clamp = (t: Transform): Transform => {
    const el = viewportRef.current;
    const cs = contentSizeRef.current;
    if (!el || !cs) return t;

    const rect = el.getBoundingClientRect();
    const vw = rect.width;
    const vh = rect.height;
    const rw = cs.width * t.scale;
    const rh = cs.height * t.scale;

    let tx = t.translateX;
    let ty = t.translateY;

    if (rw <= vw) {
      tx = (vw - rw) / 2;
    } else {
      tx = Math.min(0, Math.max(vw - rw, tx));
    }

    if (rh <= vh) {
      ty = (vh - rh) / 2;
    } else {
      ty = Math.min(0, Math.max(vh - rh, ty));
    }

    return { scale: t.scale, translateX: tx, translateY: ty };
  };

  // Reset to fitTransform whenever it changes
  useEffect(() => {
    if (!fitTransform) return;
    transformRef.current = fitTransform;
    setTransform(fitTransform);
  }, [fitTransform]);

  const isPointerDown = useRef(false);
  const hasMoved = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const dragStartTranslate = useRef({ x: 0, y: 0 });
  const lastMovePos = useRef({ x: 0, y: 0 });
  const cursorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragEndTime = useRef(0);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (isPointerDown.current) return;

      const { scale, translateX, translateY } = transformRef.current;
      const minScale = fitTransformRef.current?.scale ?? 1;
      const factor = e.deltaY > 0 ? 0.95 : 1.05;
      const newScale = Math.min(15.0, Math.max(minScale, scale * factor));

      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;

      const next = clamp({
        scale: newScale,
        translateX: cx - (cx - translateX) * (newScale / scale),
        translateY: cy - (cy - translateY) * (newScale / scale),
      });
      transformRef.current = next;
      setTransform(next);

      setCursor(e.deltaY > 0 ? CURSOR_ZOOM_OUT : CURSOR_ZOOM_IN);
      if (cursorTimeoutRef.current) clearTimeout(cursorTimeoutRef.current);
      cursorTimeoutRef.current = setTimeout(
        () => setCursor(CURSOR_DEFAULT),
        150,
      );
    };

    const handlePointerDown = (e: PointerEvent) => {
      isPointerDown.current = true;
      hasMoved.current = false;
      dragStart.current = { x: e.clientX, y: e.clientY };
      lastMovePos.current = { x: e.clientX, y: e.clientY };
      dragStartTranslate.current = {
        x: transformRef.current.translateX,
        y: transformRef.current.translateY,
      };
      el.setPointerCapture(e.pointerId);
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (!isPointerDown.current) return;

      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;

      if (!hasMoved.current && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
        hasMoved.current = true;
      }

      if (hasMoved.current) {
        const next = clamp({
          ...transformRef.current,
          translateX: dragStartTranslate.current.x + dx,
          translateY: dragStartTranslate.current.y + dy,
        });
        transformRef.current = next;
        setTransform(next);

        const moveDx = e.clientX - lastMovePos.current.x;
        const moveDy = e.clientY - lastMovePos.current.y;
        if (Math.abs(moveDx) > 2 || Math.abs(moveDy) > 2) {
          if (Math.abs(moveDx) > Math.abs(moveDy)) {
            setCursor(moveDx > 0 ? CURSOR_ARROW_LEFT : CURSOR_ARROW_RIGHT);
          } else {
            setCursor(moveDy > 0 ? CURSOR_ARROW_UP : CURSOR_ARROW_DOWN);
          }
          lastMovePos.current = { x: e.clientX, y: e.clientY };
        }
      }
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (isPointerDown.current) {
        el.releasePointerCapture(e.pointerId);
        if (hasMoved.current) {
          dragEndTime.current = Date.now();
        }
      }
      isPointerDown.current = false;
      setCursor(CURSOR_DEFAULT);
    };

    el.addEventListener("wheel", handleWheel, { passive: false });
    el.addEventListener("pointerdown", handlePointerDown);
    el.addEventListener("pointermove", handlePointerMove);
    el.addEventListener("pointerup", handlePointerUp);

    return () => {
      el.removeEventListener("wheel", handleWheel);
      el.removeEventListener("pointerdown", handlePointerDown);
      el.removeEventListener("pointermove", handlePointerMove);
      el.removeEventListener("pointerup", handlePointerUp);
      if (cursorTimeoutRef.current) clearTimeout(cursorTimeoutRef.current);
    };
  }, [viewportRef]);

  const wasRecentDrag = useCallback(
    () => Date.now() - dragEndTime.current < 50,
    [],
  );

  return { ...transform, cursor, wasRecentDrag };
}

// --- TrackGrid sub-component ---

interface TrackGridProps {
  tracks: Track[];
  activeTrack: Track | null;
  previewTrack: Track | null;
  onHover: (track: Track) => void;
  onHoverEnd: () => void;
  onClick: (track: Track) => void;
}

function TrackGrid({
  tracks,
  activeTrack,
  previewTrack,
  onHover,
  onHoverEnd,
  onClick,
}: TrackGridProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState<{
    width: number;
    height: number;
  } | null>(null);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const ro = new ResizeObserver((entries) => {
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
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Binary search for largest tile size that fits all tracks in viewport
  const gridParams = useMemo(() => {
    if (!containerSize || tracks.length === 0) return null;
    const { width: cw, height: ch } = containerSize;
    const n = tracks.length;

    let lo = MIN_TILE_SIZE;
    let hi = Math.floor(cw / 2);

    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      const cols = Math.floor(
        (cw - 2 * GRID_PAD + COL_GAP) / (mid + COL_GAP),
      );
      if (cols < 1) {
        hi = mid - 1;
        continue;
      }
      const rows = Math.ceil(n / cols);
      const h = rows * mid + (rows - 1) * ROW_GAP + 2 * GRID_PAD;
      if (h <= ch) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }

    const tileSize = lo;
    const columns = Math.max(
      1,
      Math.floor((cw - 2 * GRID_PAD + COL_GAP) / (tileSize + COL_GAP)),
    );
    const rows = Math.ceil(n / columns);
    const gridWidth =
      columns * tileSize + (columns - 1) * COL_GAP + 2 * GRID_PAD;
    const gridHeight =
      rows * tileSize + (rows - 1) * ROW_GAP + 2 * GRID_PAD;

    return { columns, tileSize, gridWidth, gridHeight };
  }, [tracks.length, containerSize]);

  // Compute the transform that fits and centers the grid in the viewport
  const fitTransform = useMemo<Transform | null>(() => {
    if (!gridParams || !containerSize) return null;

    const { gridWidth, gridHeight } = gridParams;
    const { width: cw, height: ch } = containerSize;

    const scaleX = cw / gridWidth;
    const scaleY = ch / gridHeight;
    const fitScale = Math.min(scaleX, scaleY);

    return {
      scale: fitScale,
      translateX: (cw - gridWidth * fitScale) / 2,
      translateY: (ch - gridHeight * fitScale) / 2,
    };
  }, [gridParams, containerSize]);

  const contentSize = useMemo(() => {
    if (!gridParams) return null;
    return { width: gridParams.gridWidth, height: gridParams.gridHeight };
  }, [gridParams]);

  const { scale, translateX, translateY, cursor, wasRecentDrag } =
    useZoomPan(viewportRef, fitTransform, contentSize);

  const handleTileClick = useCallback(
    (track: Track) => {
      if (wasRecentDrag()) return;
      onClick(track);
    },
    [wasRecentDrag, onClick],
  );

  if (!gridParams || !containerSize) {
    return <div className="track-grid-container" ref={viewportRef} />;
  }

  const { columns, tileSize } = gridParams;

  return (
    <div className="track-grid-container" ref={viewportRef} style={{ cursor }}>
      <div
        className="track-grid-transform"
        style={{
          transform: `translate(${translateX}px, ${translateY}px) scale(${scale})`,
        }}
      >
        <div
          className="track-grid"
          style={{
            gridTemplateColumns: `repeat(${columns}, ${tileSize}px)`,
            gridAutoRows: `${tileSize}px`,
            padding: `${GRID_PAD}px`,
          }}
        >
          {tracks.map((track) => {
            const isActive = activeTrack?.id === track.id;
            const isPreview = previewTrack?.id === track.id;
            let className = "track-tile";
            if (isPreview) className += " track-tile--preview";
            else if (isActive) className += " track-tile--active";

            const artworkUrl = getArtworkUrl(track.artwork_url);

            return (
              <div
                key={track.id}
                className={className}
                style={{ width: tileSize, height: tileSize }}
                onPointerEnter={() => onHover(track)}
                onPointerLeave={onHoverEnd}
                onClick={() => handleTileClick(track)}
              >
                {artworkUrl && (
                  <img
                    src={artworkUrl}
                    alt=""
                    loading="lazy"
                    draggable={false}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// --- GenreLines component ---

interface GenreLinesProps {
  tracks: Track[];
  activeTrack: Track | null;
  previewTrack: Track | null;
  onHover: (track: Track) => void;
  onHoverEnd: () => void;
  onClick: (track: Track) => void;
}

export function GenreLines({
  tracks,
  activeTrack,
  previewTrack,
  onHover,
  onHoverEnd,
  onClick,
}: GenreLinesProps) {
  const [expandedGenre, setExpandedGenre] = useState<string | null>(null);

  const orderedGroups = useMemo<GenreGroup[]>(() => {
    if (tracks.length === 0) return [];
    const layout = computeGridLayout(tracks);
    return layout.orderedGroups;
  }, [tracks]);

  // Reset expanded genre when tracks change (e.g. year filter)
  useEffect(() => {
    setExpandedGenre(null);
  }, [tracks]);

  // Stable callback refs to avoid re-renders
  const onHoverRef = useRef(onHover);
  const onHoverEndRef = useRef(onHoverEnd);
  const onClickRef = useRef(onClick);
  onHoverRef.current = onHover;
  onHoverEndRef.current = onHoverEnd;
  onClickRef.current = onClick;

  const handleHover = useCallback((track: Track) => {
    onHoverRef.current(track);
  }, []);

  const handleHoverEnd = useCallback(() => {
    onHoverEndRef.current();
  }, []);

  const handleClick = useCallback((track: Track) => {
    onClickRef.current(track);
  }, []);

  const handleSlotClick = useCallback(
    (genre: string) => {
      setExpandedGenre((prev) => (prev === genre ? null : genre));
    },
    [],
  );

  if (orderedGroups.length === 0) {
    return <div className="genre-lines" />;
  }

  return (
    <div className="genre-lines">
      {orderedGroups.map((group) => {
        const isExpanded = expandedGenre === group.genre;

        return (
          <div
            key={group.genre}
            className={`genre-slot${isExpanded ? " genre-slot--expanded" : ""}`}
            onClick={
              isExpanded ? undefined : () => handleSlotClick(group.genre)
            }
          >
            <div
              className="genre-line"
              onClick={
                isExpanded ? () => handleSlotClick(group.genre) : undefined
              }
              style={isExpanded ? { cursor: "pointer" } : undefined}
            />
            <span className="genre-label">{group.displayLabel}</span>
            {isExpanded && (
              <TrackGrid
                key={expandedGenre}
                tracks={group.tracks}
                activeTrack={activeTrack}
                previewTrack={previewTrack}
                onHover={handleHover}
                onHoverEnd={handleHoverEnd}
                onClick={handleClick}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
