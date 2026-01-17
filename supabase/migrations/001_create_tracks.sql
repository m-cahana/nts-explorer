-- Main tracks table
CREATE TABLE tracks (
  id SERIAL PRIMARY KEY,
  soundcloud_id BIGINT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  permalink_url TEXT NOT NULL,
  artwork_url TEXT,
  duration_ms INTEGER,
  genre_tags TEXT[],
  description TEXT,
  play_count INTEGER,
  is_streamable BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP,
  scraped_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_tracks_soundcloud_id ON tracks(soundcloud_id);
CREATE INDEX idx_tracks_created ON tracks(created_at DESC);
CREATE INDEX idx_tracks_genre ON tracks USING GIN(genre_tags);
CREATE INDEX idx_tracks_streamable ON tracks(is_streamable);

-- Progress tracking for crash recovery
CREATE TABLE scrape_progress (
  id INTEGER PRIMARY KEY DEFAULT 1,
  current_offset INTEGER NOT NULL DEFAULT 0,
  next_cursor TEXT,  -- Store the next_href for true resume
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Insert initial progress row
INSERT INTO scrape_progress (id, current_offset) VALUES (1, 0);
