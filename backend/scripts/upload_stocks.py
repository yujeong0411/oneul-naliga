"""
stock_list 테이블에 국내 + 해외 종목 데이터 업로드
- 국내: stock_list_20260319.xlsx (KOSPI, KOSDAQ)
- 해외: 해외_stock_list_nasdac.csv (NASDAQ), YNSE.csv (NYSE)
"""
import sys, io, os, csv
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

import openpyxl
from supabase import create_client

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://awgyvhtzyklmqlpkbopf.supabase.co")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

# .env 파일에서 직접 읽기
if not SUPABASE_SERVICE_KEY:
    env_path = os.path.join(os.path.dirname(__file__), "..", ".env")
    with open(env_path, encoding="utf-8") as f:
        for line in f:
            if line.startswith("SUPABASE_SERVICE_KEY="):
                SUPABASE_SERVICE_KEY = line.split("=", 1)[1].strip()
            elif line.startswith("SUPABASE_URL="):
                SUPABASE_URL = line.split("=", 1)[1].strip()

db = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

ROOT = os.path.join(os.path.dirname(__file__), "..", "..")


def load_kr_stocks():
    """국내 종목 (xlsx)"""
    path = os.path.join(ROOT, "stock_list_20260319.xlsx")
    wb = openpyxl.load_workbook(path)
    ws = wb.active
    rows = []
    for row in ws.iter_rows(min_row=2, values_only=True):
        code = str(row[1]).strip()  # 단축코드
        name = str(row[3]).strip()  # 한글 약명
        full_name = str(row[4]).strip()  # 영문명
        market_raw = str(row[6]).strip()

        # 시장 구분 정리
        if "KOSDAQ" in market_raw:
            market = "KOSDAQ"
        elif "KOSPI" in market_raw:
            market = "KOSPI"
        elif "KONEX" in market_raw:
            continue  # KONEX 제외
        else:
            continue

        rows.append({
            "code": code,
            "name": name,
            "full_name": full_name,
            "market": market,
        })
    return rows


def load_us_stocks(csv_path, market):
    """해외 종목 (csv)"""
    rows = []
    with open(csv_path, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for item in reader:
            symbol = item.get("Symbol", "").strip()
            name = item.get("Name", "").strip()
            if not symbol or not name:
                continue
            rows.append({
                "code": symbol,
                "name": name,
                "full_name": name,
                "market": market,
            })
    return rows


def upsert_batch(rows, batch_size=500):
    """배치로 upsert"""
    total = len(rows)
    for i in range(0, total, batch_size):
        batch = rows[i:i + batch_size]
        db.table("stock_list").upsert(batch, on_conflict="code").execute()
        print(f"  {min(i + batch_size, total)}/{total}")


def main():
    # 기존 데이터 삭제
    print("기존 데이터 삭제...")
    db.table("stock_list").delete().neq("code", "").execute()

    # 국내 종목
    print("국내 종목 로딩...")
    kr = load_kr_stocks()
    print(f"  KOSPI/KOSDAQ: {len(kr)}개")
    print("국내 종목 업로드...")
    upsert_batch(kr)

    # NASDAQ
    nasdaq_path = os.path.join(ROOT, "해외_stock_list_nasdac.csv")
    print("NASDAQ 종목 로딩...")
    nasdaq = load_us_stocks(nasdaq_path, "NASDAQ")
    print(f"  NASDAQ: {len(nasdaq)}개")
    print("NASDAQ 종목 업로드...")
    upsert_batch(nasdaq)

    # NYSE
    nyse_path = os.path.join(ROOT, "YNSE.csv")
    print("NYSE 종목 로딩...")
    nyse = load_us_stocks(nyse_path, "NYSE")
    print(f"  NYSE: {len(nyse)}개")
    print("NYSE 종목 업로드...")
    upsert_batch(nyse)

    print(f"\n완료! 총 {len(kr) + len(nasdaq) + len(nyse)}개 종목 업로드됨")


if __name__ == "__main__":
    main()
