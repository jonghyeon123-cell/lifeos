// 날짜 헬퍼. 대시보드·목표·과제 세 페이지에 같은 구현이 복사돼 있던 것을 모았다.
// 모든 날짜 문자열은 로컬 타임존 기준 YYYY-MM-DD.

export const pad = (n: number) => String(n).padStart(2, "0");

export const localDate = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const shiftDay = (dateStr: string, delta: number) => {
  const [y, m, d] = dateStr.split("-").map(Number);
  return localDate(new Date(y, m - 1, d + delta));
};

export type DueInfo = { text: string; overdue: boolean; soon: boolean };

export function dueLabel(due: string | null): DueInfo | null {
  if (!due) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [y, m, d] = due.split("-").map(Number);
  const diff = Math.round(
    (new Date(y, m - 1, d).getTime() - today.getTime()) / 86_400_000
  );
  const text =
    diff === 0 ? "D-day" : diff > 0 ? `D-${diff}` : `D+${Math.abs(diff)}`;
  return { text, overdue: diff < 0, soon: diff >= 0 && diff <= 1 };
}

/** 그 날짜가 속한 주의 월요일. 주 경계는 월요일 시작. */
export function weekStart(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dow = new Date(y, m - 1, d).getDay(); // 0=일 … 6=토
  return shiftDay(dateStr, -(dow === 0 ? 6 : dow - 1));
}

/** a~b 양끝을 포함한 일수. b가 a보다 이르면 0. */
export function daysBetween(a: string, b: string) {
  const [y1, m1, d1] = a.split("-").map(Number);
  const [y2, m2, d2] = b.split("-").map(Number);
  const diff = Math.round(
    (Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000
  );
  return diff < 0 ? 0 : diff + 1;
}

/** 두 YYYY-MM-DD 중 늦은 쪽. 문자열 비교로 충분하다. */
export const laterDate = (a: string, b: string) => (a > b ? a : b);

/** YYYY-MM. 월 단위 집계의 키. */
export const monthKey = (dateStr: string) => dateStr.slice(0, 7);

/** 그 달의 마지막 날(28~31). month는 1~12. */
export const daysInMonth = (year: number, month: number) =>
  new Date(year, month, 0).getDate();

/**
 * "매달 N일"을 그 달의 실제 날짜로 옮긴다.
 *
 * 그 달에 N일이 없으면(예: 2월 31일) 말일로 당긴다. 건너뛰지 않는 이유는
 * 월간 습관이 특정 달에만 통째로 사라지면 스트릭이 끊긴 것처럼 보이기 때문이다.
 */
export function monthlyDate(monthStr: string, dayOfMonth: number) {
  const [y, m] = monthStr.split("-").map(Number);
  const day = Math.min(Math.max(1, dayOfMonth), daysInMonth(y, m));
  return `${y}-${pad(m)}-${pad(day)}`;
}

/** monthStr(YYYY-MM)에서 delta개월 이동. */
export function shiftMonth(monthStr: string, delta: number) {
  const [y, m] = monthStr.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

/** 두 날짜가 걸친 월 키(YYYY-MM) 목록. 양끝 포함. YYYY-MM은 문자열 비교로 정렬된다. */
export function monthsBetween(startDate: string, endDate: string): string[] {
  const out: string[] = [];
  const last = monthKey(endDate);
  let cur = monthKey(startDate);
  while (cur <= last) {
    out.push(cur);
    cur = shiftMonth(cur, 1);
  }
  return out;
}

/** timestamptz 문자열 → 로컬 YYYY-MM-DD. */
export const dateOf = (timestamp: string) => localDate(new Date(timestamp));
