export interface Track {
  id: number;
  episode_alias: string;
  show_name: string | null;
  title: string;           // maps to nts_episodes.name
  permalink_url: string;   // maps to nts_episodes.soundcloud_url
  artwork_url: string | null; // maps to nts_episodes.picture_url
  genres: string[] | null;
  moods: string[] | null;
  location_short: string | null;
  duration_ms?: number;    // fetched from SoundCloud widget at runtime
}

export interface DotPosition {
  id: number;
  x: number; // percentage 0-100
  y: number; // percentage 0-100
}
