-- Supabase SQL Editor에서 실행

CREATE TABLE trend_lines (
    id         BIGSERIAL PRIMARY KEY,
    symbol     TEXT NOT NULL,
    market     TEXT NOT NULL CHECK (market IN ('KOSPI', 'KOSDAQ', 'US')),
    x1         TEXT NOT NULL,   -- "20240101"
    y1         NUMERIC NOT NULL,
    x2         TEXT NOT NULL,
    y2         NUMERIC NOT NULL,
    label      TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE horizontal_lines (
    id         BIGSERIAL PRIMARY KEY,
    symbol     TEXT NOT NULL,
    market     TEXT NOT NULL CHECK (market IN ('KOSPI', 'KOSDAQ', 'US')),
    price      NUMERIC NOT NULL,
    label      TEXT,
    line_type  TEXT NOT NULL DEFAULT 'resistance' CHECK (line_type IN ('support', 'resistance')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_trend_symbol ON trend_lines(symbol);
CREATE INDEX idx_horiz_symbol ON horizontal_lines(symbol);
