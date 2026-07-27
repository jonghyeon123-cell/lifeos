// 목표(Goal)와 과제(Assignment)의 공용 타입·쿼리 상수·진행률 계산.
//
// 역할 분리:
//   목표(Goal)        — 장기적 방향성. 여러 과제를 담는 상위 컨테이너.
//   과제(Assignment)  — 단발성 작업. 최대 1개 목표에 연결(goal_id, nullable).
//
// 목표는 더 이상 자체 할 일 목록(구 goals.tasks jsonb)을 갖지 않는다.

import { dateOf, laterDate } from "@/lib/date";
import {
  EMPTY_DATES,
  type Habit,
  habitRatio,
  periodBetween,
} from "@/lib/habits";

export type Goal = {
  id: string;
  /** 사용자별 1부터의 번호. /Goal/<seq> URL에 쓴다. 제목을 바꿔도 변하지 않는다. */
  seq: number;
  title: string;
  memo: string | null;
  completed: boolean;
  due_date: string | null;
  manual_progress: number;
  /** 달성을 확인한 날짜. null이면 진행 중. */
  completed_at: string | null;
  created_at: string;
};

export type Assignment = {
  id: string;
  title: string;
  course: string | null;
  due_date: string | null;
  due_time: string | null;
  completed: boolean;
  goal_id: string | null;
  created_at: string;
};

export const GOAL_SELECT =
  "id, seq, title, memo, completed, due_date, manual_progress, completed_at, created_at";

/** 연결 드롭다운과 "목표 보기" 링크에 쓰이는 목표의 최소 형태. */
export type GoalOption = {
  id: string;
  seq: number;
  title: string;
  completed: boolean;
};

export const GOAL_OPTION_SELECT = "id, seq, title, completed";

/** 목표 상세 경로. seq는 사용자 안에서만 유일하므로 RLS가 남의 목표를 가린다. */
export const goalHref = (seq: number) => `/Goal/${seq}`;

/** 미완료 목표가 위로, 그다음 제목순. 드롭다운 정렬용. */
export function sortGoalOptions<T extends GoalOption>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    return a.title.localeCompare(b.title);
  });
}

export const ASSIGNMENT_SELECT =
  "id, title, course, due_date, due_time, completed, goal_id, created_at";

export type ProgressMode = "auto" | "manual";

export type GoalProgress = {
  /** 0~100. 정수로 반올림하지 않는다 — 표기는 formatPct가 담당. */
  pct: number;
  mode: ProgressMode;
  taskDone: number;
  taskTotal: number;
  habitTotal: number;
  /** 평균의 분모. 과제 + 습관 개수. */
  itemTotal: number;
};

const EMPTY_TASKS: readonly { completed: boolean }[] = [];
const EMPTY_HABITS: readonly Habit[] = [];

/**
 * 진행률 표기. 정수로 떨어지면 정수, 아니면 소수점 3자리.
 *
 *   1/2  → "50"        2/3   → "66.667"
 *   1/1  → "100"       1/365 → "0.274"
 *
 * 반올림해서 0%가 되어버리면 장기 목표 초반에 진행 중인지 아닌지 구분이 안 된다.
 */
export function formatPct(pct: number): string {
  const v = Math.round(pct * 1000) / 1000;
  return Number.isInteger(v) ? String(v) : v.toFixed(3);
}

/**
 * 표기 기준(소수점 3자리)으로 100%인가.
 * 비율 합산에서 99.99999999999999 같은 부동소수 오차가 나오는 것을 흡수한다.
 */
export const isFullProgress = (pct: number) => Math.round(pct * 1000) / 1000 >= 100;

/**
 * 달성 여부. 진행률 100%이거나 사용자가 직접 완료 체크한 경우.
 *
 * 수동 체크를 함께 인정하는 이유: 연결된 과제·습관이 없는 목표는 수동 진행률
 * 슬라이더를 100까지 밀지 않는 한 절대 100%가 되지 않는데, 그런 목표도
 * 체크 하나로 끝낼 수 있어야 한다.
 */
export const isAchieved = (goal: Pick<Goal, "completed">, pct: number) =>
  goal.completed || isFullProgress(pct);

/**
 * 서버의 completed_at을 현재 달성 여부에 맞추기 위해 필요한 쓰기 목록.
 * 바꿀 게 없는 목표는 결과에 들어가지 않으므로, 빈 배열이면 쓰기도 없다.
 *
 * 순수 함수다. 실제 쓰기는 호출한 화면이 한다.
 */
export function pendingCompletionWrites(
  entries: readonly {
    goal: Pick<Goal, "id" | "completed" | "completed_at">;
    pct: number;
  }[],
  today: string
): { id: string; completed_at: string | null }[] {
  const writes: { id: string; completed_at: string | null }[] = [];
  for (const { goal, pct } of entries) {
    const achieved = isAchieved(goal, pct);
    if (achieved && !goal.completed_at) {
      writes.push({ id: goal.id, completed_at: today });
    } else if (!achieved && goal.completed_at) {
      writes.push({ id: goal.id, completed_at: null });
    }
  }
  return writes;
}

/** "2026.08.15 달성" 형태. completed_at은 date 컬럼이라 그대로 쓴다. */
export const achievedLabel = (date: string) => `${date.replaceAll("-", ".")} 달성`;

/** "2026.07.20 시작" 형태. created_at은 timestamptz라 로컬 날짜로 먼저 줄인다. */
export const startedLabel = (timestamp: string) =>
  `${dateOf(timestamp).replaceAll("-", ".")} 시작`;

/**
 * 목표의 진행률 = 연결된 항목들의 달성 비율 평균.
 *
 *   일회성 과제 — 완료 1, 미완료 0
 *   습관 daily  — 완료일수 / 기간일수
 *   습관 weekly — 완료횟수 / (주차 × 목표횟수)
 *
 * 기간은 `max(목표 생성일, 습관 생성일) ~ 목표 마감일`이다. 습관이 목표보다
 * 먼저 있었다면 그 이전 기록까지 세어져 진행률이 부풀기 때문에 늦은 쪽을 쓴다.
 * 마감일이 없으면 전체 기간을 정할 수 없어 그때만 오늘까지를 분모로 쓴다.
 *
 * 연결된 항목이 하나도 없으면 사용자가 직접 입력한 manual_progress를 쓴다.
 */
export function goalProgress({
  goal,
  tasks,
  habits,
  datesByHabit,
  today,
}: {
  goal: Pick<Goal, "manual_progress" | "due_date" | "created_at">;
  tasks?: readonly { completed: boolean }[];
  habits?: readonly Habit[];
  datesByHabit?: Map<string, Set<string>>;
  today: string;
}): GoalProgress {
  const taskList = tasks ?? EMPTY_TASKS;
  const habitList = habits ?? EMPTY_HABITS;
  const itemTotal = taskList.length + habitList.length;

  let taskDone = 0;
  for (const t of taskList) if (t.completed) taskDone++;

  if (itemTotal === 0) {
    return {
      pct: Math.min(100, Math.max(0, goal.manual_progress)),
      mode: "manual",
      taskDone: 0,
      taskTotal: 0,
      habitTotal: 0,
      itemTotal: 0,
    };
  }

  let sum = taskDone; // 과제는 완료 1 / 미완료 0이므로 완료 개수가 곧 합
  const goalStart = dateOf(goal.created_at);
  for (const h of habitList) {
    const start = laterDate(goalStart, dateOf(h.created_at));
    const end = goal.due_date && goal.due_date >= start ? goal.due_date : today;
    sum += habitRatio(
      h,
      datesByHabit?.get(h.id) ?? EMPTY_DATES,
      periodBetween(start, end)
    );
  }

  return {
    pct: (sum / itemTotal) * 100,
    mode: "auto",
    taskDone,
    taskTotal: taskList.length,
    habitTotal: habitList.length,
    itemTotal,
  };
}

/** 과제 목록을 goal_id로 묶는다. 목표마다 filter를 도는 O(goals × assignments)를 피한다. */
export function groupByGoal<T extends { goal_id: string | null }>(
  items: readonly T[]
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    if (!item.goal_id) continue;
    const bucket = map.get(item.goal_id);
    if (bucket) bucket.push(item);
    else map.set(item.goal_id, [item]);
  }
  return map;
}

/** 미완료 → 마감 빠른 순 → 생성 순. */
export function sortAssignments<T extends Assignment>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    if (a.due_date && b.due_date) {
      const c = a.due_date.localeCompare(b.due_date);
      if (c !== 0) return c;
      return (a.due_time ?? "99:99").localeCompare(b.due_time ?? "99:99");
    }
    if (a.due_date) return -1;
    if (b.due_date) return 1;
    return a.created_at.localeCompare(b.created_at);
  });
}

/** 미완료 → 최근 생성 순. */
export function sortGoals<T extends Goal>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    return b.created_at.localeCompare(a.created_at);
  });
}
