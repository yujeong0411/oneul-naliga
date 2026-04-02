-- ============================================
-- 오늘 날이가 - Supabase 스키마
-- Supabase SQL Editor에서 실행
-- ============================================

-- 관심종목
CREATE TABLE IF NOT EXISTS stocks (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id     TEXT,
    code        TEXT NOT NULL,
    name        TEXT,
    market      TEXT,       -- 'KOSPI' | 'KOSDAQ' | 'US'
    exchange    TEXT,       -- 'NAS' | 'NYS' | 'AMS' 등
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_stocks_user ON stocks(user_id);

-- 추세선 / 수평선 (통합)
CREATE TABLE IF NOT EXISTS lines (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    stock_code  TEXT NOT NULL,
    timeframe   TEXT NOT NULL,      -- '일봉' | '주봉' | '월봉' | '년봉' | '1분' ~ '60분'
    line_type   TEXT NOT NULL,      -- 'trend' | 'horizontal'
    signal_type TEXT NOT NULL,      -- 'attack' (저항) | 'loss' (지지)
    name        TEXT,
    x1          BIGINT,             -- Unix timestamp (추세선)
    y1          DOUBLE PRECISION,
    x2          BIGINT,
    y2          DOUBLE PRECISION,
    slope       DOUBLE PRECISION,
    intercept   DOUBLE PRECISION,
    price       DOUBLE PRECISION,   -- 수평선 가격
    color       TEXT,
    sensitivity DOUBLE PRECISION DEFAULT 0.5,
    is_active   BOOLEAN DEFAULT TRUE,
    user_id     TEXT,
    intent      TEXT,               -- 'buy' | 'sell' | 'stop' | 'watch'
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lines_stock ON lines(stock_code);
CREATE INDEX IF NOT EXISTS idx_lines_user ON lines(user_id);
CREATE INDEX IF NOT EXISTS idx_lines_active ON lines(is_active);

-- 알림 기록
CREATE TABLE IF NOT EXISTS alerts (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    stock_code      TEXT NOT NULL,
    line_id         UUID REFERENCES lines(id) ON DELETE SET NULL,
    signal_type     TEXT,
    current_price   DOUBLE PRECISION,
    target_price    DOUBLE PRECISION,
    distance_pct    DOUBLE PRECISION,
    user_id         TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_alerts_line ON alerts(line_id);
CREATE INDEX IF NOT EXISTS idx_alerts_user ON alerts(user_id);

-- 푸시 구독
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    endpoint    TEXT NOT NULL UNIQUE,
    p256dh      TEXT NOT NULL,
    auth        TEXT NOT NULL,
    user_id     TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_push_user ON push_subscriptions(user_id);

-- 앱 설정 (토큰 영속화 등)
CREATE TABLE IF NOT EXISTS app_settings (
    key         TEXT PRIMARY KEY,
    value       TEXT,
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 포지션 (매매 관리)
CREATE TABLE IF NOT EXISTS positions (
    id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    stock_code     TEXT NOT NULL,
    user_id        TEXT,
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

-- 포지션-선 연결 (1:N)
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

-- 터치 이벤트 (선 vs 가격 접촉 기록)
CREATE TABLE IF NOT EXISTS touch_events (
    id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    line_id           UUID NOT NULL REFERENCES lines(id) ON DELETE CASCADE,
    stock_code        TEXT NOT NULL,
    user_id           TEXT,
    touched_at        TIMESTAMPTZ DEFAULT NOW(),
    price_at_touch    DOUBLE PRECISION NOT NULL,
    volume_at_touch   BIGINT,
    volume_avg_20     BIGINT,
    peak_after_touch  DOUBLE PRECISION,     -- N캔들 후 종가
    pct_move          DOUBLE PRECISION,     -- (N캔들 후 종가 - 터치가) / 터치가 × 100
    result            TEXT DEFAULT 'pending', -- 'pending' | 'bounce' | 'break' | 'neutral'
    judged_at         TIMESTAMPTZ,          -- 결과 판정 시각
    n_candles         INT,                  -- 판정에 사용된 N캔들 수
    created_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_touch_line ON touch_events(line_id);
CREATE INDEX IF NOT EXISTS idx_touch_stock ON touch_events(stock_code);
CREATE INDEX IF NOT EXISTS idx_touch_result ON touch_events(result);
CREATE INDEX IF NOT EXISTS idx_touch_pending ON touch_events(result) WHERE result = 'pending';
