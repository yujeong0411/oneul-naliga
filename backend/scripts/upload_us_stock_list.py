"""
해외 종목 CSV를 Supabase stock_list 테이블에 추가하는 스크립트
사용: python scripts/upload_us_stock_list.py
"""
import sys
import os
import csv
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.database import get_supabase

CSV_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "해외_stock_list_nasdac.csv")

# 주요 미국 종목 한글명 매핑
KOR_NAMES = {
    "AAPL": "애플", "MSFT": "마이크로소프트", "GOOGL": "구글(알파벳)",
    "AMZN": "아마존", "NVDA": "엔비디아", "META": "메타",
    "TSLA": "테슬라", "JPM": "제이피모건", "V": "비자",
    "UNH": "유나이티드헬스", "XOM": "엑슨모빌", "JNJ": "존슨앤존슨",
    "WMT": "월마트", "MA": "마스터카드", "PG": "프록터앤갬블",
    "HD": "홈디포", "CVX": "쉐브론", "MRK": "머크",
    "ABBV": "애브비", "COST": "코스트코", "AMD": "에이엠디",
    "INTC": "인텔", "NFLX": "넷플릭스", "ADBE": "어도비",
    "CRM": "세일즈포스", "ORCL": "오라클", "QCOM": "퀄컴",
    "TXN": "텍사스인스트루먼트", "AVGO": "브로드컴", "PYPL": "페이팔",
    "BAC": "뱅크오브아메리카", "GS": "골드만삭스", "MS": "모건스탠리",
    "DIS": "디즈니", "UBER": "우버", "SPOT": "스포티파이",
    "SNAP": "스냅", "COIN": "코인베이스", "PLTR": "팔란티어",
    "RBLX": "로블록스", "HOOD": "로빈후드", "SOFI": "소파이",
    "ARM": "ARM홀딩스", "SMCI": "슈퍼마이크로", "MU": "마이크론",
    "LRCX": "램리서치", "ASML": "ASML", "TSM": "TSMC",
    "BA": "보잉", "CAT": "캐터필러", "NKE": "나이키",
    "SBUX": "스타벅스", "KO": "코카콜라", "PEP": "펩시코",
    "T": "AT&T", "VZ": "버라이즌", "CSCO": "시스코",
    "IBM": "IBM", "GE": "제너럴일렉트릭", "F": "포드",
    "GM": "제너럴모터스", "ABNB": "에어비앤비", "SQ": "블록(스퀘어)",
    "SHOP": "쇼피파이", "ZM": "줌", "ROKU": "로쿠",
    "RIVN": "리비안", "LCID": "루시드", "NIO": "니오",
    "BABA": "알리바바", "JD": "징둥닷컴", "PDD": "핀둬둬",
    "BIDU": "바이두", "LI": "리오토", "XPEV": "샤오펑",
    "MARA": "마라홀딩스", "RIOT": "라이엇플랫폼", "MSTR": "마이크로스트래티지",
    "BRK.B": "버크셔해서웨이", "LLY": "일라이릴리", "UNP": "유니온퍼시픽",
}


def parse_csv():
    stocks = []
    with open(CSV_PATH, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            symbol = row.get("Symbol", "").strip()
            name = row.get("Name", "").strip()
            if not symbol or not name:
                continue

            # 너무 긴 이름 정리 (Common Stock, Inc. 등 제거)
            short_name = name
            for suffix in [" Common Stock", " Class A Common Stock", " Class C Capital Stock",
                          " Common Shares", " Ordinary Shares", " American Depositary Shares",
                          " Inc.", " Corporation", " Corp.", " Co.,Ltd.", " Ltd.", " Limited",
                          " Holdings", " Group", " Technologies", " Therapeutics"]:
                short_name = short_name.replace(suffix, "")
            short_name = short_name.strip().rstrip(",").strip()

            kor_name = KOR_NAMES.get(symbol, "")

            stocks.append({
                "code": symbol,
                "name": kor_name if kor_name else short_name,
                "full_name": name,
                "market": "NASDAQ",
            })

    return stocks


def upload(stocks):
    db = get_supabase()

    # 기존 해외 종목 삭제
    db.table("stock_list").delete().eq("market", "NASDAQ").execute()
    print("기존 해외 데이터 삭제 완료")

    # 100개씩 배치 삽입
    batch_size = 100
    for i in range(0, len(stocks), batch_size):
        batch = stocks[i:i + batch_size]
        db.table("stock_list").insert(batch).execute()
        print(f"  {i + len(batch)} / {len(stocks)}")

    print(f"완료: {len(stocks)}개 해외 종목 업로드")


if __name__ == "__main__":
    stocks = parse_csv()
    print(f"CSV에서 {len(stocks)}개 종목 파싱 완료")

    # 한글명 있는 종목 수
    kor = [s for s in stocks if s["name"] != s.get("full_name", "")]
    print(f"한글명 매핑: {len(KOR_NAMES)}개")

    upload(stocks)
