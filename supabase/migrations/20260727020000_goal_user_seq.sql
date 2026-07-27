-- 목표 URL을 /Goal/<uuid>에서 /Goal/2 로 줄이기 위한 사용자별 일련번호.
--
-- id(uuid)는 그대로 기본키로 두고, seq는 표시·조회용 보조 키다.
-- 사용자마다 1부터 시작하며 제목을 바꿔도 변하지 않는다.

alter table public.goals
  add column if not exists seq integer;

comment on column public.goals.seq is
  '사용자별 1부터의 일련번호. /Goal/<seq> URL에 쓰인다. 삭제한 번호는 재사용하지 않으므로 중간이 빌 수 있다.';

-- ─────────────────────────────────────────────────────────────
-- 기존 행 백필: 사용자별로 생성 순서대로 1, 2, 3…
-- ─────────────────────────────────────────────────────────────
with numbered as (
  select
    id,
    row_number() over (partition by user_id order by created_at, id) as n
  from public.goals
  where seq is null
)
update public.goals g
set seq = numbered.n
from numbered
where g.id = numbered.id;

alter table public.goals
  alter column seq set not null;

-- URL이 곧 (user_id, seq) 조회다. 유니크가 정확성이자 인덱스다.
alter table public.goals
  drop constraint if exists goals_user_seq_key;

alter table public.goals
  add constraint goals_user_seq_key unique (user_id, seq);

-- ─────────────────────────────────────────────────────────────
-- 신규 행에 번호 자동 부여
--
-- SECURITY DEFINER: 호출자 RLS와 무관하게 그 사용자의 실제 최대값을 본다.
-- 동시 삽입이 겹치면 위 유니크 제약이 걸러낸다(조용히 덮어쓰지 않는다).
-- ─────────────────────────────────────────────────────────────
create or replace function public.assign_goal_seq()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.seq is null then
    select coalesce(max(g.seq), 0) + 1
      into new.seq
      from public.goals g
     where g.user_id = new.user_id;
  end if;
  return new;
end;
$$;

revoke all on function public.assign_goal_seq() from public;

drop trigger if exists goals_assign_seq on public.goals;

create trigger goals_assign_seq
  before insert on public.goals
  for each row
  execute function public.assign_goal_seq();
