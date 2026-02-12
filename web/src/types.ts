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

export interface GenreGroup {
  genre: string;
  displayLabel: string;
  tracks: Track[];
  tagProfile: Map<string, number>;
}

export interface GridLayout {
  orderedGroups: GenreGroup[];
  flatTracks: Track[];
  groupBoundaries: number[];
}
