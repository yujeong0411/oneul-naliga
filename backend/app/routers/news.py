import time
import httpx
import xml.etree.ElementTree as ET
from fastapi import APIRouter, Query
from app.config import settings

router = APIRouter(prefix="/news", tags=["news"])

DEFAULT_QUERIES = ["미국증시", "주식시장", "코스피"]
CACHE_TTL = 300  # 5분

_cache: dict[str, dict] = {}


def _use_naver() -> bool:
    return bool(settings.naver_client_id and settings.naver_client_secret)


def _clean(text: str) -> str:
    return (text
            .replace("<b>", "").replace("</b>", "")
            .replace("&amp;", "&").replace("&quot;", '"').replace("&#39;", "'"))


async def _fetch_naver(query: str, display: int = 5) -> list[dict]:
    headers = {
        "X-Naver-Client-Id": settings.naver_client_id,
        "X-Naver-Client-Secret": settings.naver_client_secret,
    }
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.get(
            "https://openapi.naver.com/v1/search/news.json",
            headers=headers,
            params={"query": query, "display": display, "sort": "date"},
        )
        resp.raise_for_status()
        items = resp.json().get("items", [])
    return [
        {
            "title": _clean(item["title"]),
            "description": _clean(item["description"]),
            "link": item["originallink"] or item["link"],
            "pubDate": item["pubDate"],
        }
        for item in items
    ]


async def _fetch_google(query: str, display: int = 5) -> list[dict]:
    url = (
        f"https://news.google.com/rss/search"
        f"?q={httpx.URL('', params={'q': query}).params['q']}"
        f"&hl=ko&gl=KR&ceid=KR:ko"
    )
    async with httpx.AsyncClient(timeout=8.0, follow_redirects=True,
                                  headers={"User-Agent": "Mozilla/5.0"}) as client:
        resp = await client.get(
            "https://news.google.com/rss/search",
            params={"q": query, "hl": "ko", "gl": "KR", "ceid": "KR:ko"},
        )
        resp.raise_for_status()

    root = ET.fromstring(resp.text)
    items = root.findall("./channel/item")[:display]
    return [
        {
            "title": (item.findtext("title") or "").strip(),
            "description": "",
            "link": (item.findtext("link") or "").strip(),
            "pubDate": (item.findtext("pubDate") or "").strip(),
        }
        for item in items
        if item.findtext("title")
    ]


@router.get("")
async def get_news(queries: str = Query(default="")):
    query_list = [q.strip() for q in queries.split(",") if q.strip()] or DEFAULT_QUERIES
    cache_key = ",".join(sorted(query_list))
    now = time.time()

    cached = _cache.get(cache_key)
    if cached and now - cached["at"] < CACHE_TTL:
        return {"news": cached["data"]}

    use_naver = _use_naver()
    results = []
    seen = set()

    for query in query_list:
        try:
            if use_naver:
                items = await _fetch_naver(query)
            else:
                raise Exception("naver disabled")
        except Exception:
            try:
                items = await _fetch_google(query)
            except Exception:
                items = []

        for item in items:
            if item["link"] not in seen:
                seen.add(item["link"])
                results.append(item)

    results.sort(key=lambda x: x["pubDate"], reverse=True)
    results = results[:15]

    _cache[cache_key] = {"data": results, "at": now}
    return {"news": results}
