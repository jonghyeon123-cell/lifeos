-- 달성한 목표를 모아 보여주는 Achievement 페이지를 위한 완료 시점 기록.
--
-- 진행률은 DB에 없다. goalProgress()가 연결된 과제·습관·로그로 렌더 시점에
-- 계산한다. 그래서 "100%가 되는 순간"을 잡는 DB 트리거를 둘 수 없다.
-- (트리거로 하려면 습관 달성률 계산을 SQL로 통째로 복제해야 하고
--  진실의 원천이 둘로 갈린다.)
--
-- 대신 화면이 진행률을 계산한 직후 이 컬럼을 맞춘다:
--   달성인데 값이 없으면  → 오늘 날짜
--   달성이 아닌데 값이 있으면 → null
-- 따라서 기록되는 날짜는 "100%가 된 날"이 아니라 "앱이 그것을 처음 확인한 날"이다.

alter table public.goals
  add column if not exists completed_at date;

comment on column public.goals.completed_at is
  '달성을 확인한 날짜. null이면 진행 중. 진행률이 100% 아래로 떨어지면 다시 null이 된다.';

-- Achievement 페이지는 "내 목표 중 completed_at이 있는 것을 최신순"으로만 읽는다.
create index if not exists goals_completed_at_idx
  on public.goals (user_id, completed_at desc)
  where completed_at is not null;
