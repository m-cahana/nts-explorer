import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { computeGridLayout } from "../lib/genreLayout";
import type { Track, GenreGroup } from "../types";
import "./GenreLines.css";

type CursorType =
  | "default"
  | "zoom-in"
  | "zoom-out"
  | "arrow-left"
  | "arrow-right"
  | "arrow-up"
  | "arrow-down";

function CursorSVG({ type }: { type: CursorType }) {
  return (
    <svg width="32" height="32" xmlns="http://www.w3.org/2000/svg">
      <circle cx="16" cy="16" r="14" fill="none" stroke="white" strokeWidth="2" />
      {type === "zoom-in" && (
        <>
          <line x1="10" y1="16" x2="22" y2="16" stroke="white" strokeWidth="2" />
          <line x1="16" y1="10" x2="16" y2="22" stroke="white" strokeWidth="2" />
        </>
      )}
      {type === "zoom-out" && (
        <line x1="10" y1="16" x2="22" y2="16" stroke="white" strokeWidth="2" />
      )}
      {type === "arrow-left" && (
        <>
          <line x1="9" y1="16" x2="23" y2="16" stroke="white" strokeWidth="2" />
          <path d="M9 16 L14 11 M9 16 L14 21" stroke="white" strokeWidth="2" fill="none" />
        </>
      )}
      {type === "arrow-right" && (
        <>
          <line x1="9" y1="16" x2="23" y2="16" stroke="white" strokeWidth="2" />
          <path d="M23 16 L18 11 M23 16 L18 21" stroke="white" strokeWidth="2" fill="none" />
        </>
      )}
      {type === "arrow-up" && (
        <>
          <line x1="16" y1="9" x2="16" y2="23" stroke="white" strokeWidth="2" />
          <path d="M16 9 L11 14 M16 9 L21 14" stroke="white" strokeWidth="2" fill="none" />
        </>
      )}
      {type === "arrow-down" && (
        <>
          <line x1="16" y1="9" x2="16" y2="23" stroke="white" strokeWidth="2" />
          <path d="M16 23 L11 18 M16 23 L21 18" stroke="white" strokeWidth="2" fill="none" />
        </>
      )}
    </svg>
  );
}

const COL_GAP = 6;
const ROW_GAP = 6;
const GRID_PAD = 20;
const MIN_TILE_SIZE = 16;

function getArtworkUrl(url: string | null, size = "t500x500"): string {
  if (!url) return "";
  return url
    .replace(/-large\./, `-${size}.`)
    .replace(/-t\d+x\d+\./, `-${size}.`);
}

// --- useZoomPan hook ---

interface Transform {
  scale: number;
  translateX: number;
  translateY: number;
}

interface ZoomPanResult extends Transform {
  cursorType: CursorType;
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
  const [cursorType, setCursorType] = useState<CursorType>("default");
  const transformRef = useRef(transform);
  transformRef.current = transform;
  const fitTransformRef = useRef(fitTransform);
  fitTransformRef.current = fitTransform;
  const contentSizeRef = useRef(contentSize);
  contentSizeRef.current = contentSize;

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
  const pointerIdRef = useRef<number | null>(null);

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

      setCursorType(e.deltaY > 0 ? "zoom-out" : "zoom-in");
      if (cursorTimeoutRef.current) clearTimeout(cursorTimeoutRef.current);
      cursorTimeoutRef.current = setTimeout(
        () => setCursorType("default"),
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
      pointerIdRef.current = e.pointerId;
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (!isPointerDown.current) return;

      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;

      if (!hasMoved.current && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
        hasMoved.current = true;
        if (pointerIdRef.current !== null) {
          el.setPointerCapture(pointerIdRef.current);
        }
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
            setCursorType(moveDx > 0 ? "arrow-left" : "arrow-right");
          } else {
            setCursorType(moveDy > 0 ? "arrow-up" : "arrow-down");
          }
          lastMovePos.current = { x: e.clientX, y: e.clientY };
        }
      }
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (isPointerDown.current) {
        if (hasMoved.current) {
          el.releasePointerCapture(e.pointerId);
          dragEndTime.current = Date.now();
        }
      }
      isPointerDown.current = false;
      pointerIdRef.current = null;
      setCursorType("default");
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

  return { ...transform, cursorType, wasRecentDrag };
}

// --- TrackGrid sub-component ---

interface TrackGridProps {
  tracks: Track[];
  activeTrack: Track | null;
  previewTrack: Track | null;
  onHover: (track: Track) => void;
  onHoverEnd: () => void;
  onClick: (track: Track) => void;
  onCursorTypeChange: (type: CursorType) => void;
}

function TrackGrid({
  tracks,
  activeTrack,
  previewTrack,
  onHover,
  onHoverEnd,
  onClick,
  onCursorTypeChange,
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

  const { scale, translateX, translateY, cursorType, wasRecentDrag } =
    useZoomPan(viewportRef, fitTransform, contentSize);

  useEffect(() => {
    onCursorTypeChange(cursorType);
  }, [cursorType, onCursorTypeChange]);

  const handleTileClick = useCallback(
    (e: React.MouseEvent, track: Track) => {
      e.stopPropagation();
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
    <div className="track-grid-container" ref={viewportRef} onClick={(e) => e.stopPropagation()}>
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
                onClick={(e) => handleTileClick(e, track)}
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
  const [cursorType, setCursorType] = useState<CursorType>("default");
  const cursorRef = useRef<HTMLDivElement>(null);
  const [hoveredGenre, setHoveredGenre] = useState<string | null>(null);
  const [hoverPreviewTrack, setHoverPreviewTrack] = useState<Track | null>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const [scrollThumb, setScrollThumb] = useState<{ top: number; height: number } | null>(null);

  const orderedGroups = useMemo<GenreGroup[]>(() => {
    if (tracks.length === 0) return [];
    const layout = computeGridLayout(tracks);
    return layout.orderedGroups;
  }, [tracks]);

  // Custom scrollbar tracking
  useEffect(() => {
    const el = sidebarRef.current;
    if (!el) return;

    const update = () => {
      const { scrollTop, scrollHeight, clientHeight } = el;
      if (scrollHeight <= clientHeight) {
        setScrollThumb(null);
        return;
      }
      const ratio = clientHeight / scrollHeight;
      const thumbH = Math.max(20, ratio * clientHeight);
      const maxTop = clientHeight - thumbH;
      const top = (scrollTop / (scrollHeight - clientHeight)) * maxTop;
      setScrollThumb({ top, height: thumbH });
    };

    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, [orderedGroups]);

  // Reset expanded genre when tracks change (e.g. year filter)
  useEffect(() => {
    setExpandedGenre(null);
  }, [tracks]);

  // Reset cursor when genre collapses
  useEffect(() => {
    setCursorType("default");
  }, [expandedGenre]);

  // Track mouse position globally for cursor overlay
  useEffect(() => {
    const handleMove = (e: PointerEvent) => {
      const cur = cursorRef.current;
      if (cur) {
        cur.style.left = `${e.clientX}px`;
        cur.style.top = `${e.clientY}px`;
      }
    };
    document.addEventListener("pointermove", handleMove);
    return () => document.removeEventListener("pointermove", handleMove);
  }, []);

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

  const handleGenrePointerEnter = useCallback(
    (group: GenreGroup) => {
      const randomTrack = group.tracks[Math.floor(Math.random() * group.tracks.length)];
      setHoveredGenre(group.genre);
      setHoverPreviewTrack(randomTrack);
      onHoverRef.current(randomTrack);
    },
    [],
  );

  const handleGenrePointerLeave = useCallback(() => {
    setHoveredGenre(null);
    setHoverPreviewTrack(null);
    onHoverEndRef.current();
  }, []);

  if (orderedGroups.length === 0) {
    return (
      <>
        <div className="genre-lines" />
        {createPortal(
          <div ref={cursorRef} className="custom-cursor">
            <CursorSVG type={cursorType} />
          </div>,
          document.body,
        )}
      </>
    );
  }

  const expandedGroup = orderedGroups.find((g) => g.genre === expandedGenre);

  return (
    <>
      <div className="genre-lines">
        <div className="genre-sidebar-wrapper">
          <div className="genre-sidebar" ref={sidebarRef}>
            {orderedGroups.map((group) => {
              const isExpanded = expandedGenre === group.genre;
              const isHovered = hoveredGenre === group.genre;

              return (
                <div
                  key={group.genre}
                  className={`genre-slot${isExpanded ? " genre-slot--expanded" : ""}`}
                  onPointerEnter={() => handleGenrePointerEnter(group)}
                  onPointerLeave={handleGenrePointerLeave}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSlotClick(group.genre);
                  }}
                >
                  <span className="genre-text">{group.displayLabel}</span>
                  {isHovered && hoverPreviewTrack && (
                    <div className="genre-preview-tile">
                      <img
                        src={getArtworkUrl(hoverPreviewTrack.artwork_url, "t67x67")}
                        alt=""
                        draggable={false}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {scrollThumb && (
            <div className="genre-scrollbar-track">
              <div
                className="genre-scrollbar-thumb"
                style={{ top: scrollThumb.top, height: scrollThumb.height }}
              />
            </div>
          )}
        </div>

        <div className="genre-content" onClick={() => setExpandedGenre(null)}>
          {expandedGroup && (
            <>
              <span className="genre-title">{expandedGroup.displayLabel}</span>
              <TrackGrid
                key={expandedGenre}
                tracks={expandedGroup.tracks}
                activeTrack={activeTrack}
                previewTrack={previewTrack}
                onHover={handleHover}
                onHoverEnd={handleHoverEnd}
                onClick={handleClick}
                onCursorTypeChange={setCursorType}
              />
            </>
          )}
        </div>
      </div>
      {createPortal(
        <div ref={cursorRef} className="custom-cursor">
          <CursorSVG type={cursorType} />
        </div>,
        document.body,
      )}
    </>
  );
}
