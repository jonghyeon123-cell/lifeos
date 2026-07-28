// buildWeeklySummary 자체 점검. 실행: npx tsx scripts/summary-check.ts
//
// 조용히 틀리기 쉬운 것만 본다: 평균에서 빼야 할 습관을 뺐는가, 기준선을
// 제대로 골랐는가, 주 경계를 정확히 잘랐는가.

import assert from "node:assert/strict";
import { buildWeeklySummary, weekBounds } from "../lib/summary";
import type { Goal, Assignment } from "../lib/goals";
import type { Habit, HabitLog } from "../lib/habits";

// 2026-07-28은 화요일 → 이번 주 07-27(월)~08-02(일), 지난주 07-20~07-26.
const TODAY = "2026-07-28";

const habit = (over: Partial<Habit>): Habit => ({
  id: "h",
  title: "h",
  frequency_type: "daily",
  frequency_count: 1,
  scheduled_days: null,
  scheduled_day_of_month: null,
  goal_id: null,
  created_at: "2026-01-01T00:00:00Z",
  ...over,
});

const assignment = (over: Partial<Assignment>): Assignment => ({
  id: "a",
  title: "a",
  course: null,
  due_date: null,
  due_time: null,
  completed: false,
  goal_id: null,
  created_at: "2026-01-01T00:00:00Z",
  ...over,
});

const empty = {
  goals: [] as Goal[],
  assignments: [] as (Assignment & { completed_at: string | null })[],
  habits: [] as Habit[],
  logs: [] as HabitLog[],
  spend: [] as { amount: number; entry_date: string }[],
  baselines: [] as { goal_id: string; taken_on: string; progress: number }[],
};

// 주 경계 — 넷 다 이 경계를 쓴다.
{
  const b = weekBounds(TODAY);
  assert.deepEqual(b, {
    start: "2026-07-27",
    end: "2026-08-02",
    lastStart: "2026-07-20",
    lastEnd: "2026-07-26",
  });
  const s = buildWeeklySummary(empty, TODAY);
  assert.equal(s.week.start, b.start);
  assert.equal(s.week.end, b.end);
}

// 준수율: 이번 주는 오늘까지가 분모다. 월~화 이틀 중 하루 체크 = 50%.
{
  const s = buildWeeklySummary(
    {
      ...empty,
      habits: [habit({ id: "d" })],
      logs: [{ habit_id: "d", done_on: "2026-07-27" }],
    },
    TODAY
  );
  assert.equal(s.habit.count, 1);
  assert.equal(Math.round(s.habit.rate!), 50);
}

// 구간이 끝난 뒤에 만든 습관은 지난주 평균에 끼지 않는다 → 비교 자체가 null.
{
  const s = buildWeeklySummary(
    {
      ...empty,
      habits: [habit({ id: "new", created_at: "2026-07-27T00:00:00Z" })],
      logs: [{ habit_id: "new", done_on: "2026-07-27" }],
    },
    TODAY
  );
  assert.equal(s.habit.count, 1);
  assert.equal(s.habit.deltaPp, null);
}

// 이번 주에 예정일이 없는 월간 습관은 평균에서 빠진다 (0%로 세면 부당하다).
{
  const s = buildWeeklySummary(
    {
      ...empty,
      habits: [
        habit({
          id: "m",
          frequency_type: "monthly",
          scheduled_day_of_month: 15, // 07-27~07-28 구간 밖
        }),
      ],
    },
    TODAY
  );
  assert.equal(s.habit.count, 0);
  assert.equal(s.habit.rate, null);
}

// 과제는 completed_at이 이번 주 안일 때만 센다.
{
  const s = buildWeeklySummary(
    {
      ...empty,
      assignments: [
        { ...assignment({ id: "1" }), completed_at: "2026-07-28" },
        { ...assignment({ id: "2" }), completed_at: "2026-07-26" }, // 지난주
        { ...assignment({ id: "3" }), completed_at: null },
      ],
    },
    TODAY
  );
  assert.equal(s.tasksDone, 1);
}

// 지출: 이번 주 합계와 지난주 대비 변화율.
{
  const s = buildWeeklySummary(
    {
      ...empty,
      spend: [
        { amount: 3000, entry_date: "2026-07-27" },
        { amount: 1000, entry_date: "2026-07-28" },
        { amount: 2000, entry_date: "2026-07-22" }, // 지난주
      ],
    },
    TODAY
  );
  assert.equal(s.spend.total, 4000);
  assert.equal(s.spend.changePct, 100);
}

// 지난주 지출이 0이면 변화율은 없다 (0으로 나누지 않는다).
{
  const s = buildWeeklySummary(
    { ...empty, spend: [{ amount: 500, entry_date: "2026-07-27" }] },
    TODAY
  );
  assert.equal(s.spend.total, 500);
  assert.equal(s.spend.changePct, null);
}

// 이번 주에 찍힌 스냅샷은 기준선이 아니다 (지난주 일요일까지만).
{
  const goal: Goal = {
    id: "g0",
    seq: 0,
    title: "g",
    memo: null,
    completed: false,
    due_date: null,
    manual_progress: 40,
    completed_at: null,
    created_at: "2026-01-01T00:00:00Z",
  };
  const s = buildWeeklySummary(
    {
      ...empty,
      goals: [goal],
      baselines: [
        { goal_id: "g0", taken_on: "2026-07-27", progress: 39 }, // 이번 주 월요일
        { goal_id: "g0", taken_on: "2026-07-26", progress: 30 }, // 지난주 일요일
      ],
    },
    TODAY
  );
  assert.equal(s.goals[0].deltaPp, 10);
}

// 목표 기준선: 여러 스냅샷 중 가장 최근 것 하나만 쓴다.
{
  const goal: Goal = {
    id: "g1",
    seq: 1,
    title: "g",
    memo: null,
    completed: false,
    due_date: null,
    manual_progress: 40,
    completed_at: null,
    created_at: "2026-01-01T00:00:00Z",
  };
  const s = buildWeeklySummary(
    {
      ...empty,
      goals: [goal],
      baselines: [
        { goal_id: "g1", taken_on: "2026-07-21", progress: 25 },
        { goal_id: "g1", taken_on: "2026-07-10", progress: 5 },
      ],
    },
    TODAY
  );
  assert.equal(s.goals[0].pct, 40);
  assert.equal(s.goals[0].deltaPp, 15);
  assert.equal(s.goalsComparable, true);
}

// 기준선이 없으면 비교하지 않는다 → 화면은 "데이터 쌓는 중".
{
  const goal: Goal = {
    id: "g2",
    seq: 2,
    title: "g",
    memo: null,
    completed: false,
    due_date: null,
    manual_progress: 10,
    completed_at: null,
    created_at: "2026-01-01T00:00:00Z",
  };
  const s = buildWeeklySummary({ ...empty, goals: [goal] }, TODAY);
  assert.equal(s.goals[0].deltaPp, null);
  assert.equal(s.goalsComparable, false);
}

console.log("summary-check: ok");
