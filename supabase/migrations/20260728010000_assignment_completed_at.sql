-- 과제를 완료한 날짜.
--
-- 주간 요약의 "이번 주 완료한 과제 N개"에 필요하다. updated_at으로 대신하면
-- 예전에 끝낸 과제의 제목만 고쳐도 이번 주 완료로 잡힌다.
--
-- goals.completed_at과 같은 규칙: 완료를 켜면 그날 날짜, 끄면 다시 null.
-- 따라서 "완료한 날"이 아니라 "완료 체크를 누른 날"이다.

alter table public.assignments
  add column if not exists completed_at date;

comment on column public.assignments.completed_at is
  '완료 체크를 누른 날짜. null이면 미완료. 완료를 해제하면 다시 null이 된다.';

-- 이미 완료된 과제는 언제 끝냈는지 알 수 없다. 소급하지 않고 null로 둔다
-- (이번 주 집계에 잡히지 않는 편이, 오늘 끝낸 것처럼 보이는 것보다 낫다).

create index if not exists assignments_completed_at_idx
  on public.assignments (user_id, completed_at)
  where completed_at is not null;
