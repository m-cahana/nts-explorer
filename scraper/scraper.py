"""
NTS Explorer - SoundCloud Scraper

Scrapes all tracks from the NTS Latest SoundCloud account and stores them in Supabase.
Crash-resistant: saves after every batch and can resume from where it left off.

Usage:
    python scraper.py           # Full scrape (resumes if previously interrupted)
    python scraper.py --reset   # Start fresh
"""

import asyncio
import re
import os
import sys
from datetime import datetime
from typing import Optional, List, Dict
from urllib.parse import urlparse, parse_qs, urlencode, urlunparse

import aiohttp
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

# Configuration
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
SOUNDCLOUD_USER_ID = os.getenv("SOUNDCLOUD_USER_ID", "user-202286394-991268468")

BATCH_SIZE = 50  # Tracks per API page
RATE_LIMIT_DELAY = 1.0  # Seconds between individual track requests
BATCH_DELAY = 2.0  # Seconds between batch requests

# Initialize Supabase client
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)


async def get_client_id(session: aiohttp.ClientSession) -> str:
    """Extract client_id from SoundCloud's JavaScript bundles."""
    print("Discovering SoundCloud client_id...")

    async with session.get("https://soundcloud.com") as resp:
        html = await resp.text()

    script_pattern = r'<script crossorigin src="(https://[^"]+\.js)"'
    script_urls = re.findall(script_pattern, html)

    if not script_urls:
        raise Exception("Could not find SoundCloud script URLs")

    patterns = [
        r'client_id[:=]\s*["\']([a-zA-Z0-9]{20,})["\']',
        r'clientId[:=]\s*["\']([a-zA-Z0-9]{20,})["\']',
        r'"client_id":"([a-zA-Z0-9]{20,})"',
    ]

    for script_url in script_urls:
        try:
            async with session.get(script_url) as resp:
                js_content = await resp.text()

            for pattern in patterns:
                client_id_match = re.search(pattern, js_content)
                if client_id_match:
                    client_id = client_id_match.group(1)
                    print(f"Found client_id: {client_id[:8]}...")
                    return client_id
        except Exception:
            continue

    raise Exception("Could not extract client_id from SoundCloud scripts")


async def get_user_id(session: aiohttp.ClientSession, client_id: str, username: str) -> int:
    """Resolve a username to a numeric user ID."""
    url = "https://api-v2.soundcloud.com/resolve"
    params = {
        "url": f"https://soundcloud.com/{username}",
        "client_id": client_id
    }

    async with session.get(url, params=params) as resp:
        if resp.status != 200:
            raise Exception(f"Failed to resolve user: {await resp.text()}")
        data = await resp.json()
        return data["id"]


def get_progress(user_id: str) -> Dict:
    """Get saved progress from Supabase for resume capability.
    
    Auto-resets if the user_id has changed since last run.
    """
    try:
        result = supabase.table("scrape_progress").select("*").eq("id", 1).single().execute()
        if not result.data:
            return {"current_offset": 0, "next_cursor": None}
        
        # Check if user_id changed - if so, reset progress
        saved_user_id = result.data.get("user_id")
        if saved_user_id and saved_user_id != user_id:
            print(f"User ID changed from {saved_user_id} to {user_id} - resetting progress")
            reset_progress(user_id)
            return {"current_offset": 0, "next_cursor": None, "user_id": user_id}
        
        return result.data
    except Exception:
        return {"current_offset": 0, "next_cursor": None}


def save_progress(total_scraped: int, user_id: str, next_cursor: Optional[str] = None):
    """Save current progress to Supabase."""
    data = {
        "id": 1,
        "current_offset": total_scraped,
        "user_id": user_id,
        "updated_at": datetime.utcnow().isoformat()
    }
    if next_cursor:
        data["next_cursor"] = next_cursor
    supabase.table("scrape_progress").upsert(data).execute()


def reset_progress(user_id: str = None):
    """Reset progress to start fresh."""
    data = {
        "id": 1,
        "current_offset": 0,
        "next_cursor": None,
        "updated_at": datetime.utcnow().isoformat()
    }
    if user_id:
        data["user_id"] = user_id
    supabase.table("scrape_progress").upsert(data).execute()
    print("Progress reset to 0")


def add_client_id_to_url(url: str, client_id: str) -> str:
    """Add client_id parameter to a URL if not present."""
    parsed = urlparse(url)
    params = parse_qs(parsed.query)
    if 'client_id' not in params:
        params['client_id'] = [client_id]
    new_query = urlencode(params, doseq=True)
    return urlunparse(parsed._replace(query=new_query))


async def fetch_tracks_page(
    session: aiohttp.ClientSession,
    url: str,
    client_id: str
) -> dict:
    """Fetch a page of tracks from a URL."""
    # Ensure client_id is in the URL
    url = add_client_id_to_url(url, client_id)

    async with session.get(url) as resp:
        if resp.status != 200:
            raise Exception(f"Failed to fetch tracks ({resp.status}): {await resp.text()}")
        return await resp.json()


async def fetch_track_details(
    session: aiohttp.ClientSession,
    client_id: str,
    track_id: int
) -> Optional[Dict]:
    """Fetch full details for a single track (includes genre tags)."""
    url = f"https://api-v2.soundcloud.com/tracks/{track_id}"
    params = {"client_id": client_id}

    try:
        async with session.get(url, params=params) as resp:
            if resp.status != 200:
                print(f"  Warning: Could not fetch track {track_id}")
                return None
            data = await resp.json()

            tag_list = data.get("tag_list", "")
            genre_tags = parse_tags(tag_list)

            return {
                "soundcloud_id": data["id"],
                "title": data.get("title", ""),
                "permalink_url": data.get("permalink_url", ""),
                "artwork_url": data.get("artwork_url"),
                "duration_ms": data.get("duration"),
                "genre_tags": genre_tags,
                "description": data.get("description"),
                "play_count": data.get("playback_count"),
                "is_streamable": data.get("streamable", True),
                "created_at": data.get("created_at")
            }
    except Exception as e:
        print(f"  Error fetching track {track_id}: {e}")
        return None


def parse_tags(tag_list: str) -> List[str]:
    """Parse SoundCloud's tag_list format."""
    if not tag_list:
        return []

    tags = []
    pattern = r'"([^"]+)"|(\S+)'
    for match in re.finditer(pattern, tag_list):
        tag = match.group(1) or match.group(2)
        if tag:
            tags.append(tag)
    return tags


def save_tracks_batch(tracks: List[Dict]):
    """Save a batch of tracks to Supabase using upsert."""
    if not tracks:
        return

    supabase.table("tracks").upsert(
        tracks,
        on_conflict="soundcloud_id"
    ).execute()


async def scrape_all(start_fresh: bool = False):
    """Main scraping function using cursor-based pagination."""
    async with aiohttp.ClientSession() as session:
        # 1. Discover client_id
        client_id = await get_client_id(session)

        # 2. Resolve username to user ID
        print(f"Resolving user: {SOUNDCLOUD_USER_ID}")
        user_id = await get_user_id(session, client_id, SOUNDCLOUD_USER_ID)
        print(f"User ID: {user_id}")

        # 3. Get resume progress (auto-resets if user_id changed)
        if start_fresh:
            reset_progress(SOUNDCLOUD_USER_ID)
        
        progress = get_progress(SOUNDCLOUD_USER_ID)
        total_scraped = progress.get("current_offset", 0)
        saved_cursor = progress.get("next_cursor")

        # 4. Build initial URL or resume from cursor
        base_url = f"https://api-v2.soundcloud.com/users/{user_id}/tracks"

        if total_scraped > 0 and saved_cursor:
            print(f"Resuming from {total_scraped} tracks (using saved cursor)")
            current_url = saved_cursor
        else:
            if total_scraped > 0:
                print(f"Note: {total_scraped} tracks in DB, but no cursor saved. Starting from beginning (duplicates will be skipped via upsert)")
            current_url = f"{base_url}?limit={BATCH_SIZE}&linked_partitioning=1"

        batch_num = 0

        # 5. Paginate through all tracks using cursor (next_href)
        while current_url:
            batch_num += 1
            print(f"\nFetching batch {batch_num}...")

            try:
                batch = await fetch_tracks_page(session, current_url, client_id)
            except Exception as e:
                print(f"Error fetching batch: {e}")
                print("Saving progress and exiting. Run again to resume.")
                break

            collection = batch.get("collection", [])
            if not collection:
                print("No more tracks. Scraping complete!")
                break

            print(f"  Found {len(collection)} tracks in batch")

            # 6. Fetch full details for each track
            tracks = []
            for i, track in enumerate(collection):
                track_id = track["id"]
                print(f"  [{i+1}/{len(collection)}] Fetching details for: {track.get('title', 'Unknown')[:50]}")

                details = await fetch_track_details(session, client_id, track_id)
                if details:
                    tracks.append(details)

                await asyncio.sleep(RATE_LIMIT_DELAY)

            # 7. IMMEDIATELY save batch to Supabase (crash-resistant)
            if tracks:
                print(f"  Saving {len(tracks)} tracks to Supabase...")
                save_tracks_batch(tracks)

            # 8. Get next page URL (cursor-based pagination)
            next_href = batch.get("next_href")

            # 9. Update progress WITH cursor for true resume capability
            total_scraped += len(tracks)
            save_progress(total_scraped, SOUNDCLOUD_USER_ID, next_href)

            print(f"  Progress saved. Total scraped: {total_scraped}")

            if not next_href:
                print("\nReached end of tracks. Scraping complete!")
                break

            current_url = next_href
            await asyncio.sleep(BATCH_DELAY)

        print(f"\n{'='*50}")
        print(f"Scraping finished!")
        print(f"Total tracks scraped: {total_scraped}")


if __name__ == "__main__":
    start_fresh = "--reset" in sys.argv

    if not SUPABASE_URL or not SUPABASE_KEY:
        print("Error: SUPABASE_URL and SUPABASE_KEY must be set in .env file")
        print("Copy .env.example to .env and fill in your Supabase credentials")
        sys.exit(1)

    asyncio.run(scrape_all(start_fresh=start_fresh))
