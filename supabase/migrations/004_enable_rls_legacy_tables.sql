-- Enable Row-Level Security on tables flagged as publicly accessible.
-- No policies are added:
--   - scrape_progress: only the Python scraper accesses it, and it uses the
--     service_role key (which bypasses RLS).
--   - nts_episodes / nts_scrape_progress: not referenced anywhere in the app.

ALTER TABLE scrape_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE nts_episodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE nts_scrape_progress ENABLE ROW LEVEL SECURITY;
