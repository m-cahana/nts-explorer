"""
NTS Explorer - NTS.live Scraper

Scrapes all episodes from NTS.live API and stores them in Supabase.
Extracts genres, moods, location, and SoundCloud URLs for matching.

Usage:
    python nts_scraper.py           # Full scrape (resumes if previously interrupted)
    python nts_scraper.py --reset   # Start fresh
"""

import asyncio
import os
import sys
from datetime import datetime
from typing import Optional, List, Dict, Any
from functools import partial

import aiohttp
from dotenv import load_dotenv
from supabase import create_client, Client

# Make print flush immediately
print = partial(print, flush=True)

load_dotenv()

# Configuration
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

NTS_API_BASE = "https://www.nts.live/api/v2"
PAGE_SIZE = 12  # Very small batches - NTS API is strict
RATE_LIMIT_DELAY = 1.0  # Seconds between requests
SHOWS_BATCH_DELAY = 2.0  # Delay when fetching shows list

# Headers to look like a real browser
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.nts.live/",
}

# Initialize Supabase client
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)


def get_progress() -> Dict:
    """Get saved progress from Supabase for resume capability."""
    try:
        result = supabase.table("nts_scrape_progress").select("*").eq("id", 1).single().execute()
        return result.data if result.data else {"shows_completed": 0, "current_show": None, "episodes_scraped": 0}
    except Exception:
        return {"shows_completed": 0, "current_show": None, "episodes_scraped": 0}


def save_progress(shows_completed: int, current_show: Optional[str], episodes_scraped: int):
    """Save current progress to Supabase."""
    data = {
        "id": 1,
        "shows_completed": shows_completed,
        "current_show": current_show,
        "episodes_scraped": episodes_scraped,
        "updated_at": datetime.utcnow().isoformat()
    }
    supabase.table("nts_scrape_progress").upsert(data).execute()


def reset_progress():
    """Reset progress to start fresh."""
    supabase.table("nts_scrape_progress").upsert({
        "id": 1,
        "shows_completed": 0,
        "current_show": None,
        "episodes_scraped": 0,
        "updated_at": datetime.utcnow().isoformat()
    }).execute()
    print("Progress reset to 0")


async def fetch_json(session: aiohttp.ClientSession, url: str, retries: int = 5) -> Optional[Dict[str, Any]]:
    """Fetch JSON from a URL with retry logic. Returns None if all retries fail."""
    for attempt in range(retries):
        try:
            async with session.get(url, headers=HEADERS) as resp:
                if resp.status == 200:
                    return await resp.json()
                elif resp.status == 422 or resp.status == 429:
                    # Rate limited - wait much longer and retry
                    wait_time = 30 + (attempt * 30)  # 30s, 60s, 90s, 120s, 150s
                    print(f"  Rate limited ({resp.status}), waiting {wait_time}s...")
                    await asyncio.sleep(wait_time)
                else:
                    print(f"  Error fetching {url}: {resp.status}")
                    return None
        except aiohttp.ClientError as e:
            if attempt < retries - 1:
                print(f"  Connection error, retrying...")
                await asyncio.sleep(5)
            else:
                print(f"  Failed after {retries} retries: {e}")
                return None
    return None


async def fetch_shows_batch(session: aiohttp.ClientSession, offset: int) -> tuple[List[Dict], int]:
    """Fetch a batch of shows. Returns (shows, total_count)."""
    url = f"{NTS_API_BASE}/shows?limit={PAGE_SIZE}&offset={offset}"
    print(f"Fetching shows (offset {offset})...")

    data = await fetch_json(session, url)
    if not data:
        return [], 0

    results = data.get("results", [])
    metadata = data.get("metadata", {}).get("resultset", {})
    total = metadata.get("count", 0)

    return results, total


async def fetch_show_episodes(session: aiohttp.ClientSession, show_alias: str, show_name: str) -> List[Dict]:
    """Fetch all episodes for a show with pagination."""
    episodes = []
    offset = 0

    while True:
        url = f"{NTS_API_BASE}/shows/{show_alias}/episodes?limit={PAGE_SIZE}&offset={offset}"

        data = await fetch_json(session, url)
        if not data:
            break

        results = data.get("results", [])

        if not results:
            break

        # Add show_name to each episode
        for ep in results:
            ep["_show_name"] = show_name

        episodes.extend(results)

        metadata = data.get("metadata", {}).get("resultset", {})
        total = metadata.get("count", 0)

        offset += PAGE_SIZE
        if offset >= total:
            break

        await asyncio.sleep(RATE_LIMIT_DELAY)

    return episodes


def extract_episode_data(episode: Dict) -> Optional[Dict]:
    """Extract relevant fields from an episode."""
    # Get SoundCloud URL from audio_sources
    soundcloud_url = None
    audio_sources = episode.get("audio_sources", [])
    for source in audio_sources:
        if source.get("source") == "soundcloud":
            soundcloud_url = source.get("url")
            break

    # Skip episodes without SoundCloud URL
    if not soundcloud_url:
        return None

    # Extract genres (array of {id, value})
    genres = [g.get("value") for g in episode.get("genres", []) if g.get("value")]

    # Extract moods (array of {id, value})
    moods = [m.get("value") for m in episode.get("moods", []) if m.get("value")]

    # Get picture URL (prefer large)
    picture_url = episode.get("media", {}).get("picture_large") or episode.get("media", {}).get("picture_medium")

    return {
        "episode_alias": episode.get("episode_alias"),
        "show_alias": episode.get("show_alias"),
        "show_name": episode.get("_show_name"),
        "name": episode.get("name"),
        "broadcast": episode.get("broadcast"),
        "description": episode.get("description"),
        "genres": genres if genres else None,
        "moods": moods if moods else None,
        "intensity": episode.get("intensity"),
        "location_short": episode.get("location_short"),
        "location_long": episode.get("location_long"),
        "soundcloud_url": soundcloud_url,
        "picture_url": picture_url
    }


def save_episodes_batch(episodes: List[Dict]):
    """Save a batch of episodes to Supabase using upsert."""
    if not episodes:
        return

    supabase.table("nts_episodes").upsert(
        episodes,
        on_conflict="episode_alias"
    ).execute()


async def scrape_all(start_fresh: bool = False):
    """Main scraping function - processes shows one batch at a time."""
    if start_fresh:
        reset_progress()

    progress = get_progress()
    shows_completed = progress.get("shows_completed", 0)
    total_episodes = progress.get("episodes_scraped", 0)

    print(f"Starting scrape (resuming from show {shows_completed})")

    async with aiohttp.ClientSession() as session:
        # Get total count first
        _, total_shows = await fetch_shows_batch(session, 0)
        if total_shows == 0:
            print("Error: Could not fetch shows count")
            return

        print(f"Total shows to process: {total_shows}")
        await asyncio.sleep(SHOWS_BATCH_DELAY)

        # Process shows in batches - fetch a batch, process it, then fetch next
        current_offset = shows_completed

        while current_offset < total_shows:
            # Fetch this batch of shows
            shows_batch, _ = await fetch_shows_batch(session, current_offset)

            if not shows_batch:
                print(f"  Failed to fetch shows at offset {current_offset}, stopping.")
                break

            print(f"  Got {len(shows_batch)} shows (offset {current_offset}/{total_shows})")
            await asyncio.sleep(SHOWS_BATCH_DELAY)

            # Process each show in this batch
            for i, show in enumerate(shows_batch):
                show_alias = show.get("show_alias")
                show_name = show.get("name", show_alias)
                current_show_num = current_offset + i + 1

                print(f"\n[{current_show_num}/{total_shows}] Processing: {show_name}")

                # Fetch all episodes for this show
                episodes_raw = await fetch_show_episodes(session, show_alias, show_name)

                if not episodes_raw:
                    print(f"  No episodes found")
                    save_progress(current_show_num, None, total_episodes)
                    continue

                # Extract data from episodes
                episodes = []
                for ep in episodes_raw:
                    data = extract_episode_data(ep)
                    if data:
                        episodes.append(data)

                if episodes:
                    print(f"  Saving {len(episodes)} episodes...")
                    save_episodes_batch(episodes)
                    total_episodes += len(episodes)
                else:
                    print(f"  No episodes with SoundCloud URLs")

                # Save progress after each show
                save_progress(current_show_num, None, total_episodes)

                await asyncio.sleep(RATE_LIMIT_DELAY)

            # Move to next batch
            current_offset += len(shows_batch)

        print(f"\n{'='*50}")
        print(f"Scraping finished!")
        print(f"Total episodes scraped: {total_episodes}")


if __name__ == "__main__":
    start_fresh = "--reset" in sys.argv

    if not SUPABASE_URL or not SUPABASE_KEY:
        print("Error: SUPABASE_URL and SUPABASE_KEY must be set in .env file")
        sys.exit(1)

    asyncio.run(scrape_all(start_fresh=start_fresh))
