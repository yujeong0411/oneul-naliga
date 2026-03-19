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

        for item in name_results + code_results + full_name_results:
            if item["code"] not in seen:
                seen.add(item["code"])
                market_label = "해외" if item["market"] in ("NASDAQ", "NYSE", "AMEX") else "국내"
                results.append({
                    "code": item["code"],
                    "name": item["name"],
                    "market": market_label,
                })
    except Exception as e:
        print(f"[stock_list] DB 검색 실패: {e}")

    return results[:limit]
