"""
키움 WebSocket 실시간 시세 클라이언트

프로토콜:
  1. 연결: wss://api.kiwoom.com:10000/api/dostk/websocket
  2. 로그인: {"trnm": "LOGIN", "token": "..."}
  3. 구독:  {"trnm": "REG", "grp_no": "1", "refresh": "1",
             "data": [{"item": ["005930"], "type": ["0B"]}]}
  4. 수신:  {"trnm": "REAL", "data": [{"type": "0B", "item": "005930",
             "values": {"10": "+74800", "11": "+100", "12": "+0.13"}}]}
  5. PING:  수신한 값 그대로 송신

실시간 항목:
  0B: 주식 현재가   (10=현재가, 11=전일대비, 12=등락율)
  0D: 주식호가잔량  (매도/매수 각 10호가 + 잔량)
  0J: 업종지수      (10=현재가, 11=전일대비, 12=등락율)
"""
import asyncio
import json
import websockets

from app.services.kiwoom import get_access_token, invalidate_token

WS_URI         = "wss://api.kiwoom.com:10000/api/dostk/websocket"
RECONNECT_BASE = 5
RECONNECT_MAX  = 60


def _parse_price(raw: str) -> float:
    try:
        return abs(float(str(raw).replace("+", "").replace(",", "")))
    except (ValueError, TypeError):
        return 0.0


def _is_market_open():
    """국내 주식시장 운영 시간인지 확인 (평일 08:30~15:40 KST)"""
    from datetime import datetime, timezone, timedelta
    kst = timezone(timedelta(hours=9))
    now = datetime.now(kst)
    # 주말 제외
    if now.weekday() >= 5:
        return False
    # 08:30 ~ 15:40
    t = now.hour * 60 + now.minute
    return 510 <= t <= 940  # 8*60+30=510, 15*60+40=940


async def stream_prices(stock_codes: list[str], on_price, real_type: str = "0B"):
    """
    실시간 가격 스트리밍. 연결 끊김 시 지수 백오프로 자동 재연결.

    Args:
        stock_codes: 구독할 종목/업종 코드 리스트
        on_price:    async callable(code: str, price: float, change_pct: str)
        real_type:   "0B"=주식현재가, "0J"=업종지수
    """
    attempt = 0

    while True:
        # 장 마감 시 재연결 하지 않음
        if not _is_market_open():
            await asyncio.sleep(60)
            continue
        try:
            token = await get_access_token()

            async with websockets.connect(WS_URI) as ws:
                # 1. 로그인
                await ws.send(json.dumps({"trnm": "LOGIN", "token": token}))

                login_resp = json.loads(await asyncio.wait_for(ws.recv(), timeout=10.0))
                if login_resp.get("trnm") == "LOGIN":
                    if login_resp.get("return_code") != 0:
                        print(f"[kiwoom_ws] 로그인 실패: {login_resp.get('return_msg')}")
                        invalidate_token()
                        raise ValueError("login_failed")
                    print("[kiwoom_ws] 로그인 성공")

                # 2. 구독 등록
                await ws.send(json.dumps({
                    "trnm": "REG",
                    "grp_no": "1",
                    "refresh": "1",
                    "data": [{"item": stock_codes, "type": [real_type]}],
                }))
                print(f"[kiwoom_ws] 구독 완료: {stock_codes} ({real_type})")
                attempt = 0

                # 3. 메시지 수신 루프
                async for raw in ws:
                    try:
                        msg = json.loads(raw)

                        # PING → 그대로 반송
                        if msg.get("trnm") == "PING":
                            await ws.send(raw)
                            continue

                        # 실시간 데이터
                        if msg.get("trnm") == "REAL":
                            for item in msg.get("data", []):
                                code   = item.get("item")
                                values = item.get("values", {})
                                price  = _parse_price(values.get("10", "0"))
                                change = values.get("12", "0.00")
                                if code and price:
                                    await on_price(code, price, change)

                    except Exception as e:
                        print(f"[kiwoom_ws] 메시지 처리 오류: {e}")

        except Exception as e:
            delay = min(RECONNECT_BASE * (2 ** attempt), RECONNECT_MAX)
            attempt += 1
            print(f"[kiwoom_ws] 연결 오류: {e} → {delay}초 후 재연결 (시도 {attempt})")
            await asyncio.sleep(delay)


def _parse_orderbook(values: dict) -> dict:
    """
    0D (주식호가잔량) values → 구조화된 호가 데이터

    키움 0D 실시간 필드:
      매도호가 1~10: 41~50    매도호가수량 1~10: 61~70
      매수호가 1~10: 51~60    매수호가수량 1~10: 71~80
      매도호가총잔량: 121     매수호가총잔량: 125
    """
    asks = []  # 매도호가 (1차=41 → 10차=50, 낮→높)
    bids = []  # 매수호가 (1차=51 → 10차=60, 높→낮)

    for i in range(10):
        ask_price = _parse_price(values.get(str(41 + i), "0"))
        ask_qty   = int(values.get(str(61 + i), "0"))
        bid_price = _parse_price(values.get(str(51 + i), "0"))
        bid_qty   = int(values.get(str(71 + i), "0"))
        if ask_price > 0:
            asks.append({"price": ask_price, "quantity": ask_qty})
        if bid_price > 0:
            bids.append({"price": bid_price, "quantity": bid_qty})

    # 매도호가는 높→낮 순서로 뒤집어서 호가창 표시용
    asks.reverse()

    return {
        "asks": asks,
        "bids": bids,
        "total_ask_qty": int(values.get("121", "0")),
        "total_bid_qty": int(values.get("125", "0")),
    }


async def stream_orderbook(stock_codes: list[str], on_orderbook):
    """
    실시간 호가잔량 스트리밍 (0D).

    Args:
        stock_codes: 구독할 종목 코드 리스트
        on_orderbook: async callable(code: str, orderbook: dict)
    """
    attempt = 0

    while True:
        if not _is_market_open():
            await asyncio.sleep(60)
            continue

        try:
            token = await get_access_token()

            async with websockets.connect(WS_URI) as ws:
                await ws.send(json.dumps({"trnm": "LOGIN", "token": token}))

                login_resp = json.loads(await asyncio.wait_for(ws.recv(), timeout=10.0))
                if login_resp.get("trnm") == "LOGIN":
                    if login_resp.get("return_code") != 0:
                        print(f"[kiwoom_ws:orderbook] 로그인 실패: {login_resp.get('return_msg')}")
                        invalidate_token()
                        raise ValueError("login_failed")
                    print("[kiwoom_ws:orderbook] 로그인 성공")

                await ws.send(json.dumps({
                    "trnm": "REG",
                    "grp_no": "2",
                    "refresh": "1",
                    "data": [{"item": stock_codes, "type": ["0D"]}],
                }))
                print(f"[kiwoom_ws:orderbook] 호가 구독 완료: {stock_codes}")
                attempt = 0

                async for raw in ws:
                    try:
                        msg = json.loads(raw)

                        if msg.get("trnm") == "PING":
                            await ws.send(raw)
                            continue

                        if msg.get("trnm") == "REAL":
                            for item in msg.get("data", []):
                                if item.get("type") != "0D":
                                    continue
                                code = item.get("item")
                                values = item.get("values", {})
                                if code:
                                    orderbook = _parse_orderbook(values)
                                    await on_orderbook(code, orderbook)

                    except Exception as e:
                        print(f"[kiwoom_ws:orderbook] 메시지 처리 오류: {e}")

        except Exception as e:
            delay = min(RECONNECT_BASE * (2 ** attempt), RECONNECT_MAX)
            attempt += 1
            print(f"[kiwoom_ws:orderbook] 연결 오류: {e} → {delay}초 후 재연결 (시도 {attempt})")
            await asyncio.sleep(delay)
