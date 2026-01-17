"""
NTS Explorer - NTS.live Scraper

Scrapes all episodes from NTS.live API and stores them in Supabase.
Extracts genres, moods, location, and SoundCloud URLs for matching.

Note: NTS API has a 1000 offset limit, so we fetch shows in multiple passes
with different sort orders to get all shows.

Usage:
    python nts_scraper.py           # Full scrape (resumes if previously interrupted)
    python nts_scraper.py --reset   # Start fresh (clears processed shows tracking)
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
MAX_OFFSET = 1000  # NTS API rejects offsets >= 1001
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


def get_episode_counts_by_show() -> Dict[str, int]:
    """Get count of episodes per show_alias in database."""
    try:
        # Fetch all show_alias values with pagination (Supabase has 1000 row default limit)
        counts: Dict[str, int] = {}
        batch_size = 1000
        offset = 0
        
        while True:
            result = supabase.table("nts_episodes").select("show_alias").range(offset, offset + batch_size - 1).execute()
            
            if not result.data:
                break
                
            for row in result.data:
                alias = row["show_alias"]
                counts[alias] = counts.get(alias, 0) + 1
            
            if len(result.data) < batch_size:
                break  # Last page
                
            offset += batch_size
        
        return counts
    except Exception as e:
        print(f"Warning: Could not load episode counts: {e}")
        return {}


def get_total_episodes_count() -> int:
    """Get total count of episodes in database."""
    try:
        result = supabase.table("nts_episodes").select("episode_alias", count="exact").execute()
        return result.count or 0
    except Exception:
        return 0


def reset_progress():
    """Reset progress by clearing the episodes table."""
    print("Clearing all episodes from database...")
    # Delete all episodes (this resets the scrape)
    supabase.table("nts_episodes").delete().neq("episode_alias", "").execute()
    print("Progress reset - all episodes cleared")


async def fetch_json(session: aiohttp.ClientSession, url: str, retries: int = 5) -> Optional[Dict[str, Any]]:
    """Fetch JSON from a URL with retry logic. Returns None if all retries fail."""
    for attempt in range(retries):
        try:
            async with session.get(url, headers=HEADERS) as resp:
                if resp.status == 200:
                    return await resp.json()
                elif resp.status == 422:
                    # Unprocessable Entity - likely invalid offset, don't retry
                    print(f"  API rejected request (422): {url}")
                    return None
                elif resp.status == 429:
                    # Rate limited - wait and retry
                    wait_time = 30 + (attempt * 30)
                    print(f"  Rate limited (429), waiting {wait_time}s...")
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


async def fetch_shows_batch(session: aiohttp.ClientSession, offset: int, sort_order: str = "asc") -> tuple[List[Dict], int]:
    """Fetch a batch of shows. Returns (shows, total_count).
    
    Args:
        offset: Pagination offset (max 1000)
        sort_order: 'asc' for A-Z, 'desc' for Z-A
    """
    # Try different sort parameters - NTS API may support one of these
    if sort_order == "desc":
        url = f"{NTS_API_BASE}/shows?limit={PAGE_SIZE}&offset={offset}&sort=-name"
    else:
        url = f"{NTS_API_BASE}/shows?limit={PAGE_SIZE}&offset={offset}"
    
    data = await fetch_json(session, url)
    if not data:
        return [], 0

    results = data.get("results", [])
    metadata = data.get("metadata", {}).get("resultset", {})
    total = metadata.get("count", 0)

    return results, total


async def get_show_episode_count(session: aiohttp.ClientSession, show_alias: str) -> int:
    """Get total episode count for a show from API (single request)."""
    url = f"{NTS_API_BASE}/shows/{show_alias}/episodes?limit=1&offset=0"
    data = await fetch_json(session, url)
    if not data:
        return 0
    return data.get("metadata", {}).get("resultset", {}).get("count", 0)


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


async def collect_all_shows(session: aiohttp.ClientSession) -> List[Dict]:
    """Collect all accessible shows (limited by API's offset=1000 cap + limit=12 cap)."""
    all_shows = {}  # Dedupe by show_alias
    
    # Get total count
    _, total_shows = await fetch_shows_batch(session, 0)
    if total_shows == 0:
        print("Error: Could not fetch shows count")
        return []
    
    print(f"Total shows in NTS: {total_shows}")
    
    # API limits: max offset=1000, max limit=12
    # So we can reach shows 0-1011 (1012 total)
    max_reachable = MAX_OFFSET + PAGE_SIZE  # 1000 + 12 = 1012
    if total_shows > max_reachable:
        print(f"API limitation: can only access first {max_reachable} shows (offset≤1000, limit≤12)")
    
    # Fetch shows - go up to and including offset 1000
    print(f"\n--- Fetching shows ---")
    offset = 0
    
    while offset <= MAX_OFFSET:  # <= to include offset 1000
        shows_batch, _ = await fetch_shows_batch(session, offset, "asc")
        if not shows_batch:
            break
        
        for show in shows_batch:
            alias = show.get("show_alias")
            if alias and alias not in all_shows:
                all_shows[alias] = show
        
        target = min(total_shows, max_reachable)
        print(f"  {len(all_shows)}/{target} shows fetched...")
        
        offset += PAGE_SIZE
        await asyncio.sleep(SHOWS_BATCH_DELAY)
    
    print(f"\nCollected {len(all_shows)} shows")
    
    if total_shows > len(all_shows):
        print(f"({total_shows - len(all_shows)} shows inaccessible due to API offset limit)")
    
    return list(all_shows.values())


async def scrape_all(start_fresh: bool = False):
    """Main scraping function - collects all shows then processes ones with new episodes."""
    if start_fresh:
        reset_progress()
    
    # Load episode counts per show from database
    db_episode_counts = get_episode_counts_by_show()
    total_episodes = get_total_episodes_count()
    
    print(f"Database: {len(db_episode_counts)} shows, {total_episodes} episodes")

    async with aiohttp.ClientSession() as session:
        # Collect all shows (handles offset limit internally)
        all_shows = await collect_all_shows(session)
        
        if not all_shows:
            print("Error: Could not collect shows")
            return
        
        print(f"\nChecking {len(all_shows)} shows for new episodes...")
        
        shows_processed = 0
        shows_skipped = 0
        new_episodes_total = 0

        # Process each show
        for i, show in enumerate(all_shows):
            show_alias = show.get("show_alias")
            show_name = show.get("name", show_alias)
            
            # Check how many episodes we have vs API has
            db_count = db_episode_counts.get(show_alias, 0)
            api_count = await get_show_episode_count(session, show_alias)
            
            if api_count == 0:
                continue
            
            if db_count >= api_count:
                # We likely have all episodes with SoundCloud URLs, skip
                shows_skipped += 1
                if (i + 1) % 50 == 0:  # Progress update every 50 shows
                    print(f"[{i+1}/{len(all_shows)}] Checked... ({shows_skipped} up-to-date, {shows_processed} updated)")
                continue
            
            # We might be missing episodes, fetch and check
            episodes_raw = await fetch_show_episodes(session, show_alias, show_name)

            if not episodes_raw:
                continue

            # Extract data from episodes (filters to only those with SoundCloud URLs)
            episodes = []
            for ep in episodes_raw:
                data = extract_episode_data(ep)
                if data:
                    episodes.append(data)
            
            sc_count = len(episodes)  # Episodes with SoundCloud
            new_count = max(0, sc_count - db_count)  # Actually new episodes
            
            if new_count == 0:
                # All SoundCloud episodes already in DB
                shows_skipped += 1
                if (i + 1) % 50 == 0:
                    print(f"[{i+1}/{len(all_shows)}] Checked... ({shows_skipped} up-to-date, {shows_processed} updated)")
                continue

            print(f"\n[{i+1}/{len(all_shows)}] {show_name}")
            print(f"  {api_count} total episodes, {sc_count} with SoundCloud, {db_count} in DB → +{new_count} new")

            if episodes:
                save_episodes_batch(episodes)
                new_episodes_total += new_count
                shows_processed += 1

            await asyncio.sleep(RATE_LIMIT_DELAY)

        print(f"\n{'='*50}")
        print(f"Scraping finished!")
        print(f"Shows checked: {len(all_shows)}")
        print(f"Shows updated: {shows_processed}")
        print(f"Shows up-to-date: {shows_skipped}")
        print(f"New episodes added: ~{new_episodes_total}")


if __name__ == "__main__":
    start_fresh = "--reset" in sys.argv

    if not SUPABASE_URL or not SUPABASE_KEY:
        print("Error: SUPABASE_URL and SUPABASE_KEY must be set in .env file")
        sys.exit(1)

    asyncio.run(scrape_all(start_fresh=start_fresh))
