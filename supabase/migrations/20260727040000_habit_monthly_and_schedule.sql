-- 습관의 반복 주기를 daily / weekly / monthly 세 가지로 정리한다.
--
--   daily   — 매일 체크.
--   weekly  — 주당 frequency_count회. 선택적으로 요일을 지정할 수 있다(scheduled_days).
--   monthly — 매달 scheduled_day_of_month일에 한 번. 날짜 지정은 필수.
--
-- 로그 스키마(daily_habit_logs)는 손대지 않는다. monthly도 "체크한 실제 날짜"로
-- 한 건 남기고, 그 달에 로그가 1건이라도 있으면 그 달을 완료로 본다. UNIQUE(habit_id,
-- done_on)가 이미 하루 중복을 막아 주므로 추가 제약이 필요 없다.

-- ─────────────────────────────────────────────────────────────
-- 1) 새 컬럼
-- ─────────────────────────────────────────────────────────────
alter table public.daily_habits
  add column if not exists scheduled_days smallint[];

alter table public.daily_habits
  add column if not exists scheduled_day_of_month smallint;

comment on column public.daily_habits.scheduled_days is
  'weekly 전용. ISO 요일 번호(1=월 … 7=일). null이면 요일을 정하지 않은 것으로, '
  '주당 횟수만 채우면 된다. 개수가 frequency_count와 달라도 허용한다.';

comment on column public.daily_habits.scheduled_day_of_month is
  'monthly 전용. 1~31. 그 달에 없는 날짜(예: 2월 31일)면 그 달 말일로 당겨 쓴다.';

-- ─────────────────────────────────────────────────────────────
-- 2) scheduled_days 원소 검증
--
-- CHECK에는 서브쿼리를 쓸 수 없어 중복 검사를 IMMUTABLE 함수로 뺀다.
-- ─────────────────────────────────────────────────────────────
create or replace function public.is_distinct_weekday_array(days smallint[])
returns boolean
language sql
immutable
parallel safe
as $$
  select days is null
      or cardinality(days) = (select count(distinct d) from unnest(days) d);
$$;

revoke all on function public.is_distinct_weekday_array(smallint[]) from public;
grant execute on function public.is_distinct_weekday_array(smallint[]) to authenticated;

alter table public.daily_habits
  drop constraint if exists daily_habits_scheduled_days_valid;

alter table public.daily_habits
  add constraint daily_habits_scheduled_days_valid check (
    scheduled_days is null
    or (
      cardinality(scheduled_days) between 1 and 7
      and scheduled_days <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]
      and public.is_distinct_weekday_array(scheduled_days)
    )
  );

-- ─────────────────────────────────────────────────────────────
-- 3) 주기별 필드 조합 제약
--
-- 타입마다 쓰는 필드가 정해져 있고, 나머지는 null이어야 한다.
-- 기존 행(daily/weekly, 새 컬럼 모두 null)은 그대로 통과한다.
-- ─────────────────────────────────────────────────────────────
alter table public.daily_habits
  drop constraint if exists daily_habits_frequency_valid;

alter table public.daily_habits
  add constraint daily_habits_frequency_valid check (
    (
      frequency_type = 'daily'
      and frequency_count = 1
      and scheduled_days is null
      and scheduled_day_of_month is null
    )
    or (
      frequency_type = 'weekly'
      and frequency_count between 1 and 7
      and scheduled_day_of_month is null
    )
    or (
      frequency_type = 'monthly'
      and frequency_count = 1
      and scheduled_days is null
      and scheduled_day_of_month between 1 and 31
    )
  );

comment on column public.daily_habits.frequency_type is
  'daily = 매일 체크, weekly = 주당 frequency_count회, monthly = 매달 1회.';
comment on column public.daily_habits.frequency_count is
  'weekly일 때 주당 목표 횟수. daily/monthly일 때는 항상 1.';
