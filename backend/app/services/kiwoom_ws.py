"""
키움 WebSocket 실시간 시세 클라이언트

프로토콜:
  1. 연결: wss://api.kiwoom.com:10000/api/dostk/websocket
  2. 로그인: {"trnm": "LOGIN", "token": "..."}
  3. 구독:  {"trnm": "REG", "grp_no": "1", "refresh": "1",
             "data": [{"item": ["005930"], "type": ["0B", "0D"]}]}
  4. 수신:  {"trnm": "REAL", "data": [{"type": "0B", "item": "005930",
             "values": {"10": "+74800", "11": "+100", "12": "+0.13"}}]}
  5. PING:  수신한 값 그대로 송신

실시간 항목:
  0B: 주식 현재가   (10=현재가, 11=전일대비, 12=등락율)
  0D: 주식호가잔량  (매도/매수 각 10호가 + 잔량)
  0J: 업종지수      (10=현재가, 11=전일대비, 12=등락율)

⚠ 키움은 토큰당 WebSocket 1개만 허용.
  → 단일 연결에서 0B + 0D를 함께 구독.
"""
import asyncio
import json
import time as _time
import websockets
from typing import Callable

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
    if now.weekday() >= 5:
        return False
    t = now.hour * 60 + now.minute
    return 510 <= t <= 940


def _parse_orderbook(values: dict) -> dict:
    """0D (주식호가잔량) values → 구조화된 호가 데이터"""
    asks = []
    bids = []
    for i in range(10):
        ask_price = _parse_price(values.get(str(41 + i), "0"))
        ask_qty   = int(values.get(str(61 + i), "0"))
        bid_price = _parse_price(values.get(str(51 + i), "0"))
        bid_qty   = int(values.get(str(71 + i), "0"))
        if ask_price > 0:
            asks.append({"price": ask_price, "quantity": ask_qty})
        if bid_price > 0:
            bids.append({"price": bid_price, "quantity": bid_qty})
    asks.reverse()
    return {
        "asks": asks,
        "bids": bids,
        "total_ask_qty": int(values.get("121", "0")),
        "total_bid_qty": int(values.get("125", "0")),
    }


# ── 통합 싱글턴 WS 매니저 (연결 1개로 0B+0D 동시 처리) ─────────────────────

class KiwoomWSManager:
    """
    키움 WebSocket 단일 연결 관리자.
    토큰당 연결 1개 제한이므로, 0B(가격)와 0D(호가)를 하나의 연결에서 처리.
    """

    def __init__(self):
        # (code, real_type) → [callback, ...]
        self._callbacks: dict[tuple[str, str], list[Callable]] = {}
        self._ws = None
        self._task: asyncio.Task | None = None

    def _ensure_running(self):
        if self._task is None or self._task.done():
            self._task = asyncio.create_task(self._run())

    def _get_reg_data(self) -> list[dict]:
        """현재 구독 목록을 REG data 형식으로 변환"""
        # real_type별로 종목코드 그룹핑
        by_type: dict[str, set[str]] = {}
        for (code, rt) in self._callbacks:
            by_type.setdefault(rt, set()).add(code)
        return [{"item": list(codes), "type": [rt]} for rt, codes in by_type.items()]

    async def subscribe(self, code: str, real_type: str, callback: Callable):
        key = (code, real_type)
        is_new = key not in self._callbacks
        if is_new:
            self._callbacks[key] = []
        self._callbacks[key].append(callback)
        self._ensure_running()

        # 이미 연결 중이면 새 종목만 추가 구독
        if is_new and self._ws is not None:
            try:
                await self._ws.send(json.dumps({
                    "trnm": "REG",
                    "grp_no": "1",
                    "refresh": "1",
                    "data": [{"item": [code], "type": [real_type]}],
                }))
            except Exception:
                pass

    async def unsubscribe(self, code: str, real_type: str, callback: Callable):
        key = (code, real_type)
        if key in self._callbacks:
            try:
                self._callbacks[key].remove(callback)
            except ValueError:
                pass
            if not self._callbacks[key]:
                del self._callbacks[key]

    async def _run(self):
        attempt = 0

        while True:
            if not self._callbacks:
                await asyncio.sleep(1)
                continue

            if not _is_market_open():
                await asyncio.sleep(60)
                continue

            connect_time = _time.monotonic()
            try:
                token = await get_access_token()

                async with websockets.connect(WS_URI) as ws:
                    self._ws = ws

                    # 로그인
                    await ws.send(json.dumps({"trnm": "LOGIN", "token": token}))
                    login_resp = json.loads(await asyncio.wait_for(ws.recv(), timeout=10.0))
                    if login_resp.get("trnm") == "LOGIN":
                        if login_resp.get("return_code") != 0:
                            print(f"[kiwoom_ws] 로그인 실패: {login_resp.get('return_msg')}")
                            invalidate_token()
                            raise ValueError("login_failed")
                        print("[kiwoom_ws] 로그인 성공")

                    # 현재 등록된 모든 구독 전송
                    reg_data = self._get_reg_data()
                    if reg_data:
                        await ws.send(json.dumps({
                            "trnm": "REG",
                            "grp_no": "1",
                            "refresh": "1",
                            "data": reg_data,
                        }))
                        print(f"[kiwoom_ws] 구독 완료: {reg_data}")
                    attempt = 0

                    # 메시지 수신 루프
                    async for raw in ws:
                        try:
                            msg = json.loads(raw)

                            if msg.get("trnm") == "PING":
                                await ws.send(raw)
                                continue

                            if msg.get("trnm") == "REAL":
                                for item in msg.get("data", []):
                                    code = item.get("item")
                                    real_type = item.get("type")
                                    values = item.get("values", {})
                                    key = (code, real_type)
                                    if key in self._callbacks:
                                        for cb in list(self._callbacks[key]):
                                            try:
                                                await cb(code, values)
                                            except Exception as e:
                                                print(f"[kiwoom_ws] 콜백 오류: {e}")
                        except json.JSONDecodeError:
                            pass
                        except Exception as e:
                            if "Bye" not in str(e):
                                print(f"[kiwoom_ws] 메시지 오류: {e}")

            except Exception as e:
                err_str = str(e)
                if "Bye" not in err_str:
                    delay = min(RECONNECT_BASE * (2 ** attempt), RECONNECT_MAX)
                    attempt += 1
                    print(f"[kiwoom_ws] 연결 오류: {e} → {delay}초 후 재연결 (시도 {attempt})")
                    await asyncio.sleep(delay)
                    continue
            finally:
                self._ws = None

            # 연결이 너무 빨리 끊긴 경우 (Bye 포함) backoff 적용
            elapsed = _time.monotonic() - connect_time
            if elapsed < 5:
                attempt += 1
                delay = min(RECONNECT_BASE * (2 ** attempt), RECONNECT_MAX)
                print(f"[kiwoom_ws] 연결 즉시 종료 → {delay}초 대기 (시도 {attempt})")
                await asyncio.sleep(delay)


# 통합 싱글턴 매니저 (연결 1개)
_manager = KiwoomWSManager()


# ── 공개 API (기존 인터페이스 유지) ───────────────────────────────────────────

async def stream_prices(stock_codes: list[str], on_price, real_type: str = "0B"):
    """
    실시간 가격 스트리밍.
    on_price: async callable(code: str, price: float, change_pct: str, volume: int)
    """
    registered = []
    for code in stock_codes:
        async def on_values(c, values, _cb=on_price):
            price = _parse_price(values.get("10", "0"))
            change = values.get("12", "0.00")
            volume = int(values.get("13", "0") or "0")
            if price:
                await _cb(c, price, change, volume=volume)

        await _manager.subscribe(code, "0B", on_values)
        registered.append((code, on_values))

    try:
        await asyncio.Future()
    finally:
        for code, cb in registered:
            await _manager.unsubscribe(code, "0B", cb)


async def stream_orderbook(stock_codes: list[str], on_orderbook):
    """
    실시간 호가잔량 스트리밍 (0D).
    on_orderbook: async callable(code: str, orderbook: dict)
    """
    registered = []
    for code in stock_codes:
        async def on_values(c, values, _cb=on_orderbook):
            orderbook = _parse_orderbook(values)
            await _cb(c, orderbook)

        await _manager.subscribe(code, "0D", on_values)
        registered.append((code, on_values))

    try:
        await asyncio.Future()
    finally:
        for code, cb in registered:
            await _manager.unsubscribe(code, "0D", cb)
