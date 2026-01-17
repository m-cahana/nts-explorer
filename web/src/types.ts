export interface Track {
  id: number;
  soundcloud_id: number;
  title: string;
  permalink_url: string;
  artwork_url: string | null;
  duration_ms: number | null;
  genre_tags: string[] | null;
  is_streamable: boolean;
}

export interface DotPosition {
  id: number;
  x: number; // percentage 0-100
  y: number; // percentage 0-100
}
