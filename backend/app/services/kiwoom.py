"""
키움 REST API 서비스
- 토큰 발급 (POST /oauth2/token)
- 국내 주식 일봉 데이터 조회 (ka10081)
- 국내 주식 현재가 조회 (ka10001)
"""
import httpx
from datetime import datetime
from app.config import settings
from app.models.stock import StockCandle

BASE_URL = "https://api.kiwoom.com"

_token_cache: dict = {}


async def get_access_token() -> str:
    """키움 REST API 액세스 토큰 발급 (캐시 적용)"""
    now = datetime.now().timestamp()

    if _token_cache.get("token") and _token_cache.get("expires_at", 0) > now + 60:
        return _token_cache["token"]

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{BASE_URL}/oauth2/token",
            headers={"Content-Type": "application/json;charset=UTF-8"},
            json={
                "grant_type": "client_credentials",
                "appkey": settings.kiwoom_app_key,
                "secretkey": settings.kiwoom_app_secret,
            },
        )
        resp.raise_for_status()
        data = resp.json()

    _token_cache["token"] = data["token"]
    # expires_dt 형식: "20241107083713" (YYYYMMDDHHmmss)
    try:
        expires_dt = datetime.strptime(data["expires_dt"], "%Y%m%d%H%M%S").timestamp()
        _token_cache["expires_at"] = expires_dt
    except (KeyError, ValueError):
        _token_cache["expires_at"] = now + 86400
    return _token_cache["token"]


async def _get_chart(api_id: str, body: dict, result_key: str, count: int, date_key: str = "dt") -> list[StockCandle]:
    """차트 공통 호출 헬퍼 (토큰 만료 시 1회 재시도)"""
    for attempt in range(2):
        token = await get_access_token()
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                f"{BASE_URL}/api/dostk/chart",
                headers={
                    "authorization": f"Bearer {token}",
                    "Content-Type": "application/json;charset=UTF-8",
                    "api-id": api_id,
                    "cont-yn": "N",
                    "next-key": "",
                },
                json=body,
            )
            resp.raise_for_status()
            data = resp.json()
            rc = data.get("return_code", 0)
            if rc != 0 and attempt == 0:
                print(f"[kiwoom] {api_id} return_code={rc}, 토큰 재발급 후 재시도")
                await revoke_token()
                _token_cache.clear()
                continue
            break

    candles = []
    for item in data.get(result_key, [])[:count]:
        try:
            candles.append(StockCandle(
                date=item[date_key],
                open=abs(float(item["open_pric"])),
                high=abs(float(item["high_pric"])),
                low=abs(float(item["low_pric"])),
                close=abs(float(item["cur_prc"])),
                volume=int(item["trde_qty"]),
            ))
        except (KeyError, ValueError):
            continue
    return candles


async def get_daily_candles(symbol: str, count: int = 200) -> list[StockCandle]:
    """국내 주식 일봉 조회 (ka10081)"""
    today = datetime.now().strftime("%Y%m%d")
    return await _get_chart(
        "ka10081",
        {"stk_cd": symbol, "base_dt": today, "upd_stkpc_tp": "1"},
        "stk_dt_pole_chart_qry",
        count,
    )


async def get_weekly_candles(symbol: str, count: int = 150) -> list[StockCandle]:
    """국내 주식 주봉 조회 (ka10082)"""
    today = datetime.now().strftime("%Y%m%d")
    return await _get_chart(
        "ka10082",
        {"stk_cd": symbol, "base_dt": today, "upd_stkpc_tp": "1"},
        "stk_stk_pole_chart_qry",
        count,
    )


async def get_monthly_candles(symbol: str, count: int = 120) -> list[StockCandle]:
    """국내 주식 월봉 조회 (ka10083)"""
    today = datetime.now().strftime("%Y%m%d")
    return await _get_chart(
        "ka10083",
        {"stk_cd": symbol, "base_dt": today, "upd_stkpc_tp": "1"},
        "stk_mth_pole_chart_qry",
        count,
    )


async def get_minute_candles(symbol: str, interval: int = 60, count: int = 300) -> list[StockCandle]:
    """국내 주식 분봉 조회 (ka10080) — interval: 1·3·5·10·15·30·60"""
    today = datetime.now().strftime("%Y%m%d")
    return await _get_chart(
        "ka10080",
        {"stk_cd": symbol, "base_dt": today, "tic_scope": str(interval), "upd_stkpc_tp": "1"},
        "stk_min_pole_chart_qry",
        count,
        date_key="cntr_tm",  # 분봉은 dt 대신 cntr_tm (YYYYMMDDHHmmss)
    )


async def get_yearly_candles(symbol: str, count: int = 30) -> list[StockCandle]:
    """국내 주식 년봉 조회 (ka10094)"""
    today = datetime.now().strftime("%Y%m%d")
    return await _get_chart(
        "ka10094",
        {"stk_cd": symbol, "base_dt": today, "upd_stkpc_tp": "1"},
        "stk_yr_pole_chart_qry",
        count,
    )


async def get_current_price(symbol: str) -> float:
    """국내 주식 현재가 조회 (ka10001) — 토큰 만료 시 1회 재시도"""
    for attempt in range(2):
        token = await get_access_token()
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                f"{BASE_URL}/api/dostk/stkinfo",
                headers={
                    "authorization": f"Bearer {token}",
                    "Content-Type": "application/json;charset=UTF-8",
                    "api-id": "ka10001",
                    "cont-yn": "N",
                    "next-key": "",
                },
                json={"stk_cd": symbol},
            )
            resp.raise_for_status()
            data = resp.json()
            rc = data.get("return_code", 0)
            if rc != 0 and attempt == 0:
                print(f"[kiwoom] ka10001 return_code={rc}, 토큰 재발급 후 재시도")
                await revoke_token()
                _token_cache.clear()
                continue
            break

    return abs(float(data["cur_prc"]))


async def _call_ranking(endpoint: str, api_id: str, body: dict) -> dict:
    """랭킹 TR 공통 호출 (토큰 만료 시 1회 재시도)"""
    for attempt in range(2):
        token = await get_access_token()
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                f"{BASE_URL}{endpoint}",
                headers={
                    "authorization": f"Bearer {token}",
                    "Content-Type": "application/json;charset=UTF-8",
                    "api-id": api_id,
                    "cont-yn": "N",
                    "next-key": "",
                },
                json=body,
            )
            resp.raise_for_status()
            data = resp.json()
            rc = data.get("return_code", 0)
            if rc != 0 and attempt == 0:
                print(f"[kiwoom] {api_id} return_code={rc}, 토큰 재발급 후 재시도")
                await revoke_token()
                _token_cache.clear()
                continue
            return data


def _parse_price(raw: str) -> float:
    """'+74800' / '-152000' → float (항상 양수)"""
    try:
        return abs(float(str(raw).replace("+", "").replace(",", "")))
    except (ValueError, TypeError):
        return 0.0


async def get_indices() -> list[dict]:
    """KOSPI / KOSDAQ 지수 조회 (ka20003)"""
    results = []
    for inds_cd, name in [("001", "KOSPI"), ("101", "KOSDAQ")]:
        data = await _call_ranking("/api/dostk/sect", "ka20003", {"inds_cd": inds_cd})
        items = data.get("all_inds_idex", [])
        if items:
            item = items[0]  # 첫 번째 = 종합지수
            results.append({
                "name": name,
                "value": _parse_price(item.get("cur_prc", "0")),
                "change_pct": item.get("flu_rt", "0.00"),
                "pred_pre": item.get("pred_pre", "0"),
            })
    return results


async def get_ranking(rank_type: str) -> list[dict]:
    """
    인기종목 랭킹 조회
    type: view | volume | amount | surge | rise | fall | foreign | institution | etf
    """
    if rank_type == "view":
        data = await _call_ranking("/api/dostk/stkinfo", "ka00198", {"qry_tp": "4"})
        return [
            {
                "rank": i + 1,
                "code": item["stk_cd"],
                "name": item["stk_nm"],
                "price": _parse_price(item.get("past_curr_prc", "0")),
                "change_pct": item.get("base_comp_chgr", "0.00"),
                "extra": None,
            }
            for i, item in enumerate(data.get("item_inq_rank", [])[:100])
        ]

    if rank_type == "volume":
        data = await _call_ranking("/api/dostk/rkinfo", "ka10030", {
            "mrkt_tp": "000", "sort_tp": "1", "mang_stk_incls": "1",
            "crd_tp": "0", "trde_qty_tp": "0", "pric_tp": "0",
            "trde_prica_tp": "0", "mrkt_open_tp": "0", "stex_tp": "3",
        })
        return [
            {
                "rank": i + 1,
                "code": item["stk_cd"],
                "name": item["stk_nm"],
                "price": _parse_price(item.get("cur_prc", "0")),
                "change_pct": item.get("flu_rt", "0.00"),
                "extra": f'{int(item.get("trde_qty","0")):,}주',
            }
            for i, item in enumerate(data.get("tdy_trde_qty_upper", [])[:100])
        ]

    if rank_type == "amount":
        data = await _call_ranking("/api/dostk/rkinfo", "ka10032", {
            "mrkt_tp": "000", "mang_stk_incls": "1", "stex_tp": "3",
        })
        return [
            {
                "rank": item.get("now_rank", i + 1),
                "code": item["stk_cd"],
                "name": item["stk_nm"],
                "price": _parse_price(item.get("cur_prc", "0")),
                "change_pct": item.get("flu_rt", "0.00"),
                "extra": f'{int(item.get("trde_prica","0")):,}백만',
            }
            for i, item in enumerate(data.get("trde_prica_upper", [])[:100])
        ]

    if rank_type == "surge":
        data = await _call_ranking("/api/dostk/rkinfo", "ka10023", {
            "mrkt_tp": "000", "sort_tp": "1", "tm_tp": "2",
            "trde_qty_tp": "5", "tm": "", "stk_cnd": "0",
            "pric_tp": "0", "stex_tp": "3",
        })
        return [
            {
                "rank": i + 1,
                "code": item["stk_cd"],
                "name": item["stk_nm"],
                "price": _parse_price(item.get("cur_prc", "0")),
                "change_pct": item.get("flu_rt", "0.00"),
                "extra": item.get("sdnin_rt", ""),
            }
            for i, item in enumerate(data.get("trde_qty_sdnin", [])[:100])
        ]

    if rank_type in ("rise", "fall"):
        sort_tp = "1" if rank_type == "rise" else "3"
        data = await _call_ranking("/api/dostk/rkinfo", "ka10027", {
            "mrkt_tp": "000", "sort_tp": sort_tp, "trde_qty_cnd": "0000",
            "stk_cnd": "0", "crd_cnd": "0", "updown_incls": "1",
            "pric_cnd": "0", "trde_prica_cnd": "0", "stex_tp": "3",
        })
        return [
            {
                "rank": i + 1,
                "code": item["stk_cd"],
                "name": item["stk_nm"],
                "price": _parse_price(item.get("cur_prc", "0")),
                "change_pct": item.get("flu_rt", "0.00"),
                "extra": item.get("pred_pre", ""),
            }
            for i, item in enumerate(data.get("pred_pre_flu_rt_upper", [])[:100])
        ]

    if rank_type == "foreign":
        data = await _call_ranking("/api/dostk/rkinfo", "ka10034", {
            "mrkt_tp": "000", "trde_tp": "2", "dt": "0", "stex_tp": "3",
        })
        return [
            {
                "rank": item.get("rank", i + 1),
                "code": item["stk_cd"],
                "name": item["stk_nm"],
                "price": _parse_price(item.get("cur_prc", "0")),
                "change_pct": None,
                "extra": f'순매수 {item.get("netprps_qty","0")}',
            }
            for i, item in enumerate(data.get("for_dt_trde_upper", [])[:100])
        ]

    if rank_type == "institution":
        data = await _call_ranking("/api/dostk/rkinfo", "ka10065", {
            "trde_tp": "1", "mrkt_tp": "000", "orgn_tp": "9999", "amt_qty_tp": "1",
        })
        return [
            {
                "rank": i + 1,
                "code": item["stk_cd"],
                "name": item["stk_nm"],
                "price": None,
                "change_pct": None,
                "extra": f'순매수 {item.get("netslmt","0")}',
            }
            for i, item in enumerate(data.get("opmr_invsr_trde_upper", [])[:100])
        ]

    if rank_type == "etf":
        data = await _call_ranking("/api/dostk/etf", "ka40004", {
            "txon_type": "0", "navpre": "0", "mngmcomp": "0000",
            "txon_yn": "0", "trace_idex": "0", "stex_tp": "1",
        })
        items = sorted(
            data.get("etfall_mrpr", []),
            key=lambda x: float(x.get("pre_rt", "0").replace("+", "") or "0"),
            reverse=True,
        )
        return [
            {
                "rank": i + 1,
                "code": item["stk_cd"],
                "name": item["stk_nm"],
                "price": _parse_price(item.get("close_pric", "0")),
                "change_pct": item.get("pre_rt", "0.00"),
                "extra": f'NAV {item.get("nav","")}',
            }
            for i, item in enumerate(items[:30])
        ]

    return []


async def get_investor_trades(symbol: str, count: int = 20) -> list[dict]:
    """
    종목별 투자자 기관별 매매동향 조회 (ka10060)
    개인/외국인/기관 순매수 (수량 기준, 단주)
    """
    today = datetime.now().strftime("%Y%m%d")
    for attempt in range(2):
        token = await get_access_token()
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                f"{BASE_URL}/api/dostk/chart",
                headers={
                    "authorization": f"Bearer {token}",
                    "Content-Type": "application/json;charset=UTF-8",
                    "api-id": "ka10060",
                    "cont-yn": "N",
                    "next-key": "",
                },
                json={
                    "dt": today,
                    "stk_cd": symbol,
                    "amt_qty_tp": "2",
                    "trde_tp": "0",
                    "unit_tp": "1",
                },
            )
            resp.raise_for_status()
            data = resp.json()
            rc = data.get("return_code", 0)
            if rc != 0 and attempt == 0:
                print(f"[kiwoom] ka10060 return_code={rc}, 토큰 재발급 후 재시도")
                await revoke_token()
                _token_cache.clear()
                continue
            break

    results = []
    for item in data.get("stk_invsr_orgn_chart", [])[:count]:
        results.append({
            "date": item.get("dt", ""),
            "price": abs(_parse_price(item.get("cur_prc", "0"))),
            "individual": int(item.get("ind_invsr", "0")),
            "foreign": int(item.get("frgnr_invsr", "0")),
            "institution": int(item.get("orgn", "0")),
            "finance": int(item.get("fnnc_invt", "0")),
            "insurance": int(item.get("insrnc", "0")),
            "trust": int(item.get("invtrt", "0")),
            "bank": int(item.get("bank", "0")),
            "pension": int(item.get("penfnd_etc", "0")),
            "private_fund": int(item.get("samo_fund", "0")),
            "etc_corp": int(item.get("etc_corp", "0")),
        })
    return results


async def get_orderbook(symbol: str) -> dict:
    """
    국내 주식 호가 조회 (ka10004)
    매도/매수 각 10호가 + 잔량 반환

    응답 필드명:
      매도 1차: sel_fpr_bid(호가), sel_fpr_req(잔량)
      매도 N차: sel_Nth_pre_bid(호가), sel_Nth_pre_req(잔량)  (N=2~10)
      매수 1차: buy_fpr_bid(호가), buy_fpr_req(잔량)
      매수 N차: buy_Nth_pre_bid(호가), buy_Nth_pre_req(잔량)  (N=2~10)
      총잔량:   tot_sel_req, tot_buy_req
    """
    for attempt in range(2):
        token = await get_access_token()
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                f"{BASE_URL}/api/dostk/mrkcond",
                headers={
                    "authorization": f"Bearer {token}",
                    "Content-Type": "application/json;charset=UTF-8",
                    "api-id": "ka10004",
                    "cont-yn": "N",
                    "next-key": "",
                },
                json={"stk_cd": symbol},
            )
            resp.raise_for_status()
            data = resp.json()
            rc = data.get("return_code", 0)
            if rc != 0 and attempt == 0:
                print(f"[kiwoom] ka10004 return_code={rc}, 토큰 재발급 후 재시도")
                await revoke_token()
                _token_cache.clear()
                continue
            break

    # 매도호가 키 매핑 (10차→1차, 높은 가격부터)
    _SEL_KEYS = [
        ("sel_10th_pre_bid", "sel_10th_pre_req"),
        ("sel_9th_pre_bid",  "sel_9th_pre_req"),
        ("sel_8th_pre_bid",  "sel_8th_pre_req"),
        ("sel_7th_pre_bid",  "sel_7th_pre_req"),
        ("sel_6th_pre_bid",  "sel_6th_pre_req"),
        ("sel_5th_pre_bid",  "sel_5th_pre_req"),
        ("sel_4th_pre_bid",  "sel_4th_pre_req"),
        ("sel_3th_pre_bid",  "sel_3th_pre_req"),
        ("sel_2th_pre_bid",  "sel_2th_pre_req"),
        ("sel_fpr_bid",      "sel_fpr_req"),
    ]

    # 매수호가 키 매핑 (1차→10차, 높은 가격부터)
    _BUY_KEYS = [
        ("buy_fpr_bid",      "buy_fpr_req"),
        ("buy_2th_pre_bid",  "buy_2th_pre_req"),
        ("buy_3th_pre_bid",  "buy_3th_pre_req"),
        ("buy_4th_pre_bid",  "buy_4th_pre_req"),
        ("buy_5th_pre_bid",  "buy_5th_pre_req"),
        ("buy_6th_pre_bid",  "buy_6th_pre_req"),
        ("buy_7th_pre_bid",  "buy_7th_pre_req"),
        ("buy_8th_pre_bid",  "buy_8th_pre_req"),
        ("buy_9th_pre_bid",  "buy_9th_pre_req"),
        ("buy_10th_pre_bid", "buy_10th_pre_req"),
    ]

    asks = []  # 매도호가 (높→낮)
    for price_key, qty_key in _SEL_KEYS:
        price = abs(_parse_price(data.get(price_key, "0")))
        qty = int(data.get(qty_key, "0"))
        if price > 0:
            asks.append({"price": price, "quantity": qty})

    bids = []  # 매수호가 (높→낮)
    for price_key, qty_key in _BUY_KEYS:
        price = abs(_parse_price(data.get(price_key, "0")))
        qty = int(data.get(qty_key, "0"))
        if price > 0:
            bids.append({"price": price, "quantity": qty})

    total_ask_qty = int(data.get("tot_sel_req", "0"))
    total_bid_qty = int(data.get("tot_buy_req", "0"))

    return {
        "symbol": symbol,
        "asks": asks,
        "bids": bids,
        "total_ask_qty": total_ask_qty,
        "total_bid_qty": total_bid_qty,
    }


async def revoke_token() -> None:
    """키움 서버에 접근토큰 폐기 요청 (au10002)"""
    token = _token_cache.get("token")
    if not token:
        return
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            await client.post(
                f"{BASE_URL}/oauth2/revoke",
                headers={
                    "Content-Type": "application/json;charset=UTF-8",
                },
                json={
                    "appkey": settings.kiwoom_app_key,
                    "secretkey": settings.kiwoom_app_secret,
                    "token": token,
                },
            )
    except Exception as e:
        print(f"[kiwoom] 토큰 폐기 실패: {e}")


def invalidate_token() -> None:
    """토큰 강제 만료 (WebSocket 인증 실패 시 호출)"""
    _token_cache.clear()