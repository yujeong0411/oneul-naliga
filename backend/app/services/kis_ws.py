"""
한국투자증권 WebSocket 실시간 시세 (해외주식)

프로토콜:
  1. 접속키 발급: POST /oauth2/Approval → approval_key
  2. 연결: ws://ops.koreainvestment.com:21000
  3. 구독: {"header": {"approval_key": "...", "custtype": "P", "tr_type": "1", "content-type": "utf-8"},
           "body": {"input": {"tr_id": "HDFSASP0", "tr_key": "DNASAAPL"}}}
  4. 수신: "0|HDFSASP0|0001|RSYM^SYMB^...^PBID1^PASK1^VBID1^VASK1^..."

tr_key 형식: D + 거래소코드 + 종목코드  (예: DNASAAPL, DNYSIBM)

⚠ KIS는 approval_key 하나당 WebSocket 연결 1개만 허용.
  → KISWebSocketManager 싱글턴으로 단일 연결 공유.

실시간 TR_ID:
  HDFSCNT0: 해외주식 실시간지연체결가 (현재가, 등락률)
  HDFSASP0: 해외주식 실시간호가 (매수/매도 10호가)

HDFSASP0 필드 순서 [실시간-021]:
  0:RSYM 1:SYMB 2:ZDIV 3:XYMD 4:XHMS 5:KYMD 6:KHMS
  7:BVOL(매수총잔량) 8:AVOL(매도총잔량) 9:BDVL 10:ADVL
  [레벨 i=0..9, base=11+i*6]
    base+0: PBID{i+1}(매수호가) base+1: PASK{i+1}(매도호가)
    base+2: VBID{i+1}(매수잔량) base+3: VASK{i+1}(매도잔량)
    base+4: DBID{i+1}           base+5: DASK{i+1}
"""
import asyncio
import json
import time
import httpx
import websockets
from typing import Callable

from app.config import settings

WS_URI   = "ws://ops.koreainvestment.com:21000"
BASE_URL = "https://openapi.koreainvestment.com:9443"

_approval_cache: dict = {}

RECONNECT_BASE = 5
RECONNECT_MAX  = 60


async def get_approval_key() -> str:
    """WebSocket 접속키 발급 (/oauth2/Approval, 24시간 유효, 캐시 적용)"""
    now = time.time()
    if _approval_cache.get("key") and _approval_cache.get("expires_at", 0) > now + 300:
        return _approval_cache["key"]

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(
            f"{BASE_URL}/oauth2/Approval",
            json={
                "grant_type": "client_credentials",
                "appkey":     settings.kis_app_key,
                "secretkey":  settings.kis_app_secret,
            },
        )
        resp.raise_for_status()
        data = resp.json()

    _approval_cache["key"]        = data["approval_key"]
    _approval_cache["expires_at"] = now + 86400
    print("[kis_ws] 웹소켓 접속키 발급 완료")
    return _approval_cache["key"]


def _tr_key(symbol: str, exchange: str) -> str:
    return f"D{exchange}{symbol}"


# ── HDFSCNT0 (현재가) 파싱 ──────────────────────────────────────────────────

def _parse_price(fields: list[str]) -> dict | None:
    # HDFSCNT0 필드: 0=RSYM 1=SYMB 2=ZDIV 3=TYMD 4=XYMD 5=XHMS 6=KYMD 7=KHMS
    #   8=OPEN 9=HIGH 10=LOW 11=LAST 12=SIGN 13=DIFF 14=RATE
    if len(fields) < 15:
        return None
    try:
        return {
            "symb": fields[1],
            "last": abs(float(fields[11] or "0")),  # LAST(현재가) = index 11
            "rate": fields[14],                      # RATE(등락율%) = index 14
        }
    except (ValueError, IndexError):
        return None


# ── HDFSASP0 (호가) 파싱 ───────────────────────────────────────────────────
# 필드 구조 [실시간-021] 확인:
#   index 7 = BVOL(매수총잔량), index 8 = AVOL(매도총잔량)
#   레벨당 6필드: PBID, PASK, VBID, VASK, DBID, DASK
#   PBID1=최우선매수(최고가), PASK1=최우선매도(최저가)
#   → bids: PBID1..10 이미 높→낮 순서
#   → asks: PASK1..10 낮→높 순서이므로 reverse() 필요

def _parse_orderbook(fields: list[str]) -> dict | None:
    if len(fields) < 12:
        return None
    try:
        symb = fields[1]
        bvol = int(float(fields[7] or "0"))  # BVOL 매수총잔량
        avol = int(float(fields[8] or "0"))  # AVOL 매도총잔량

        asks, bids = [], []
        for i in range(10):
            base = 11 + i * 6
            if base + 3 >= len(fields):
                break
            pbid = float(fields[base]     or "0")  # 매수호가
            pask = float(fields[base + 1] or "0")  # 매도호가
            vbid = int(float(fields[base + 2] or "0"))  # 매수잔량
            vask = int(float(fields[base + 3] or "0"))  # 매도잔량
            if pbid > 0:
                bids.append({"price": pbid, "quantity": vbid})
            if pask > 0:
                asks.append({"price": pask, "quantity": vask})

        asks.reverse()  # PASK1=최우선(낮은값) 순서 → 역순으로 높→낮
        return {
            "symb": symb,
            "asks": asks,
            "bids": bids,
            "total_bid_qty": bvol,
            "total_ask_qty": avol,
        }
    except (ValueError, IndexError):
        return None


# ── 싱글턴 WS 매니저 ────────────────────────────────────────────────────────

class KISWebSocketManager:
    """
    KIS WebSocket 단일 연결 관리자.
    approval_key 하나당 연결 1개 제한이므로 모든 구독을 공유.
    """

    def __init__(self):
        # key: (tr_id, tr_key_str) → callbacks
        self._callbacks: dict[tuple[str, str], list[Callable]] = {}
        # key: (tr_id, tr_key_str) → (symbol, exchange)
        self._sub_info: dict[tuple[str, str], tuple[str, str]] = {}
        self._ws = None
        self._task: asyncio.Task | None = None

    def _ensure_running(self):
        if self._task is None or self._task.done():
            self._task = asyncio.create_task(self._run())

    async def subscribe(self, tr_id: str, symbol: str, exchange: str, callback: Callable):
        key = (tr_id, _tr_key(symbol, exchange))
        is_new = key not in self._callbacks
        if is_new:
            self._callbacks[key] = []
            self._sub_info[key] = (symbol, exchange)
        self._callbacks[key].append(callback)
        self._ensure_running()

        # 새 구독이고 WS 이미 연결 중이면 즉시 구독 전송 (중복 방지)
        if is_new and self._ws is not None:
            try:
                approval_key = await get_approval_key()
                await self._send_sub(self._ws, approval_key, tr_id, _tr_key(symbol, exchange))
            except Exception:
                pass

    async def unsubscribe(self, tr_id: str, symbol: str, exchange: str, callback: Callable):
        key = (tr_id, _tr_key(symbol, exchange))
        if key in self._callbacks:
            try:
                self._callbacks[key].remove(callback)
            except ValueError:
                pass
            if not self._callbacks[key]:
                del self._callbacks[key]
                self._sub_info.pop(key, None)

    async def _send_sub(self, ws, approval_key: str, tr_id: str, tr_key: str):
        await ws.send(json.dumps({
            "header": {
                "approval_key": approval_key,
                "custtype":     "P",
                "tr_type":      "1",
                "content-type": "utf-8",
            },
            "body": {
                "input": {"tr_id": tr_id, "tr_key": tr_key}
            },
        }))

    async def _run(self):
        attempt = 0
        connect_time = 0.0
        max_attempts = 10

        while attempt < max_attempts:
            # 구독이 없으면 대기
            if not self._sub_info:
                await asyncio.sleep(1)
                continue

            try:
                approval_key = await get_approval_key()
                connect_time = time.monotonic()

                async with websockets.connect(WS_URI, ping_interval=None) as ws:
                    self._ws = ws
                    attempt = 0

                    # 현재 등록된 모든 구독 전송
                    for (tr_id, tr_key) in list(self._sub_info.keys()):
                        await self._send_sub(ws, approval_key, tr_id, tr_key)
                    print(f"[kis_ws] 연결 완료, 구독 수: {len(self._sub_info)}")

                    async for raw in ws:
                        try:
                            if raw.startswith("{"):
                                try:
                                    msg = json.loads(raw)
                                    body = msg.get("body") or {}
                                    rt_cd = str(body.get("rt_cd", "0"))
                                    msg1 = body.get("msg1", "")
                                    if rt_cd == "0":
                                        print(f"[kis_ws] 구독 성공: {msg1}")
                                    else:
                                        print(f"[kis_ws] 구독 오류: {msg1} (rt_cd={rt_cd})")
                                except Exception:
                                    pass
                                continue

                            # 실시간 데이터: "암호화|tr_id|건수|필드^필드^..."
                            parts = raw.split("|")
                            if len(parts) < 4:
                                continue
                            tr_id = parts[1]
                            fields = parts[3].split("^")
                            symb = fields[1] if len(fields) > 1 else ""

                            # tr_id와 symbol이 일치하는 모든 콜백 호출
                            for (cb_tr_id, cb_tr_key), cbs in list(self._callbacks.items()):
                                if cb_tr_id == tr_id and symb in cb_tr_key:
                                    for cb in list(cbs):
                                        try:
                                            await cb(fields)
                                        except Exception as e:
                                            print(f"[kis_ws] 콜백 오류: {e}")
                        except Exception as e:
                            print(f"[kis_ws] 메시지 처리 오류: {e}")

            except Exception as e:
                elapsed = time.monotonic() - connect_time
                delay = min(RECONNECT_BASE * (2 ** attempt), RECONNECT_MAX)
                attempt += 1
                if elapsed < 2 and attempt >= 3:
                    print(f"[kis_ws] 즉시 종료 반복 — 잘못된 종목/거래소 코드 가능성. 재시도 중단.")
                    return
                print(f"[kis_ws] 연결 오류: {e} → {delay}초 후 재연결 ({attempt}/{max_attempts})")
                await asyncio.sleep(delay)
            finally:
                self._ws = None

        print("[kis_ws] 최대 재시도 초과. 스트리밍 중단.")


_manager = KISWebSocketManager()


# ── 공개 API ────────────────────────────────────────────────────────────────

async def stream_us_prices(subscriptions: list[dict], on_price):
    """
    미국 주식 실시간 체결가 스트리밍 (HDFSCNT0)
    subscriptions: [{"symbol": "AAPL", "exchange": "NAS"}, ...]
    on_price: async callable(symbol: str, price: float, change_pct: str)
    """
    registered = []
    for sub in subscriptions:
        symbol, exchange = sub["symbol"], sub["exchange"]

        async def on_fields(fields, _sym=symbol):
            data = _parse_price(fields)
            if data and data["last"] > 0 and data["symb"] == _sym:
                await on_price(data["symb"], data["last"], data["rate"])

        await _manager.subscribe("HDFSCNT0", symbol, exchange, on_fields)
        registered.append((symbol, exchange, on_fields))

    try:
        await asyncio.Future()  # 취소될 때까지 대기
    finally:
        for symbol, exchange, cb in registered:
            await _manager.unsubscribe("HDFSCNT0", symbol, exchange, cb)


async def stream_us_orderbook(subscriptions: list[dict], on_orderbook):
    """
    미국 주식 실시간 호가 스트리밍 (HDFSASP0)
    subscriptions: [{"symbol": "AAPL", "exchange": "NAS"}, ...]
    on_orderbook: async callable(symbol: str, orderbook: dict)
    """
    registered = []
    for sub in subscriptions:
        symbol, exchange = sub["symbol"], sub["exchange"]

        async def on_fields(fields, _sym=symbol):
            data = _parse_orderbook(fields)
            if data and data["symb"] == _sym:
                symb = data.pop("symb")
                await on_orderbook(symb, data)

        await _manager.subscribe("HDFSASP0", symbol, exchange, on_fields)
        registered.append((symbol, exchange, on_fields))

    try:
        await asyncio.Future()
    finally:
        for symbol, exchange, cb in registered:
            await _manager.unsubscribe("HDFSASP0", symbol, exchange, cb)
