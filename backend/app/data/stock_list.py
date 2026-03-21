"""
종목 검색 — Supabase stock_list 테이블 기반
- 국내: KOSPI/KOSDAQ 2,700+ 종목
- 해외: NASDAQ 7,000+ 종목 (주요 종목 한글명 포함)
"""

from app.database import get_supabase


def search_stocks(query: str, limit: int = 10, include_us: bool = False) -> list:
    q = query.strip()
    if not q:
        return []

    results = []
    seen = set()

    try:
        db = get_supabase()

        # 국내 종목만 or 전체
        markets = ["KOSPI", "KOSDAQ"]
        if include_us:
            markets.extend(["NASDAQ", "NYSE", "AMEX"])

        # 이름 검색
        name_results = (
            db.table("stock_list")
            .select("code, name, market")
            .in_("market", markets)
            .ilike("name", f"%{q}%")
            .limit(limit)
            .execute()
            .data
        )

        # 코드 검색
        code_results = (
            db.table("stock_list")
            .select("code, name, market")
            .in_("market", markets)
            .ilike("code", f"%{q}%")
            .limit(limit)
            .execute()
            .data
        )

        # full_name(영문 전체명) 검색 — 해외 종목용
        full_name_results = []
        if include_us:
            full_name_results = (
                db.table("stock_list")
                .select("code, name, market, full_name")
                .in_("market", ["NASDAQ", "NYSE", "AMEX"])
                .ilike("full_name", f"%{q}%")
                .limit(limit)
                .execute()
                .data
            )

        _excd_map = {"NASDAQ": "NAS", "NYSE": "NYS", "AMEX": "AMS"}

        for item in name_results + code_results + full_name_results:
            if item["code"] not in seen:
                seen.add(item["code"])
                is_us = item["market"] in ("NASDAQ", "NYSE", "AMEX")
                market_label = "해외" if is_us else "국내"
                entry = {
                    "code": item["code"],
                    "name": item["name"],
                    "market": market_label,
                }
                if is_us:
                    entry["exchange"] = _excd_map.get(item["market"], "NAS")
                results.append(entry)
    except Exception as e:
        print(f"[stock_list] DB 검색 실패: {e}")

    return results[:limit]


_EXCD_MAP = {"NASDAQ": "NAS", "NYSE": "NYS", "AMEX": "AMS"}


def get_exchanges(codes: list[str]) -> dict[str, str]:
    """코드 목록으로 거래소 코드 조회: {code: "NAS"|"NYS"|"AMS"}"""
    if not codes:
        return {}
    try:
        db = get_supabase()
        rows = (
            db.table("stock_list")
            .select("code, market")
            .in_("code", codes)
            .in_("market", ["NASDAQ", "NYSE", "AMEX"])
            .execute()
            .data
        )
        return {r["code"]: _EXCD_MAP.get(r["market"], "NAS") for r in rows}
    except Exception:
        return {}
