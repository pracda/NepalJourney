"""Weather lookups for trekking route planning.

Used by the trip planning agent (not yet built — this tool exists ahead of
it per the repo layout) to factor current/forecast conditions into
itinerary suggestions. Uses Open-Meteo (no API key required) rather than
a paid provider, consistent with the Phase 1 cost target.
"""

import httpx

OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"


async def get_forecast(latitude: float, longitude: float, days: int = 7) -> dict:
    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.get(
            OPEN_METEO_URL,
            params={
                "latitude": latitude,
                "longitude": longitude,
                "daily": "temperature_2m_max,temperature_2m_min,precipitation_probability_max,weathercode",
                "forecast_days": min(days, 16),
                "timezone": "Asia/Kathmandu",
            },
        )
        response.raise_for_status()
        return response.json()
