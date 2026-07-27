-- 습관(daily_habits)에 반복 주기와 목표 연결을 추가한다.
--
-- 세 개념의 역할 분리:
--   과제(assignments)   — 일회성. 체크 한 번 = 완료.
--   습관(daily_habits)  — 반복. 매일 또는 주 N회. 날짜별 로그로 리셋된다.
--   목표(goals)         — 둘을 담는 컨테이너. 진행률은 연결된 항목들의 평균.
--
-- 체크 기록은 이미 daily_habit_logs(habit_id, done_on)에 날짜별로 쌓이고
-- UNIQUE(habit_id, done_on)로 하루 중복이 막혀 있다. weekly도 같은 테이블에서
-- "해당 주 범위의 행 개수"로 계산되므로 로그 스키마는 손대지 않는다.

-- ─────────────────────────────────────────────────────────────
-- 1) 반복 주기
-- ─────────────────────────────────────────────────────────────
alter table public.daily_habits
  add column if not exists frequency_type text not null default 'daily';

alter table public.daily_habits
  add column if not exists frequency_count smallint not null default 1;

-- daily는 횟수 개념이 없으므로 1로 못박는다. weekly만 1~7회를 허용한다.
alter table public.daily_habits
  drop constraint if exists daily_habits_frequency_valid;

alter table public.daily_habits
  add constraint daily_habits_frequency_valid check (
    (frequency_type = 'daily' and frequency_count = 1)
    or (frequency_type = 'weekly' and frequency_count between 1 and 7)
  );

comment on column public.daily_habits.frequency_type is
  'daily = 매일 체크, weekly = 주당 frequency_count회 체크.';
comment on column public.daily_habits.frequency_count is
  'weekly일 때 주당 목표 횟수. daily일 때는 항상 1.';

-- ─────────────────────────────────────────────────────────────
-- 2) 목표 연결 (과제와 동일하게 nullable, 목표 삭제 시 연결만 해제)
-- ─────────────────────────────────────────────────────────────
alter table public.daily_habits
  add column if not exists goal_id uuid
    references public.goals (id) on delete set null;

comment on column public.daily_habits.goal_id is
  '연결된 목표. null이면 목표에 속하지 않은 독립 습관. 목표 삭제 시 연결만 해제된다.';

create index if not exists daily_habits_goal_id_idx
  on public.daily_habits (goal_id)
  where goal_id is not null;

-- ─────────────────────────────────────────────────────────────
-- 3) 소유권 검증을 두 테이블이 공유하도록 일반화
--
-- 기존 enforce_assignment_goal_owner()는 new.goal_id / new.user_id만 참조해
-- 이미 테이블 비의존적이다. 이름만 일반화해 daily_habits에도 붙인다.
-- RLS with_check는 user_id만 검사하므로 남의 목표에 붙이는 IDOR을 막으려면
-- 이 트리거가 필요하다.
-- ─────────────────────────────────────────────────────────────
create or replace function public.enforce_goal_link_owner()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.goal_id is not null
     and not exists (
       select 1
       from public.goals g
       where g.id = new.goal_id
         and g.user_id = new.user_id
     )
  then
    raise exception 'goal_id % does not belong to the owning user', new.goal_id
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_goal_link_owner() from public;

-- 기존 트리거를 새 함수로 갈아끼우고 구 함수를 정리한다.
drop trigger if exists assignments_goal_owner_check on public.assignments;
drop function if exists public.enforce_assignment_goal_owner();

create trigger assignments_goal_owner_check
  before insert or update of goal_id, user_id on public.assignments
  for each row
  execute function public.enforce_goal_link_owner();

drop trigger if exists daily_habits_goal_owner_check on public.daily_habits;

create trigger daily_habits_goal_owner_check
  before insert or update of goal_id, user_id on public.daily_habits
  for each row
  execute function public.enforce_goal_link_owner();
