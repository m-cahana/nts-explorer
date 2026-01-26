"""
Minimal test script to debug SoundCloud API requests.
Run this to iterate on fixing the CAPTCHA/403 issue.
"""
import asyncio
import re
import aiohttp

# Same headers as scraper.py
HEADERS = {
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

USER_ID = 995174173  # NTS Latest resolved user ID


async def get_client_id(session: aiohttp.ClientSession) -> str:
    """Extract client_id from SoundCloud's JavaScript bundles."""
    print("1. Fetching soundcloud.com homepage...")
    async with session.get("https://soundcloud.com", headers=HEADERS) as resp:
        print(f"   Status: {resp.status}")
        print(f"   Cookies received: {list(session.cookie_jar)}")
        html = await resp.text()

    script_urls = re.findall(r'<script crossorigin src="(https://[^"]+\.js)"', html)
    print(f"   Found {len(script_urls)} script URLs")

    patterns = [
        r'client_id[:=]\s*["\']([a-zA-Z0-9]{20,})["\']',
        r'clientId[:=]\s*["\']([a-zA-Z0-9]{20,})["\']',
        r'"client_id":"([a-zA-Z0-9]{20,})"',
    ]

    for i, script_url in enumerate(script_urls):
        print(f"   Checking script {i+1}/{len(script_urls)}: {script_url[:60]}...")
        try:
            async with session.get(script_url, headers=HEADERS) as resp:
                js = await resp.text()
            for pattern in patterns:
                match = re.search(pattern, js)
                if match:
                    print(f"   Found client_id in script {i+1}!")
                    return match.group(1)
        except Exception as e:
            print(f"   Error: {e}")
            continue

    raise Exception("Could not find client_id")


async def test_tracks_request(session: aiohttp.ClientSession, client_id: str):
    """Test the actual tracks API request."""
    url = f"https://api-v2.soundcloud.com/users/{USER_ID}/tracks"
    params = {"limit": 5, "linked_partitioning": 1, "client_id": client_id}

    print(f"\n3. Fetching tracks from API...")
    print(f"   URL: {url}")
    print(f"   Params: {params}")
    print(f"   Cookies in jar: {list(session.cookie_jar)}")

    async with session.get(url, params=params, headers=HEADERS) as resp:
        print(f"\n   Response status: {resp.status}")
        print(f"   Response headers:")
        for k, v in resp.headers.items():
            print(f"      {k}: {v}")

        body = await resp.text()
        print(f"\n   Response body (first 500 chars):")
        print(f"   {body[:500]}")

        if resp.status == 200:
            print("\n   SUCCESS!")
        else:
            print("\n   FAILED - see response above")


async def main():
    print("=" * 60)
    print("SoundCloud API Test - Current Approach")
    print("=" * 60)

    jar = aiohttp.CookieJar()
    async with aiohttp.ClientSession(cookie_jar=jar) as session:
        # Step 1: Get client_id (also warms up session)
        client_id = await get_client_id(session)
        print(f"\n2. Found client_id: {client_id[:8]}...")

        # Step 2: Try fetching tracks
        await test_tracks_request(session, client_id)


if __name__ == "__main__":
    asyncio.run(main())
