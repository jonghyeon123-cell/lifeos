// 습관(Habit)의 타입·기록 집계·스트릭·진행률.
//
// 세 개념 중 습관만 "반복"이다. 체크 기록은 daily_habit_logs에 날짜 한 건씩 쌓이고
// UNIQUE(habit_id, done_on)로 하루 중복이 막혀 있어, daily는 "그 날 행이 있나",
// weekly는 "그 주에 행이 몇 개인가"로 같은 데이터에서 계산된다.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  daysBetween,
  dateOf,
  monthKey,
  monthlyDate,
  monthsBetween,
  shiftDay,
  shiftMonth,
  weekStart,
} from "@/lib/date";

export type FrequencyType = "daily" | "weekly" | "monthly";

export type Habit = {
  id: string;
  title: string;
  frequency_type: FrequencyType;
  frequency_count: number;
  /** weekly 전용. ISO 요일(1=월 … 7=일). null이면 요일을 정하지 않은 것. */
  scheduled_days: number[] | null;
  /** monthly 전용. 1~31. 그 달에 없는 날짜면 말일로 당겨 쓴다. */
  scheduled_day_of_month: number | null;
  goal_id: string | null;
  created_at: string;
};

export type HabitLog = { habit_id: string; done_on: string };

export const HABIT_SELECT =
  "id, title, frequency_type, frequency_count, scheduled_days, scheduled_day_of_month, goal_id, created_at";

/** ISO 요일 번호 → 라벨. 히트맵 요일 표시와 요일 토글이 함께 쓴다. */
export const WEEKDAYS = [
  { value: 1, label: "월" },
  { value: 2, label: "화" },
  { value: 3, label: "수" },
  { value: 4, label: "목" },
  { value: 5, label: "금" },
  { value: 6, label: "토" },
  { value: 7, label: "일" },
] as const;

/** YYYY-MM-DD → ISO 요일(1=월 … 7=일). Date의 0=일 표기를 월요일 시작으로 옮긴다. */
function isoWeekday(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  return dow === 0 ? 7 : dow;
}

export const EMPTY_DATES: ReadonlySet<string> = new Set<string>();

/** 습관 생성/전환 폼의 주기 선택지. 값은 폼 상태로 그대로 쓰인다. */
export const FREQUENCY_OPTIONS = [
  { value: "daily", label: "매일" },
  { value: "weekly-1", label: "주 1회" },
  { value: "weekly-2", label: "주 2회" },
  { value: "weekly-3", label: "주 3회" },
  { value: "weekly-4", label: "주 4회" },
  { value: "weekly-5", label: "주 5회" },
  { value: "weekly-6", label: "주 6회" },
  { value: "weekly-7", label: "주 7회" },
  { value: "monthly", label: "월 1회" },
] as const;

export const DEFAULT_FREQUENCY = "daily";

/** 월간 습관의 기본 지정일. 폼이 처음 열릴 때 채워 넣는 값. */
export const DEFAULT_DAY_OF_MONTH = 1;

/**
 * 지정일을 1~31로 자른다. DB 제약과 같은 범위다.
 * 실제 달에 맞춰 말일로 당기는 보정은 저장이 아니라 표시 시점에
 * lib/date의 monthlyDate가 한다 — 원본 의도(예: "31일")를 보존하기 위해서다.
 */
export const clampDayOfMonth = (n: number) =>
  Math.min(31, Math.max(1, Math.trunc(n)));

/** 폼 값 → 주기 타입·횟수. daily/monthly는 횟수가 항상 1이라는 체크 제약을 지킨다. */
export function parseFrequency(value: string): {
  frequency_type: FrequencyType;
  frequency_count: number;
} {
  if (value.startsWith("weekly-")) {
    const n = Number(value.slice("weekly-".length));
    return {
      frequency_type: "weekly",
      frequency_count: Number.isInteger(n) && n >= 1 && n <= 7 ? n : 1,
    };
  }
  if (value === "monthly") {
    return { frequency_type: "monthly", frequency_count: 1 };
  }
  return { frequency_type: "daily", frequency_count: 1 };
}

/** 주기 필드 4개를 한 벌로 묶은 것. insert/update 페이로드에 그대로 펼쳐 넣는다. */
export type FrequencyFields = {
  frequency_type: FrequencyType;
  frequency_count: number;
  scheduled_days: number[] | null;
  scheduled_day_of_month: number | null;
};

/**
 * 폼 입력 → DB 컬럼 4개.
 *
 * 타입별로 쓰지 않는 필드를 null로 지우는 책임을 여기 한 곳에 모았다. DB의
 * daily_habits_frequency_valid 제약이 같은 규칙을 강제하므로, 폼이 늘어나도
 * 이 함수만 거치면 제약 위반이 나지 않는다.
 */
export function buildFrequencyFields(input: {
  frequency: string;
  /** weekly에서만 쓰인다. 빈 배열이면 "요일 미지정"으로 본다. */
  scheduledDays?: readonly number[];
  /** monthly에서만 쓰인다. */
  dayOfMonth?: number;
}): FrequencyFields {
  const { frequency_type, frequency_count } = parseFrequency(input.frequency);

  if (frequency_type === "weekly") {
    const days = normalizeWeekdays(input.scheduledDays);
    return {
      frequency_type,
      frequency_count,
      scheduled_days: days.length > 0 ? days : null,
      scheduled_day_of_month: null,
    };
  }

  if (frequency_type === "monthly") {
    return {
      frequency_type,
      frequency_count,
      scheduled_days: null,
      scheduled_day_of_month: clampDayOfMonth(
        input.dayOfMonth ?? DEFAULT_DAY_OF_MONTH
      ),
    };
  }

  return {
    frequency_type,
    frequency_count,
    scheduled_days: null,
    scheduled_day_of_month: null,
  };
}

/** 저장된 습관 → 폼 셀렉트 값. 수정 폼을 열 때 현재 주기를 되살리는 데 쓴다. */
export function frequencyValueOf(
  h: Pick<Habit, "frequency_type" | "frequency_count">
): string {
  if (h.frequency_type === "weekly") return `weekly-${h.frequency_count}`;
  if (h.frequency_type === "monthly") return "monthly";
  return "daily";
}

/** 1~7만 남기고 중복 제거 후 정렬. DB의 scheduled_days 제약과 같은 규칙. */
function normalizeWeekdays(days?: readonly number[]): number[] {
  if (!days) return [];
  const seen = new Set<number>();
  for (const d of days) {
    if (Number.isInteger(d) && d >= 1 && d <= 7) seen.add(d);
  }
  return [...seen].sort((a, b) => a - b);
}

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

/** weekly 습관의 주당 목표 횟수. daily는 항상 1. */
const targetPerWeek = (h: Pick<Habit, "frequency_type" | "frequency_count">) =>
  h.frequency_type === "weekly" ? Math.max(1, h.frequency_count) : 1;

/**
 * 체크 기록 한 건을 쓰거나 지운다. 홈·목표·목표 상세가 같은 문장을 쓴다.
 * 낙관적 갱신은 화면마다 상태 모양이 달라 호출한 쪽이 하고, 여기서는 DB만 본다.
 */
export async function writeHabitLog(
  supabase: SupabaseClient,
  input: { userId: string; habitId: string; date: string; wasDone: boolean }
) {
  const { userId, habitId, date, wasDone } = input;
  const { error } = wasDone
    ? await supabase
        .from("daily_habit_logs")
        .delete()
        .eq("habit_id", habitId)
        .eq("done_on", date)
    : await supabase
        .from("daily_habit_logs")
        .insert({ user_id: userId, habit_id: habitId, done_on: date });
  return error;
}

/** 만든 순서대로. 목표 목록과 목표 상세가 같은 순서를 보여야 한다. */
export const sortHabits = <T extends Pick<Habit, "created_at">>(rows: readonly T[]) =>
  [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at));

/** 로그를 습관별 날짜 Set으로 묶는다. 습관마다 배열을 훑는 것을 피한다. */
export function datesByHabit(
  logs: readonly HabitLog[]
): Map<string, Set<string>> {
  const m = new Map<string, Set<string>>();
  for (const l of logs) {
    let s = m.get(l.habit_id);
    if (!s) {
      s = new Set();
      m.set(l.habit_id, s);
    }
    s.add(l.done_on);
  }
  return m;
}

// ── daily 스트릭 (기존 로직 그대로) ──────────────────────────────

export function currentStreak(
  dates: ReadonlySet<string>,
  today: string,
  yesterday: string
) {
  // 오늘 아직 안 했어도 어제까지 이어져 있으면 스트릭은 살아 있다.
  const anchor = dates.has(today)
    ? today
    : dates.has(yesterday)
      ? yesterday
      : null;
  if (!anchor) return 0;
  let n = 0;
  let cur = anchor;
  while (dates.has(cur)) {
    n++;
    cur = shiftDay(cur, -1);
  }
  return n;
}

/**
 * 정렬된 키 목록에서 가장 긴 연속 구간의 길이.
 * next는 "그 키의 바로 다음 키"를 만든다 — 일/주/월 스트릭이 이것만 다르다.
 */
function longestRun(keys: string[], next: (key: string) => string) {
  let best = 0;
  let cur = 0;
  let prev: string | null = null;
  for (const k of keys) {
    cur = prev && next(prev) === k ? cur + 1 : 1;
    if (cur > best) best = cur;
    prev = k;
  }
  return best;
}

function bestStreak(dates: ReadonlySet<string>) {
  return longestRun([...dates].sort(), (d) => shiftDay(d, 1));
}

/**
 * 이번 주(월~일) 일곱 칸. 오늘 기준 최근 7일이 아니라 주 경계에 맞춘다 —
 * 요일 라벨이 항상 월화수목금토일 순서로 읽히게 하기 위해서다.
 * 아직 오지 않은 요일은 done=false로 비어 있다.
 */
export function currentWeekDays(dates: ReadonlySet<string>, today: string) {
  const ws = weekStart(today);
  const days: { date: string; done: boolean; isToday: boolean }[] = [];
  for (let i = 0; i < 7; i++) {
    const d = shiftDay(ws, i);
    days.push({ date: d, done: dates.has(d), isToday: d === today });
  }
  return days;
}

// ── weekly 스트릭 ────────────────────────────────────────────────

/** 주(월요일 시작)별 체크 횟수. */
function weekCounts(
  dates: ReadonlySet<string>,
  range?: { start: string; end: string }
): Map<string, number> {
  const m = new Map<string, number>();
  for (const d of dates) {
    if (range && (d < range.start || d > range.end)) continue;
    const w = weekStart(d);
    m.set(w, (m.get(w) ?? 0) + 1);
  }
  return m;
}

export const thisWeekCount = (dates: ReadonlySet<string>, today: string) => {
  const ws = weekStart(today);
  const we = shiftDay(ws, 6);
  let n = 0;
  for (const d of dates) if (d >= ws && d <= we) n++;
  return n;
};

/**
 * 목표 횟수를 채운 주가 몇 주 연속인가.
 * 이번 주가 아직 미달이어도 지난주까지 이어져 있으면 스트릭은 살아 있다
 * (daily 스트릭이 "오늘 아직 안 함"을 봐주는 것과 같은 규칙).
 */
function currentWeeklyStreak(
  counts: Map<string, number>,
  target: number,
  today: string
) {
  const thisWeek = weekStart(today);
  const lastWeek = shiftDay(thisWeek, -7);
  const met = (w: string) => (counts.get(w) ?? 0) >= target;
  let cur = met(thisWeek) ? thisWeek : met(lastWeek) ? lastWeek : null;
  if (!cur) return 0;
  let n = 0;
  while (met(cur)) {
    n++;
    cur = shiftDay(cur, -7);
  }
  return n;
}

function bestWeeklyStreak(counts: Map<string, number>, target: number) {
  const weeks = [...counts.keys()]
    .filter((w) => (counts.get(w) ?? 0) >= target)
    .sort();
  return longestRun(weeks, (w) => shiftDay(w, 7));
}

// ── monthly 집계 ─────────────────────────────────────────────────

/** 그 달(YYYY-MM)에 체크한 적이 있는가. */
function doneInMonth(
  dates: ReadonlySet<string>,
  month: string
): boolean {
  for (const d of dates) if (d.startsWith(month)) return true;
  return false;
}

export type MonthCell = {
  /** YYYY-MM */
  month: string;
  done: boolean;
  /** 습관을 만들기 전 달. 놓친 게 아니라 해당 없음. */
  beforeStart: boolean;
  /** 예정일이 아직 오지 않았다. 역시 놓친 게 아니다. */
  pending: boolean;
};

/**
 * 이번 달 칸.
 *
 * 놓친 달과 "아직 차례가 아닌 달"을 구분한다. 습관을 만들기 전 달(beforeStart)과
 * 예정일이 안 지난 달(pending)을 미완료로 칠하면 실제보다 나빠 보인다.
 */
export function monthCell(
  habit: Pick<Habit, "scheduled_day_of_month" | "created_at">,
  dates: ReadonlySet<string>,
  today: string
): MonthCell {
  const month = monthKey(today);
  const due = monthlyDate(month, habit.scheduled_day_of_month ?? 1);
  return {
    month,
    done: doneInMonth(dates, month),
    // 달 단위로 비교하면 "이번 달 5일에 만든 습관"의 그 달 1일 예정분까지
    // 놓친 것으로 잡힌다. 예정일이 생성 시점보다 이른지로 본다.
    beforeStart: due < dateOf(habit.created_at),
    pending: today < due,
  };
}

/** 이번 달(또는 예정일 전이면 지난달)부터 거슬러 올라간 연속 달성 개월 수. */
function currentMonthlyStreak(
  habit: Pick<Habit, "scheduled_day_of_month">,
  dates: ReadonlySet<string>,
  today: string
): number {
  const day = habit.scheduled_day_of_month ?? 1;
  let cur = monthKey(today);
  if (!doneInMonth(dates, cur)) {
    // 이번 달 예정일이 아직 안 왔으면 지난달까지로 판단한다.
    // daily 스트릭이 "오늘 아직 안 함"을 봐주는 것과 같은 규칙.
    if (today < monthlyDate(cur, day)) cur = shiftMonth(cur, -1);
    else return 0;
  }
  let n = 0;
  while (doneInMonth(dates, cur)) {
    n++;
    cur = shiftMonth(cur, -1);
  }
  return n;
}

function bestMonthlyStreak(dates: ReadonlySet<string>): number {
  const months = [...new Set([...dates].map(monthKey))].sort();
  return longestRun(months, (m) => shiftMonth(m, 1));
}

/**
 * 다음 예정일. 이번 달 예정일이 아직 안 왔고 이번 달을 안 했으면 이번 달,
 * 그 밖에는(이미 했거나 예정일이 지났으면) 다음 달 예정일.
 */
function nextMonthlyDue(
  habit: Pick<Habit, "scheduled_day_of_month">,
  dates: ReadonlySet<string>,
  today: string
): string {
  const day = habit.scheduled_day_of_month ?? 1;
  const thisMonth = monthKey(today);
  const due = monthlyDate(thisMonth, day);
  if (today <= due && !doneInMonth(dates, thisMonth)) return due;
  return monthlyDate(shiftMonth(thisMonth, 1), day);
}

// ── weekly 이번 주 진행 칸 ───────────────────────────────────────

export type WeekSlot = {
  /** 요일 라벨. 지정 요일 칸은 항상, 자유 칸은 채워졌을 때만 들어간다. */
  label: string;
  done: boolean;
  /** 그 칸이 가리키는 날짜. 아직 안 채워진 자유 칸은 없다. */
  date?: string;
  /** 미리 정해둔 요일 칸인가. 자유 칸은 체크한 날의 요일로 채워진다. */
  scheduled: boolean;
};

const WEEKDAY_LABEL = new Map<number, string>(
  WEEKDAYS.map((d) => [d.value, d.label])
);

/** YYYY-MM-DD → 요일 한 글자. */
export const weekdayLabel = (dateStr: string) =>
  WEEKDAY_LABEL.get(isoWeekday(dateStr)) ?? "";

/**
 * weekly 습관의 이번 주 진행 칸. 개수는 항상 frequency_count다.
 *
 * 지정한 요일이 있으면 그 요일 칸을 먼저 놓는다(월·수 지정 → [월][수]).
 * 남는 칸은 빈 칸으로 두었다가, 지정 요일 밖에서 체크하면 그 날의 요일로 채운다.
 * 요일을 아예 안 정한 습관은 전부 빈 칸으로 시작해 체크한 요일이 차례로 들어간다.
 */
export function weekSlots(
  habit: Pick<Habit, "frequency_type" | "frequency_count" | "scheduled_days">,
  dates: ReadonlySet<string>,
  today: string
): WeekSlot[] {
  const ws = weekStart(today);
  const target = targetPerWeek(habit);
  const days = normalizeWeekdays(habit.scheduled_days ?? undefined);

  const slots: WeekSlot[] = [];
  const claimed = new Set<string>();
  for (let i = 0; i < target; i++) {
    const wd = days[i];
    if (wd === undefined) {
      slots.push({ label: "", done: false, scheduled: false });
      continue;
    }
    const date = shiftDay(ws, wd - 1);
    const done = dates.has(date);
    if (done) claimed.add(date);
    slots.push({
      label: WEEKDAY_LABEL.get(wd) ?? "",
      done,
      date,
      scheduled: true,
    });
  }

  // 지정 요일 밖에서 한 체크를 빈 칸에 날짜순으로 채운다.
  const extras: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = shiftDay(ws, i);
    if (dates.has(d) && !claimed.has(d)) extras.push(d);
  }
  let e = 0;
  for (const s of slots) {
    if (e >= extras.length) break;
    if (s.scheduled) continue;
    const d = extras[e++];
    s.done = true;
    s.date = d;
    s.label = weekdayLabel(d);
  }
  return slots;
}

// ── "오늘 할 일" 노출 정책 ───────────────────────────────────────

/**
 * 홈 "오늘 할 일"에 오늘 나와야 하는가.
 *
 *   daily            — 항상. 완료해도 체크 표시로 남는다.
 *   weekly + 요일지정 — 지정한 요일에만. 그 날엔 완료해도 남는다.
 *   weekly 요일없음   — 이번 주 목표를 채우기 전까지만. 채우면 그 주 내내 사라진다.
 *   monthly          — 이번 달 예정일 당일에만. 이미 이번 달에 했으면 그날도 안 나온다.
 *
 * 홈은 "오늘 해야 할 것"만 보여주는 자리다. 완료 여부·진행 상황·히트맵 같은
 * 전체 정보는 /Goal의 습관 목록이 계속 책임진다.
 */
export function isDueToday(
  habit: Pick<
    Habit,
    | "frequency_type"
    | "frequency_count"
    | "scheduled_days"
    | "scheduled_day_of_month"
  >,
  dates: ReadonlySet<string>,
  today: string
): boolean {
  if (habit.frequency_type === "monthly") {
    const month = monthKey(today);
    if (doneInMonth(dates, month)) return false;
    return today === monthlyDate(month, habit.scheduled_day_of_month ?? 1);
  }

  if (habit.frequency_type === "weekly") {
    const days = habit.scheduled_days;
    if (days && days.length > 0) return days.includes(isoWeekday(today));
    return thisWeekCount(dates, today) < targetPerWeek(habit);
  }

  return true;
}

// ── 진행률 ───────────────────────────────────────────────────────

/**
 * 기간 안에 예정일이 실제로 도래한 횟수와 그중 완료한 횟수.
 *
 * 분모를 "걸친 달 수"로 잡으면 예정일이 아직 안 온 이번 달까지 세어져
 * 준수율이 부당하게 깎인다. 그래서 도래한 예정일만 센다.
 */
export function monthlyProgress(
  habit: Pick<Habit, "scheduled_day_of_month">,
  dates: ReadonlySet<string>,
  period: Period
): { due: number; done: number } {
  const day = habit.scheduled_day_of_month ?? 1;
  let due = 0;
  let done = 0;
  for (const m of monthsBetween(period.start, period.end)) {
    const d = monthlyDate(m, day);
    if (d < period.start || d > period.end) continue;
    due++;
    if (doneInMonth(dates, m)) done++;
  }
  return { due, done };
}

export type Period = {
  start: string;
  end: string;
  /** 양끝 포함 일수. */
  days: number;
  /** 월요일 경계 기준으로 기간이 걸친 주 수. */
  weeks: number;
};

export function periodBetween(start: string, end: string): Period {
  const days = daysBetween(start, end);
  const spannedWeekDays = daysBetween(weekStart(start), weekStart(end));
  return {
    start,
    end,
    days,
    weeks: spannedWeekDays === 0 ? 0 : (spannedWeekDays - 1) / 7 + 1,
  };
}

/**
 * 기간 대비 습관 달성 비율 (0~1).
 *
 *   daily  — 완료일수 / 기간일수
 *   weekly — 주별 완료횟수(목표치까지만 인정) 합 / (주차 × 목표횟수)
 *
 * weekly에서 주별로 목표치까지만 세는 이유: 어느 한 주에 4번 갔다고 해서
 * 아예 안 간 다른 주가 메워지면 "주 2회 습관"이라는 약속이 무의미해진다.
 */
export function habitRatio(
  habit: Pick<
    Habit,
    "frequency_type" | "frequency_count" | "scheduled_day_of_month"
  >,
  dates: ReadonlySet<string>,
  period: Period
): number {
  if (period.days <= 0) return 0;

  if (habit.frequency_type === "monthly") {
    const { due, done } = monthlyProgress(habit, dates, period);
    return due === 0 ? 0 : clamp01(done / due);
  }

  if (habit.frequency_type === "weekly") {
    const target = targetPerWeek(habit);
    if (period.weeks <= 0) return 0;
    let earned = 0;
    for (const n of weekCounts(dates, period).values()) {
      earned += n < target ? n : target;
    }
    return clamp01(earned / (period.weeks * target));
  }

  let done = 0;
  for (const d of dates) {
    if (d >= period.start && d <= period.end) done++;
  }
  return clamp01(done / period.days);
}

/**
 * 습관 카드에 보여줄 지표. 목표 진행률과 달리 **경과 기간**을 분모로 쓴다.
 * 목표 진행률은 마감일까지의 전체 여정이라 초반에 낮게 나올 수밖에 없는데,
 * "지금까지는 잘 지키고 있다"를 함께 보여주기 위한 값이다.
 */
export type HabitStats = {
  /** 경과 기간 준수율 0~1. */
  adherence: number;
  /** daily = 연속 일수, weekly = 연속 주수, monthly = 연속 개월수. */
  streak: number;
  bestStreak: number;
  /** weekly 전용: 이번 주 체크 횟수. */
  thisWeek: number;
  target: number;
  doneToday: boolean;
  /** monthly 전용: 이번 달을 이미 했는가. */
  monthlyDone: boolean;
  /** monthly 전용: 다음 예정일 (YYYY-MM-DD). */
  nextDue: string | null;
  /**
   * monthly 전용: 지금까지 도래한 예정일 횟수. 0이면 아직 평가할 게 없다는 뜻이라
   * 준수율을 보여주지 않는다 (0%로 보이면 실패한 것처럼 읽힌다).
   */
  monthlyDueCount: number;
};

export function habitStats(
  habit: Habit,
  dates: ReadonlySet<string>,
  today: string,
  yesterday: string
): HabitStats {
  const elapsed = periodBetween(
    // 습관을 만들기 전 기간까지 분모에 넣으면 준수율이 부당하게 깎인다.
    dateOf(habit.created_at),
    today
  );
  const target = targetPerWeek(habit);

  if (habit.frequency_type === "monthly") {
    return {
      adherence: habitRatio(habit, dates, elapsed),
      streak: currentMonthlyStreak(habit, dates, today),
      bestStreak: bestMonthlyStreak(dates),
      thisWeek: thisWeekCount(dates, today),
      target,
      doneToday: dates.has(today),
      monthlyDone: doneInMonth(dates, monthKey(today)),
      nextDue: nextMonthlyDue(habit, dates, today),
      monthlyDueCount: monthlyProgress(habit, dates, elapsed).due,
    };
  }

  if (habit.frequency_type === "weekly") {
    const counts = weekCounts(dates);
    return {
      adherence: habitRatio(habit, dates, elapsed),
      streak: currentWeeklyStreak(counts, target, today),
      bestStreak: bestWeeklyStreak(counts, target),
      thisWeek: thisWeekCount(dates, today),
      target,
      doneToday: dates.has(today),
      monthlyDone: false,
      nextDue: null,
      monthlyDueCount: 0,
    };
  }

  return {
    adherence: habitRatio(habit, dates, elapsed),
    streak: currentStreak(dates, today, yesterday),
    bestStreak: bestStreak(dates),
    thisWeek: thisWeekCount(dates, today),
    target,
    doneToday: dates.has(today),
    monthlyDone: false,
    nextDue: null,
    monthlyDueCount: 0,
  };
}
