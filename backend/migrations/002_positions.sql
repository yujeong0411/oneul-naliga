-- 마이그레이션: positions 테이블 생성 + lines에서 매매 컬럼 제거
-- Supabase SQL Editor에서 실행

-- 1. lines 테이블에서 매매 설정 컬럼 제거
ALTER TABLE lines DROP COLUMN IF EXISTS entry_price;
ALTER TABLE lines DROP COLUMN IF EXISTS exit_price;
ALTER TABLE lines DROP COLUMN IF EXISTS tp_price;
ALTER TABLE lines DROP COLUMN IF EXISTS sl_price;

-- 2. positions 테이블 생성
CREATE TABLE IF NOT EXISTS positions (
    id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    stock_code     TEXT NOT NULL,
    user_id        TEXT,
    entry_line_id  UUID REFERENCES lines(id) ON DELETE SET NULL,
    tp_line_id     UUID REFERENCES lines(id) ON DELETE SET NULL,
    sl_line_id     UUID REFERENCES lines(id) ON DELETE SET NULL,
    entry_price    DOUBLE PRECISION,
    exit_price     DOUBLE PRECISION,
    tp_price       DOUBLE PRECISION,
    sl_price       DOUBLE PRECISION,
    status         TEXT DEFAULT 'open',  -- open / closed / tp_hit / sl_hit
    created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_positions_stock  ON positions(stock_code);
CREATE INDEX IF NOT EXISTS idx_positions_user   ON positions(user_id);
CREATE INDEX IF NOT EXISTS idx_positions_status ON positions(status);
