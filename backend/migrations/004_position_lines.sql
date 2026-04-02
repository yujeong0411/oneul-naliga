-- 포지션-선 1:N 연결을 위한 중간 테이블

-- 1. 중간 테이블 생성
CREATE TABLE IF NOT EXISTS position_lines (
    id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    position_id  UUID NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
    line_id      UUID NOT NULL REFERENCES lines(id) ON DELETE CASCADE,
    role         TEXT NOT NULL CHECK (role IN ('entry', 'tp', 'sl')),
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(position_id, line_id)
);
CREATE INDEX IF NOT EXISTS idx_pl_position ON position_lines(position_id);
CREATE INDEX IF NOT EXISTS idx_pl_line ON position_lines(line_id);

-- 2. 기존 데이터 마이그레이션
INSERT INTO position_lines (position_id, line_id, role)
SELECT id, entry_line_id, 'entry' FROM positions WHERE entry_line_id IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO position_lines (position_id, line_id, role)
SELECT id, tp_line_id, 'tp' FROM positions WHERE tp_line_id IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO position_lines (position_id, line_id, role)
SELECT id, sl_line_id, 'sl' FROM positions WHERE sl_line_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- 3. 기존 FK 컬럼 제거
ALTER TABLE positions DROP COLUMN IF EXISTS entry_line_id;
ALTER TABLE positions DROP COLUMN IF EXISTS tp_line_id;
ALTER TABLE positions DROP COLUMN IF EXISTS sl_line_id;
