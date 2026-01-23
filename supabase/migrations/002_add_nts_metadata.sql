-- Add NTS metadata columns to tracks table
ALTER TABLE tracks ADD COLUMN nts_url TEXT;
ALTER TABLE tracks ADD COLUMN nts_show_alias TEXT;
ALTER TABLE tracks ADD COLUMN nts_episode_alias TEXT;
ALTER TABLE tracks ADD COLUMN nts_location TEXT;
ALTER TABLE tracks ADD COLUMN nts_genres TEXT[];
ALTER TABLE tracks ADD COLUMN nts_moods TEXT[];
ALTER TABLE tracks ADD COLUMN nts_intensity INTEGER;
ALTER TABLE tracks ADD COLUMN nts_broadcast TIMESTAMP;

-- Index for location-based queries
CREATE INDEX idx_tracks_nts_location ON tracks(nts_location);

-- GIN index for genre/mood array searches
CREATE INDEX idx_tracks_nts_genres ON tracks USING GIN(nts_genres);
CREATE INDEX idx_tracks_nts_moods ON tracks USING GIN(nts_moods);
