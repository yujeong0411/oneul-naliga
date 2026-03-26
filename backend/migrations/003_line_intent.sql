-- 마이그레이션: lines 테이블에 intent 컬럼 추가
-- Supabase SQL Editor에서 실행

ALTER TABLE lines ADD COLUMN IF NOT EXISTS intent TEXT DEFAULT NULL;
-- 'buy' | 'sell' | 'stop' | 'watch'
