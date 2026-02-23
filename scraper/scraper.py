"""
NTS Explorer - SoundCloud Scraper

Scrapes all tracks from the NTS Latest SoundCloud account and stores them in Supabase.
Crash-resistant: saves after every batch and can resume from where it left off.

Usage:
    python scraper.py           # Full scrape (resumes if previously interrupted)
    python scraper.py --reset   # Start fresh
"""

import asyncio
import random
import re
import os
import sys
from datetime import datetime
from typing import Optional, List, Dict
from urllib.parse import urlparse, parse_qs, urlencode, urlunparse

from curl_cffi import requests as curl_requests
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

# Configuration
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
SOUNDCLOUD_USER_ID = os.getenv("SOUNDCLOUD_USER_ID", "user-202286394-991268468")
PROXY_URL = os.getenv("PROXY_URL")  # Optional: residential proxy to bypass DataDome

BATCH_SIZE = 50  # Tracks per API page
RATE_LIMIT_DELAY = 1.5  # Base seconds between individual track requests
BATCH_DELAY = 3.0  # Base seconds between batch requests
NTS_RATE_LIMIT_DELAY = 0.5  # Seconds between NTS API requests


def jittered_delay(base: float) -> float:
    """Add random jitter to delays to appear more human-like."""
    return base + random.uniform(0.5, 1.5)

# SoundCloud API headers (required to avoid bot detection)
SOUNDCLOUD_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept": "application/json, text/javascript, */*; q=0.01",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Referer": "https://soundcloud.com/",
    "Origin": "https://soundcloud.com",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-site",
    "sec-ch-ua": '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"macOS"',
    "DNT": "1",
    "Connection": "keep-alive",
}

# NTS API configuration
NTS_API_BASE = "https://www.nts.live/api/v2"
NTS_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.nts.live/",
}

# Initialize Supabase client
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)


async def get_client_id(session: curl_requests.AsyncSession) -> str:
    """Extract client_id from SoundCloud's JavaScript bundles."""
    print("Discovering SoundCloud client_id...")

    resp = await session.get("https://soundcloud.com", headers=SOUNDCLOUD_HEADERS)
    html = resp.text

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
            resp = await session.get(script_url, headers=SOUNDCLOUD_HEADERS)
            js_content = resp.text

            for pattern in patterns:
                client_id_match = re.search(pattern, js_content)
                if client_id_match:
                    client_id = client_id_match.group(1)
                    print(f"Found client_id: {client_id[:8]}...")
                    return client_id
        except Exception:
            continue

    raise Exception("Could not extract client_id from SoundCloud scripts")


async def get_user_info(session: curl_requests.AsyncSession, client_id: str, username: str) -> tuple[int, int]:
    """Resolve a username to a numeric user ID and track count."""
    url = "https://api-v2.soundcloud.com/resolve"
    params = {
        "url": f"https://soundcloud.com/{username}",
        "client_id": client_id
    }

    resp = await session.get(url, params=params, headers=SOUNDCLOUD_HEADERS)
    if resp.status_code != 200:
        raise Exception(f"Failed to resolve user: {resp.text}")
    data = resp.json()
    return data["id"], data.get("track_count", 0)


def get_progress(user_id: str) -> Dict:
    """Get saved progress from Supabase for resume capability.
    
    Auto-resets if the user_id has changed since last run.
    """
    try:
        result = supabase.table("scrape_progress").select("*").eq("id", 1).single().execute()
        if not result.data:
            return {"current_offset": 0, "next_cursor": None}
        
        # Check if user_id changed or is missing - if so, reset progress
        saved_user_id = result.data.get("user_id")
        if saved_user_id != user_id:
            if saved_user_id:
                print(f"User ID changed from {saved_user_id} to {user_id} - resetting progress")
            else:
                print(f"No user_id in saved progress - resetting for {user_id}")
            reset_progress(user_id)
            return {"current_offset": 0, "next_cursor": None, "user_id": user_id}
        
        return result.data
    except Exception:
        return {"current_offset": 0, "next_cursor": None}


def save_progress(total_scraped: int, user_id: str, next_cursor: Optional[str] = None, last_track_count: Optional[int] = None):
    """Save current progress to Supabase."""
    data = {
        "id": 1,
        "current_offset": total_scraped,
        "user_id": user_id,
        "updated_at": datetime.utcnow().isoformat()
    }
    if next_cursor:
        data["next_cursor"] = next_cursor
    if last_track_count is not None:
        data["last_track_count"] = last_track_count
    supabase.table("scrape_progress").upsert(data).execute()


def reset_progress(user_id: str = None):
    """Reset progress to start fresh."""
    data = {
        "id": 1,
        "current_offset": 0,
        "next_cursor": None,
        "last_track_count": None,
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
    session: curl_requests.AsyncSession,
    url: str,
    client_id: str
) -> dict:
    """Fetch a page of tracks from a URL."""
    url = add_client_id_to_url(url, client_id)

    resp = await session.get(url, headers=SOUNDCLOUD_HEADERS)
    if resp.status_code != 200:
        raise Exception(f"Failed to fetch tracks ({resp.status_code}): {resp.text}")
    return resp.json()


async def fetch_track_details(
    session: curl_requests.AsyncSession,
    client_id: str,
    track_id: int
) -> Optional[Dict]:
    """Fetch full details for a single track (includes genre tags and NTS metadata)."""
    url = f"https://api-v2.soundcloud.com/tracks/{track_id}"
    params = {"client_id": client_id}

    try:
        resp = await session.get(url, params=params, headers=SOUNDCLOUD_HEADERS)
        if resp.status_code != 200:
            print(f"  Warning: Could not fetch track {track_id}")
            return None
        data = resp.json()

        tag_list = data.get("tag_list", "")
        genre_tags = parse_tags(tag_list)
        description = data.get("description")

        track_data = {
            "soundcloud_id": data["id"],
            "title": data.get("title", ""),
            "permalink_url": data.get("permalink_url", ""),
            "artwork_url": data.get("artwork_url"),
            "duration_ms": data.get("duration"),
            "genre_tags": genre_tags,
            "description": description,
            "play_count": data.get("playback_count"),
            "is_streamable": data.get("streamable", True),
            "created_at": data.get("created_at"),
            "nts_url": None,
            "nts_show_alias": None,
            "nts_episode_alias": None,
            "nts_location": None,
            "nts_genres": None,
            "nts_moods": None,
            "nts_intensity": None,
            "nts_broadcast": None,
        }

        nts_info = extract_nts_url(description)
        if nts_info:
            track_data["nts_url"] = nts_info["url"]
            track_data["nts_show_alias"] = nts_info["show_alias"]
            track_data["nts_episode_alias"] = nts_info["episode_alias"]

            nts_metadata = await fetch_nts_metadata(
                session,
                nts_info["show_alias"],
                nts_info["episode_alias"]
            )

            if nts_metadata:
                track_data.update(nts_metadata)
                print(f"    NTS: {nts_metadata.get('nts_location', 'Unknown')} | {nts_metadata.get('nts_genres', [])}")

            await asyncio.sleep(NTS_RATE_LIMIT_DELAY)

        return track_data
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


def extract_nts_url(description: str) -> Optional[Dict[str, str]]:
    """Extract NTS episode URL from SoundCloud description.

    Returns dict with 'url', 'show_alias', 'episode_alias' if found, else None.
    """
    if not description:
        return None

    pattern = r'https://www\.nts\.live/shows/([^/]+)/episodes/([^/\s]+)'
    match = re.search(pattern, description)

    if match:
        return {
            "url": match.group(0),
            "show_alias": match.group(1),
            "episode_alias": match.group(2).rstrip('.,;:!?)'),  # Clean trailing punctuation
        }
    return None


async def fetch_nts_metadata(
    session: curl_requests.AsyncSession,
    show_alias: str,
    episode_alias: str
) -> Optional[Dict]:
    """Fetch metadata from NTS API for an episode."""
    url = f"{NTS_API_BASE}/shows/{show_alias}/episodes/{episode_alias}"

    try:
        resp = await session.get(url, headers=NTS_HEADERS)
        if resp.status_code != 200:
            return None

        data = resp.json()

        genres = [g.get("value") for g in data.get("genres", []) if g.get("value")]
        moods = [m.get("value") for m in data.get("moods", []) if m.get("value")]

        intensity = None
        if data.get("intensity"):
            try:
                intensity = int(data.get("intensity"))
            except (ValueError, TypeError):
                pass

        return {
            "nts_location": data.get("location_long"),
            "nts_genres": genres if genres else None,
            "nts_moods": moods if moods else None,
            "nts_intensity": intensity,
            "nts_broadcast": data.get("broadcast"),
        }
    except Exception as e:
        print(f"  Warning: Could not fetch NTS metadata: {e}")
        return None


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
    import math

    # Log proxy usage if configured
    if PROXY_URL:
        proxy_display = PROXY_URL.split('@')[-1] if '@' in PROXY_URL else PROXY_URL[:40]
        print(f"Using proxy: {proxy_display}...")

    async with curl_requests.AsyncSession(impersonate="chrome120", proxies={"https": PROXY_URL} if PROXY_URL else None) as session:
        # 1. Discover client_id
        client_id = await get_client_id(session)

        # 2. Resolve username to user ID and current track count
        print(f"Resolving user: {SOUNDCLOUD_USER_ID}")
        user_id, current_track_count = await get_user_info(session, client_id, SOUNDCLOUD_USER_ID)
        print(f"User ID: {user_id} | SoundCloud track count: {current_track_count}")

        # 3. Get resume progress (auto-resets if user_id changed)
        if start_fresh:
            reset_progress(SOUNDCLOUD_USER_ID)

        progress = get_progress(SOUNDCLOUD_USER_ID)
        total_scraped = progress.get("current_offset", 0)
        saved_cursor = progress.get("next_cursor")
        last_track_count = progress.get("last_track_count") or 0

        # 4. Determine scrape mode
        base_url = f"https://api-v2.soundcloud.com/users/{user_id}/tracks"
        max_batches = None  # None = no cap (full scrape)

        if last_track_count == 0:
            # Full scrape: use cursor-based crash recovery as before
            print("Mode: full scrape (no previous track count recorded)")
            if total_scraped > 0 and saved_cursor:
                print(f"Resuming from {total_scraped} tracks (using saved cursor)")
                current_url = saved_cursor
            else:
                if total_scraped > 0:
                    print(f"Note: {total_scraped} tracks in DB, but no cursor saved. Starting from beginning (duplicates will be skipped via upsert)")
                current_url = f"{base_url}?limit={BATCH_SIZE}&linked_partitioning=1"
        else:
            # Incremental scrape: always start from page 1 (newest first)
            new_tracks = current_track_count - last_track_count
            if new_tracks <= 0:
                print(f"No new tracks (last count: {last_track_count}, current: {current_track_count}). Nothing to do.")
                return
            max_batches = math.ceil(new_tracks / BATCH_SIZE) + 1  # +1 buffer batch
            print(f"Mode: incremental scrape | New tracks: {new_tracks} | Batches to fetch: {max_batches}")
            current_url = f"{base_url}?limit={BATCH_SIZE}&linked_partitioning=1"

        batch_num = 0

        # Small delay before first request to appear more natural
        print("Starting scrape...")
        await asyncio.sleep(random.uniform(1.0, 2.0))

        # 5. Paginate through tracks using cursor (next_href)
        while current_url:
            batch_num += 1
            print(f"\nFetching batch {batch_num}...")

            # Stop after max_batches in incremental mode
            if max_batches is not None and batch_num > max_batches:
                print(f"Reached batch limit ({max_batches}). Incremental scrape complete.")
                break

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

                await asyncio.sleep(jittered_delay(RATE_LIMIT_DELAY))

            # 7. IMMEDIATELY save batch to Supabase (crash-resistant)
            if tracks:
                print(f"  Saving {len(tracks)} tracks to Supabase...")
                save_tracks_batch(tracks)

            # 8. Get next page URL (cursor-based pagination)
            next_href = batch.get("next_href")

            # 9. Update progress (include cursor only for full scrapes)
            total_scraped += len(tracks)
            cursor_to_save = next_href if max_batches is None else None
            save_progress(total_scraped, SOUNDCLOUD_USER_ID, cursor_to_save)

            print(f"  Progress saved. Total scraped: {total_scraped}")

            if not next_href:
                print("\nReached end of tracks. Scraping complete!")
                break

            current_url = next_href
            await asyncio.sleep(jittered_delay(BATCH_DELAY))

        # 10. On clean completion, record current track count for next incremental run
        save_progress(total_scraped, SOUNDCLOUD_USER_ID, last_track_count=current_track_count)
        print(f"\n{'='*50}")
        print(f"Scraping finished!")
        print(f"Total tracks scraped this run: {total_scraped}")
        print(f"Saved last_track_count: {current_track_count}")


if __name__ == "__main__":
    start_fresh = "--reset" in sys.argv

    if not SUPABASE_URL or not SUPABASE_KEY:
        print("Error: SUPABASE_URL and SUPABASE_KEY must be set in .env file")
        print("Copy .env.example to .env and fill in your Supabase credentials")
        sys.exit(1)

    asyncio.run(scrape_all(start_fresh=start_fresh))
