-- daily_habits_frequency_valid의 monthly 분기가 NULL을 걸러내지 못하던 것을 고친다.
--
-- CHECK 제약은 결과가 FALSE일 때만 위반이고 NULL이면 통과시킨다.
-- scheduled_day_of_month가 null이면 `between 1 and 31`이 NULL을 내므로
-- monthly 분기 전체가 NULL이 되고, 다른 분기는 FALSE라 최종 결과가
-- FALSE OR FALSE OR NULL = NULL → 통과해 버렸다.
--
-- `is not null`을 앞에 두면 그 분기가 FALSE로 확정되어(FALSE AND NULL = FALSE)
-- 최종 결과도 FALSE가 된다. 즉 monthly는 날짜 없이 저장할 수 없다.

-- 제약이 없던 사이에 들어간 잘못된 행을 먼저 정리한다.
delete from public.daily_habits
where frequency_type = 'monthly' and scheduled_day_of_month is null;

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
      and scheduled_day_of_month is not null
      and scheduled_day_of_month between 1 and 31
    )
  );
