-- 목표 진행률의 하루 한 점.
--
-- 진행률은 DB에 없다. goalProgress()가 연결된 과제·습관·로그로 렌더 시점에
-- 계산한다(goals.completed_at 마이그레이션 참고). 그래서 "지난주 대비 +N%p"를
-- 구하려면 그때그때의 계산 결과를 남겨두는 수밖에 없다.
--
-- 쓰는 쪽은 크론이 아니라 화면이다. 홈 대시보드와 /Goal이 이미 모든 목표의
-- 진행률을 계산하므로, 그 값을 오늘 날짜로 upsert 한다. 그날 앱을 한 번도
-- 열지 않으면 그날 점은 없다 — 비교하는 쪽이 "7일 전 이전의 가장 최근 점"을
-- 찾도록 만들어 빈 날을 견딘다.

create table if not exists public.goal_progress_snapshots (
  goal_id  uuid not null references public.goals(id) on delete cascade,
  user_id  uuid not null references auth.users(id) on delete cascade,
  taken_on date not null,
  -- 0~100. 표기(formatPct)와 같은 소수점 3자리까지 남긴다.
  progress numeric(6, 3) not null check (progress >= 0 and progress <= 100),
  -- 같은 날 여러 번 열어도 마지막 계산으로 덮어쓴다.
  primary key (goal_id, taken_on)
);

comment on table public.goal_progress_snapshots is
  '목표 진행률의 일별 기록. 주간 요약의 "지난주 대비" 비교에 쓴다.';

-- 요약은 "내 스냅샷 중 특정 날짜 구간"만 읽는다.
create index if not exists goal_progress_snapshots_user_date_idx
  on public.goal_progress_snapshots (user_id, taken_on);

alter table public.goal_progress_snapshots enable row level security;

create policy "Users can view their own goal snapshots"
  on public.goal_progress_snapshots for select
  using (auth.uid() = user_id);

create policy "Users can insert their own goal snapshots"
  on public.goal_progress_snapshots for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own goal snapshots"
  on public.goal_progress_snapshots for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update on public.goal_progress_snapshots to authenticated;
