export interface Track {
  id: number;
  soundcloud_id: number;
  title: string;
  permalink_url: string;
  artwork_url: string | null;
  duration_ms: number | null;
  genre_tags: string[] | null;
  description: string | null;
  play_count: number | null;
  is_streamable: boolean;
  created_at: string | null;
  scraped_at: string;
  nts_url: string | null;
  nts_show_alias: string | null;
  nts_episode_alias: string | null;
  nts_location: string | null;
  nts_genres: string[] | null;
  nts_moods: string[] | null;
  nts_intensity: number | null;
  nts_broadcast: string | null;
}

export interface SoundCloudPlayerHandle {
  loadTrack: (url: string, startPosition?: number) => void;
  play: () => void;
  pause: () => void;
  seekTo: (positionMs: number) => void;
  getPosition: () => number;
}

export interface CircleTilePosition {
  trackId: number;
  comboKey: string;       // e.g., "funk/soul"
  x: number;              // Position relative to circle center
  y: number;
  ring: number;
  angleIndex: number;
}

export interface GenreComboNode {
  key: string;                    // Sorted combo key: "funk/soul"
  genres: string[];               // Individual genres: ["funk", "soul"]
  displayLabel: string;           // "funk / soul"
  tracks: Track[];
  tilePositions: CircleTilePosition[];
  radius: number;                 // Radius of outermost ring
  cx: number;                     // World x (set by graph layout)
  cy: number;                     // World y
}

export interface GenreEdge {
  sourceKey: string;
  targetKey: string;
  sharedGenres: string[];
}

export interface CircleGraphLayout {
  nodes: GenreComboNode[];
  edges: GenreEdge[];
  nodeMap: Map<string, GenreComboNode>;
  totalWidth: number;
  totalHeight: number;
  tileSize: number;
}
