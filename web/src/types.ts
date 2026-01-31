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

export interface GenreSection {
  key: string;              // Primary genre: "hip hop"
  displayLabel: string;     // Display text
  tracks: Track[];
  x: number;
  y: number;
  width: number;
  height: number;
  cols: number;
  rows: number;
}

export interface GridLayout {
  sections: GenreSection[];
  totalWidth: number;
  totalHeight: number;
  tileSize: number;
  gap: number;
  dividerWidth: number;
}

// Continuous grid layout types
export interface TilePosition {
  trackId: number;
  genreKey: string;
  globalIndex: number;
  col: number;
  row: number;
  x: number;
  y: number;
}

export interface GenreGroup {
  key: string;
  displayLabel: string;
  tracks: Track[];
  tilePositions: TilePosition[];
  labelPosition: { x: number; y: number };
}

export interface ContinuousGridLayout {
  groups: GenreGroup[];
  totalCols: number;
  totalRows: number;
  totalWidth: number;
  totalHeight: number;
  tileSize: number;
  gap: number;
}
