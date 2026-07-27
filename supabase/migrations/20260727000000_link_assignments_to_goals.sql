-- 목표(goals)를 과제(assignments)의 상위 컨테이너로 만드는 마이그레이션.
--
-- 배경: 목표는 tasks jsonb 배열에 자체 할 일을 들고 있었고, assignments 테이블은
-- 그와 완전히 같은 구조를 별도로 갖고 있었다. 이 마이그레이션은 assignments를
-- 유일한 "할 일" 저장소로 만들고, goals는 그것을 묶는 컨테이너 역할만 하게 한다.
--
-- goals.tasks 컬럼은 롤백 안전망으로 남겨둔다. 애플리케이션 코드는 더 이상
-- 읽지도 쓰지도 않으며, 검증 후 별도 마이그레이션에서 drop 한다.

-- ─────────────────────────────────────────────────────────────
-- 1) assignments.goal_id — 과제는 최대 1개 목표에 연결 (1:N)
-- ─────────────────────────────────────────────────────────────
alter table public.assignments
  add column if not exists goal_id uuid
    references public.goals (id) on delete set null;

comment on column public.assignments.goal_id is
  '연결된 목표. null이면 목표에 속하지 않은 독립 과제. 목표 삭제 시 연결만 해제된다.';

-- 목표 상세에서 "이 목표에 연결된 과제" 조회가 핵심 경로다.
create index if not exists assignments_goal_id_idx
  on public.assignments (goal_id)
  where goal_id is not null;

-- ─────────────────────────────────────────────────────────────
-- 2) goals.manual_progress — 연결된 과제가 0개일 때의 fallback
-- ─────────────────────────────────────────────────────────────
alter table public.goals
  add column if not exists manual_progress smallint not null default 0;

alter table public.goals
  drop constraint if exists goals_manual_progress_range;

alter table public.goals
  add constraint goals_manual_progress_range
    check (manual_progress between 0 and 100);

comment on column public.goals.manual_progress is
  '수동 진행률(0-100). 연결된 과제가 하나도 없을 때만 사용된다. 과제가 하나라도 연결되면 완료 비율이 우선한다.';

-- ─────────────────────────────────────────────────────────────
-- 3) goal_id 소유권 검증
--
-- assignments의 RLS with_check는 user_id만 검사하므로, 남의 목표 id를 알아내면
-- 자기 과제를 그 목표에 붙일 수 있다(IDOR). FK만으로는 막을 수 없어 트리거로 막는다.
-- SECURITY DEFINER: 호출자 RLS와 무관하게 실제 소유 관계를 결정적으로 검사한다.
-- ─────────────────────────────────────────────────────────────
create or replace function public.enforce_assignment_goal_owner()
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

revoke all on function public.enforce_assignment_goal_owner() from public;

drop trigger if exists assignments_goal_owner_check on public.assignments;

create trigger assignments_goal_owner_check
  before insert or update of goal_id, user_id on public.assignments
  for each row
  execute function public.enforce_assignment_goal_owner();

-- ─────────────────────────────────────────────────────────────
-- 4) 데이터 이관: goals.tasks jsonb → assignments 행
--
-- tasks 원소 형태: {"id": uuid, "text": string, "done": boolean}
-- 재실행 안전: 이미 연결된 과제가 있는 목표는 건너뛴다. goal_id는 이 마이그레이션에서
-- 처음 생기는 컬럼이므로 최초 실행 시에는 어떤 목표도 걸러지지 않는다.
-- ─────────────────────────────────────────────────────────────
insert into public.assignments (user_id, title, completed, goal_id, created_at, updated_at)
select
  g.user_id,
  coalesce(nullif(btrim(t.value ->> 'text'), ''), '(제목 없음)'),
  coalesce((t.value ->> 'done')::boolean, false),
  g.id,
  g.created_at,
  now()
from public.goals g
cross join lateral jsonb_array_elements(g.tasks) as t (value)
where jsonb_typeof(g.tasks) = 'array'
  and jsonb_typeof(t.value) = 'object'
  and not exists (
    select 1
    from public.assignments a
    where a.goal_id = g.id
  );
