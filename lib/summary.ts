// 주간 요약. 홈 대시보드 카드와 /Summary가 같은 값을 본다.
//
// 계산은 새로 만들지 않는다. 습관 준수율은 습관 카드·목표 진행률이 쓰는
// habitRatio를 이번 주/지난주 구간으로 두 번 돌린 것이고, 목표 진행률은
// goalProgress 그대로다. 요약에서만 다른 기준으로 세면 화면끼리 숫자가 어긋난다.
//
// 기준은 넷 다 같다: 월요일로 끊은 이번 주 vs 지난주.
//   습관·지출 — 원본 기록(로그·내역)이 남아 있어 지난주를 다시 계산할 수 있다.
//   목표      — 진행률이 저장되지 않으므로 goal_progress_snapshots를 본다.
//               스냅샷은 앱을 연 날에만 쌓이니 "지난주 일요일 이전의 가장 최근 점"을
//               기준선으로 쓰고, 그것도 없으면 null(= 데이터 쌓는 중)이다.

import type { SupabaseClient } from "@supabase/supabase-js";
import { dateOf, laterDate, shiftDay, weekStart } from "@/lib/date";
import {
  ASSIGNMENT_SELECT,
  GOAL_SELECT,
  type Assignment,
  type Goal,
  goalProgress,
  groupByGoal,
} from "@/lib/goals";
import {
  HABIT_SELECT,
  type Habit,
  type HabitLog,
  EMPTY_DATES,
  datesByHabit,
  habitRatio,
  monthlyProgress,
  periodBetween,
} from "@/lib/habits";

/**
 * 요약이 쓰는 네 날짜. 조회와 계산이 같은 경계를 봐야 하므로 한 곳에서 만든다.
 * 주는 월요일에 시작한다(lib/date의 weekStart).
 */
export function weekBounds(today: string) {
  const start = weekStart(today);
  return {
    start,
    end: shiftDay(start, 6),
    lastStart: shiftDay(start, -7),
    lastEnd: shiftDay(start, -1),
  };
}

/** "+3%p" / "-2%p". 0은 부호 없이 "0%p". */
export const signedPp = (v: number) =>
  `${v > 0 ? "+" : ""}${Math.round(v)}%p`;

export type GoalDelta = {
  id: string;
  seq: number;
  title: string;
  /** 오늘 기준 진행률 0~100. */
  pct: number;
  /** 지난주 대비 %p. 기준선 스냅샷이 없으면 null. */
  deltaPp: number | null;
};

export type WeeklySummary = {
  /** 이번 주 월~일. */
  week: { start: string; end: string };
  habit: {
    /** 이번 주 준수율 평균 0~100. 평가할 습관이 없으면 null. */
    rate: number | null;
    /** 지난주 대비 %p. 지난주에 평가할 습관이 없었으면 null. */
    deltaPp: number | null;
    /** 평균에 들어간 습관 수. */
    count: number;
  };
  /** 이번 주에 완료 체크한 과제 수. */
  tasksDone: number;
  spend: {
    /** 이번 주 지출 합계. */
    total: number;
    /** 지난주 대비 변화율 %. 지난주 지출이 0이면 null. */
    changePct: number | null;
  };
  goals: GoalDelta[];
  /** 목표 비교의 기준선이 하나라도 있는가. false면 "데이터 쌓는 중". */
  goalsComparable: boolean;
};

type Row = {
  goals: Goal[];
  assignments: (Assignment & { completed_at: string | null })[];
  habits: Habit[];
  logs: HabitLog[];
  spend: { amount: number; entry_date: string }[];
  /** taken_on이 기준일 이전인 스냅샷. 최신순. */
  baselines: { goal_id: string; taken_on: string; progress: number }[];
};

/**
 * 한 습관의 구간 준수율 0~1. 평가 대상이 아니면 null.
 *
 * 대상이 아닌 경우가 둘 있고, 둘 다 0으로 세면 평균이 부당하게 깎인다:
 *   - 구간이 끝난 뒤에 만든 습관 (그때는 존재하지도 않았다)
 *   - 월간 습관인데 그 구간에 예정일이 없다 (아직 차례가 아니다)
 */
function ratioIn(
  habit: Habit,
  dates: ReadonlySet<string>,
  start: string,
  end: string
): number | null {
  const created = dateOf(habit.created_at);
  if (created > end) return null;
  const period = periodBetween(laterDate(created, start), end);
  if (period.days <= 0) return null;
  if (
    habit.frequency_type === "monthly" &&
    monthlyProgress(habit, dates, period).due === 0
  ) {
    return null;
  }
  return habitRatio(habit, dates, period);
}

/** 구간 준수율 평균 0~100. 평가할 습관이 없으면 null. */
function averageRate(
  habits: readonly Habit[],
  byHabit: Map<string, Set<string>>,
  start: string,
  end: string
): { rate: number | null; count: number } {
  let sum = 0;
  let count = 0;
  for (const h of habits) {
    const r = ratioIn(h, byHabit.get(h.id) ?? EMPTY_DATES, start, end);
    if (r === null) continue;
    sum += r;
    count++;
  }
  return { rate: count === 0 ? null : (sum / count) * 100, count };
}

/** 조회 결과 → 요약. 순수 함수라 값만 바꿔가며 확인할 수 있다. */
export function buildWeeklySummary(rows: Row, today: string): WeeklySummary {
  const { start, end, lastStart, lastEnd } = weekBounds(today);

  const byHabit = datesByHabit(rows.logs);

  // 이번 주는 아직 진행 중이다. 오지 않은 날까지 분모에 넣으면 준수율이 깎인다.
  const thisWeek = averageRate(rows.habits, byHabit, start, today);
  const lastWeek = averageRate(rows.habits, byHabit, lastStart, lastEnd);

  let tasksDone = 0;
  for (const a of rows.assignments) {
    if (a.completed_at && a.completed_at >= start && a.completed_at <= end) {
      tasksDone++;
    }
  }

  let total = 0;
  let lastTotal = 0;
  for (const e of rows.spend) {
    if (e.entry_date >= start && e.entry_date <= end) total += Number(e.amount);
    else if (e.entry_date >= lastStart && e.entry_date <= lastEnd) {
      lastTotal += Number(e.amount);
    }
  }

  // 목표당 기준선 하나 — 지난주 안(또는 그 이전)의 가장 최근 점.
  // baselines가 최신순으로 오므로 목표별로 처음 만난 것이 곧 그 점이다.
  const baseline = new Map<string, number>();
  for (const s of rows.baselines) {
    if (s.taken_on > lastEnd) continue;
    if (!baseline.has(s.goal_id)) baseline.set(s.goal_id, Number(s.progress));
  }

  const linkedByGoal = groupByGoal(rows.assignments);
  const habitsByGoal = groupByGoal(rows.habits);
  const goals = rows.goals
    .map((g) => {
      const { pct } = goalProgress({
        goal: g,
        tasks: linkedByGoal.get(g.id),
        habits: habitsByGoal.get(g.id),
        datesByHabit: byHabit,
        today,
      });
      const base = baseline.get(g.id);
      return {
        id: g.id,
        seq: g.seq,
        title: g.title,
        pct,
        deltaPp: base === undefined ? null : pct - base,
      };
    })
    .sort((a, b) => (b.deltaPp ?? -Infinity) - (a.deltaPp ?? -Infinity));

  return {
    week: { start, end },
    habit: {
      rate: thisWeek.rate,
      deltaPp:
        thisWeek.rate === null || lastWeek.rate === null
          ? null
          : thisWeek.rate - lastWeek.rate,
      count: thisWeek.count,
    },
    tasksDone,
    spend: {
      total,
      changePct: lastTotal === 0 ? null : ((total - lastTotal) / lastTotal) * 100,
    },
    goals,
    goalsComparable: baseline.size > 0,
  };
}

/**
 * 요약에 필요한 것을 한 번에 읽어 계산한다. 홈과 /Summary가 이 함수 하나를 쓴다.
 *
 * 로그는 기간을 자르지 않는다. 목표 진행률이 "목표를 만든 날부터"를 분모로 쓰기
 * 때문이다 (대시보드가 이미 같은 이유로 전체를 읽는다).
 */
export async function loadWeeklySummary(
  supabase: SupabaseClient,
  userId: string,
  today: string
): Promise<WeeklySummary | null> {
  const { end, lastStart, lastEnd } = weekBounds(today);

  const [g, a, h, l, b, s] = await Promise.all([
    supabase.from("goals").select(GOAL_SELECT).eq("user_id", userId),
    supabase
      .from("assignments")
      .select(`${ASSIGNMENT_SELECT}, completed_at`)
      .eq("user_id", userId),
    supabase.from("daily_habits").select(HABIT_SELECT).eq("user_id", userId),
    supabase
      .from("daily_habit_logs")
      .select("habit_id, done_on")
      .eq("user_id", userId),
    supabase
      .from("budget_entries")
      .select("amount, entry_date")
      .eq("user_id", userId)
      .eq("type", "expense")
      .gte("entry_date", lastStart)
      .lte("entry_date", end),
    // 기준선은 지난주 일요일까지. 그 주에 앱을 안 열었을 수 있어 이전까지 훑는다.
    supabase
      .from("goal_progress_snapshots")
      .select("goal_id, taken_on, progress")
      .eq("user_id", userId)
      .lte("taken_on", lastEnd)
      .order("taken_on", { ascending: false }),
  ]);

  if (g.error || a.error || h.error || l.error || b.error || s.error) return null;

  return buildWeeklySummary(
    {
      goals: (g.data as Goal[]) ?? [],
      assignments:
        (a.data as (Assignment & { completed_at: string | null })[]) ?? [],
      habits: (h.data as Habit[]) ?? [],
      logs: (l.data as HabitLog[]) ?? [],
      spend: (b.data as { amount: number; entry_date: string }[]) ?? [],
      baselines:
        (s.data as { goal_id: string; taken_on: string; progress: number }[]) ??
        [],
    },
    today
  );
}
