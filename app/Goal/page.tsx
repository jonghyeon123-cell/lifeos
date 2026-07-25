"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";

type Task = { id: string; text: string; done: boolean };

type Goal = {
  id: string;
  title: string;
  memo: string | null;
  tasks: Task[];
  completed: boolean;
  due_date: string | null;
  created_at: string;
};

type DailyHabit = { id: string; title: string; created_at: string };
type HabitLog = { habit_id: string; done_on: string };

const CARD =
  "bg-white/70 backdrop-blur border border-[#9da19a]/30 rounded-3xl shadow-[0_1px_3px_rgba(36,73,11,0.06)]";
const INPUT =
  "rounded-full border border-[#9da19a]/40 bg-white/80 px-4 py-2.5 text-sm outline-none focus:border-[#24490b]";
const PRIMARY_BTN =
  "flex-none whitespace-nowrap rounded-full border border-[#24490b] bg-[#e2f9d1] px-6 py-2.5 text-sm font-semibold text-[#24490b] transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#24490b]/40 disabled:cursor-not-allowed disabled:opacity-40";

const GOAL_SELECT = "id, title, memo, tasks, completed, due_date, created_at";
const HABIT_SELECT = "id, title, created_at";
const LOG_SELECT = "habit_id, done_on";
const EMPTY_SET: Set<string> = new Set();

const pad = (n: number) => String(n).padStart(2, "0");
const localDate = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const shiftDay = (dateStr: string, delta: number) => {
  const [y, m, d] = dateStr.split("-").map(Number);
  return localDate(new Date(y, m - 1, d + delta));
};

function dueLabel(due: string | null) {
  if (!due) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [y, m, d] = due.split("-").map(Number);
  const target = new Date(y, m - 1, d);
  const diff = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  const text =
    diff === 0 ? "D-day" : diff > 0 ? `D-${diff}` : `D+${Math.abs(diff)}`;
  return { text, overdue: diff < 0, soon: diff >= 0 && diff <= 1 };
}

function normalizeGoals(rows: Goal[]) {
  return rows
    .map((r) => ({ ...r, tasks: Array.isArray(r.tasks) ? r.tasks : [] }))
    .sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      return b.created_at.localeCompare(a.created_at);
    });
}

function progressOf(tasks: Task[]) {
  const total = tasks.length;
  const done = tasks.filter((t) => t.done).length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return { total, done, pct };
}

function currentStreak(set: Set<string>, today: string, yesterday: string) {
  const anchor = set.has(today) ? today : set.has(yesterday) ? yesterday : null;
  if (!anchor) return 0;
  let n = 0;
  let d = anchor;
  while (set.has(d)) {
    n++;
    d = shiftDay(d, -1);
  }
  return n;
}

function bestStreak(set: Set<string>) {
  const dates = [...set].sort();
  let best = 0;
  let cur = 0;
  let prev: string | null = null;
  for (const d of dates) {
    cur = prev && shiftDay(prev, 1) === d ? cur + 1 : 1;
    if (cur > best) best = cur;
    prev = d;
  }
  return best;
}

function last7Days(set: Set<string>, today: string) {
  const days: { date: string; done: boolean }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = shiftDay(today, -i);
    days.push({ date: d, done: set.has(d) });
  }
  return days;
}

function FlameIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 2c1 3-1 4-2.5 5.5C8 9 7 10.5 7 13a5 5 0 0 0 10 0c0-2-1-3.5-2-5-1.5 1-2 .5-2-1 0-2-1-4-1-5Z" />
    </svg>
  );
}

export default function GoalPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const today = localDate(new Date());
  const yesterday = shiftDay(today, -1);

  const [goals, setGoals] = useState<Goal[]>([]);
  const [habits, setHabits] = useState<DailyHabit[]>([]);
  const [logs, setLogs] = useState<HabitLog[]>([]);
  const [fetching, setFetching] = useState(true);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [habitTitle, setHabitTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const logsByHabit = useMemo(() => {
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
  }, [logs]);

  useEffect(() => {
    if (!loading && !user) router.replace("/auth");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    let ignore = false;
    Promise.all([
      supabase.from("goals").select(GOAL_SELECT).eq("user_id", user.id),
      supabase.from("daily_habits").select(HABIT_SELECT).eq("user_id", user.id),
      supabase.from("daily_habit_logs").select(LOG_SELECT).eq("user_id", user.id),
    ]).then(([g, h, l]) => {
      if (ignore) return;
      if (g.error || h.error || l.error) {
        setError("데이터를 불러오지 못했어요.");
      } else {
        setGoals(normalizeGoals((g.data as Goal[]) ?? []));
        setHabits(
          ((h.data as DailyHabit[]) ?? []).sort((a, b) =>
            a.created_at.localeCompare(b.created_at)
          )
        );
        setLogs((l.data as HabitLog[]) ?? []);
      }
      setFetching(false);
    });
    return () => {
      ignore = true;
    };
  }, [user, supabase]);

  const reload = async () => {
    if (!user) return;
    const [g, h, l] = await Promise.all([
      supabase.from("goals").select(GOAL_SELECT).eq("user_id", user.id),
      supabase.from("daily_habits").select(HABIT_SELECT).eq("user_id", user.id),
      supabase.from("daily_habit_logs").select(LOG_SELECT).eq("user_id", user.id),
    ]);
    if (!g.error) setGoals(normalizeGoals((g.data as Goal[]) ?? []));
    if (!h.error)
      setHabits(
        ((h.data as DailyHabit[]) ?? []).sort((a, b) =>
          a.created_at.localeCompare(b.created_at)
        )
      );
    if (!l.error) setLogs((l.data as HabitLog[]) ?? []);
  };

  // ---- goals ----
  const patchGoal = (id: string, patch: Partial<Goal>) =>
    setGoals((prev) =>
      normalizeGoals(prev.map((g) => (g.id === id ? { ...g, ...patch } : g)))
    );

  const persistTasks = async (id: string, tasks: Task[]) => {
    const { error } = await supabase.from("goals").update({ tasks }).eq("id", id);
    if (error) reload();
  };

  const addGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed || !user || saving) return;
    setSaving(true);
    setError(null);
    const { data, error } = await supabase
      .from("goals")
      .insert({
        user_id: user.id,
        title: trimmed,
        memo: null,
        due_date: due || null,
        tasks: [],
      })
      .select(GOAL_SELECT)
      .single();
    if (error || !data) {
      setError("추가하지 못했어요.");
    } else {
      setGoals((prev) => normalizeGoals([data as Goal, ...prev]));
      setTitle("");
      setDue("");
    }
    setSaving(false);
  };

  const removeGoal = async (goal: Goal) => {
    setGoals((prev) => prev.filter((g) => g.id !== goal.id));
    const { error } = await supabase.from("goals").delete().eq("id", goal.id);
    if (error) reload();
  };

  const toggleComplete = async (goal: Goal) => {
    const next = !goal.completed;
    patchGoal(goal.id, { completed: next });
    const { error } = await supabase
      .from("goals")
      .update({ completed: next })
      .eq("id", goal.id);
    if (error) reload();
  };

  const addTask = (goal: Goal) => {
    const text = (drafts[goal.id] ?? "").trim();
    if (!text) return;
    const tasks = [...goal.tasks, { id: crypto.randomUUID(), text, done: false }];
    patchGoal(goal.id, { tasks });
    setDrafts((d) => ({ ...d, [goal.id]: "" }));
    persistTasks(goal.id, tasks);
  };

  const toggleTask = (goal: Goal, taskId: string) => {
    const tasks = goal.tasks.map((t) =>
      t.id === taskId ? { ...t, done: !t.done } : t
    );
    patchGoal(goal.id, { tasks });
    persistTasks(goal.id, tasks);
  };

  const removeTask = (goal: Goal, taskId: string) => {
    const tasks = goal.tasks.filter((t) => t.id !== taskId);
    patchGoal(goal.id, { tasks });
    persistTasks(goal.id, tasks);
  };

  // ---- daily habits ----
  const addHabit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = habitTitle.trim();
    if (!trimmed || !user || saving) return;
    setSaving(true);
    setError(null);
    const { data, error } = await supabase
      .from("daily_habits")
      .insert({ user_id: user.id, title: trimmed })
      .select(HABIT_SELECT)
      .single();
    if (error || !data) {
      setError("추가하지 못했어요.");
    } else {
      setHabits((prev) => [...prev, data as DailyHabit]);
      setHabitTitle("");
    }
    setSaving(false);
  };

  const toggleHabit = async (habit: DailyHabit) => {
    if (!user) return;
    const doneToday = (logsByHabit.get(habit.id) ?? EMPTY_SET).has(today);
    if (doneToday) {
      setLogs((prev) =>
        prev.filter(
          (l) => !(l.habit_id === habit.id && l.done_on === today)
        )
      );
      const { error } = await supabase
        .from("daily_habit_logs")
        .delete()
        .eq("habit_id", habit.id)
        .eq("done_on", today);
      if (error) reload();
    } else {
      setLogs((prev) => [...prev, { habit_id: habit.id, done_on: today }]);
      const { error } = await supabase
        .from("daily_habit_logs")
        .insert({ user_id: user.id, habit_id: habit.id, done_on: today });
      if (error) reload();
    }
  };

  const removeHabit = async (habit: DailyHabit) => {
    setHabits((prev) => prev.filter((h) => h.id !== habit.id));
    setLogs((prev) => prev.filter((l) => l.habit_id !== habit.id));
    const { error } = await supabase
      .from("daily_habits")
      .delete()
      .eq("id", habit.id);
    if (error) reload();
  };

  return (
    <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-0">
          <Image
            src="/face.svg"
            alt="LifeOS logo"
            width={90}
            height={90}
            className="h-12 w-12 sm:h-16 sm:w-16 lg:h-[90px] lg:w-[90px]"
          />
          <Image
            src="/Goal.png"
            alt="Goal"
            width={0}
            height={0}
            sizes="100vw"
            className="h-14 w-auto sm:h-24 lg:h-40"
          />
        </div>
        <Link
          href="/"
          className="rounded-full px-4 py-2 text-base font-medium text-gray-700 transition-colors hover:bg-gray-100 sm:px-6 sm:py-3 sm:text-xl lg:px-[38px] lg:py-[19px] lg:text-[34px]"
        >
          Home
        </Link>
      </div>
      <hr className="mt-[10px] border-t border-[#9da19a]" />

      {loading || !user ? (
        <p className="mt-10 text-sm text-gray-500">불러오는 중...</p>
      ) : (
        <div className="mx-auto mt-8 grid max-w-7xl grid-cols-1 items-start gap-8 lg:grid-cols-2">
          {/* ── 매일 할 일 ── */}
          <section>
            <h2 className="mb-4 flex items-center gap-2 text-base font-bold text-[#1b2416]">
              매일 할 일
              <span className="font-mono text-xs font-normal text-gray-400">
                daily
              </span>
            </h2>

            <form onSubmit={addHabit} className={`${CARD} flex w-full gap-3 px-5 py-4`}>
              <input
                type="text"
                value={habitTitle}
                onChange={(e) => setHabitTitle(e.target.value)}
                placeholder="매일 반복할 습관 (예: 30분 운동)"
                className={`${INPUT} flex-1`}
              />
              <button
                type="submit"
                disabled={!habitTitle.trim() || saving}
                className={PRIMARY_BTN}
              >
                추가
              </button>
            </form>

            <ul className="mt-4 flex flex-col gap-2.5">
              {habits.length === 0 ? (
                <li
                  className={`${CARD} px-6 py-8 text-center text-sm text-gray-500`}
                >
                  매일 반복할 습관을 추가해보세요.
                </li>
              ) : (
                habits.map((h) => {
                  const set = logsByHabit.get(h.id) ?? EMPTY_SET;
                  const doneToday = set.has(today);
                  const cur = currentStreak(set, today, yesterday);
                  const best = bestStreak(set);
                  const week = last7Days(set, today);
                  return (
                    <li
                      key={h.id}
                      className={`${CARD} flex flex-col gap-2.5 px-5 py-3.5 transition-shadow hover:shadow-[0_6px_20px_rgba(36,73,11,0.10)]`}
                    >
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => toggleHabit(h)}
                          aria-label={doneToday ? "오늘 완료 취소" : "오늘 완료"}
                          aria-pressed={doneToday}
                          className={`flex h-6 w-6 flex-none items-center justify-center rounded-full border-2 transition-colors ${
                            doneToday
                              ? "border-[#24490b] bg-[#24490b] text-white"
                              : "border-[#9da19a]"
                          }`}
                        >
                          {doneToday && (
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="3"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M20 6 9 17l-5-5" />
                            </svg>
                          )}
                        </button>
                        <span
                          className={`flex-1 text-sm font-medium ${
                            doneToday ? "text-gray-500" : "text-[#1b2416]"
                          }`}
                        >
                          {h.title}
                        </span>
                        {cur > 0 ? (
                          <span className="flex flex-none items-center gap-1 rounded-full bg-[#e2f9d1] px-2.5 py-1 font-mono text-xs font-bold tabular-nums text-[#4d7c2f]">
                            <FlameIcon />
                            {cur}일
                          </span>
                        ) : (
                          <span className="flex-none font-mono text-xs text-gray-400">
                            시작 전
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => removeHabit(h)}
                          aria-label="습관 삭제"
                          className="flex-none rounded-full px-1.5 text-gray-300 transition-colors hover:text-red-500"
                        >
                          ×
                        </button>
                      </div>

                      <div className="flex items-center gap-3 pl-9">
                        <div
                          className="flex gap-1.5"
                          aria-label="최근 7일 기록"
                        >
                          {week.map((d, i) => (
                            <span
                              key={d.date}
                              title={d.date}
                              className={`h-3.5 w-3.5 rounded-[4px] ${
                                d.done ? "bg-[#24490b]" : "bg-[#9da19a]/25"
                              } ${i === 6 ? "ring-1 ring-[#24490b]/40" : ""}`}
                            />
                          ))}
                        </div>
                        {best > 0 && (
                          <span className="ml-auto font-mono text-[11px] tabular-nums text-gray-400">
                            최고 {best}일
                          </span>
                        )}
                      </div>
                    </li>
                  );
                })
              )}
            </ul>
          </section>

          {/* ── 목표 ── */}
          <section>
            <h2 className="mb-4 flex items-center gap-2 text-base font-bold text-[#1b2416]">
              목표
              <span className="font-mono text-xs font-normal text-gray-400">
                goals
              </span>
            </h2>

            <form
              onSubmit={addGoal}
              className={`${CARD} flex w-full flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center`}
            >
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="목표 제목"
                className={`${INPUT} flex-1`}
              />
              <input
                type="date"
                value={due}
                onChange={(e) => setDue(e.target.value)}
                aria-label="마감기한 (선택)"
                className={INPUT}
              />
              <button
                type="submit"
                disabled={!title.trim() || saving}
                className={PRIMARY_BTN}
              >
                추가
              </button>
            </form>

            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

            <ul className="mt-4 flex flex-col gap-3">
              {fetching ? (
                <li className="text-sm text-gray-500">불러오는 중...</li>
              ) : goals.length === 0 ? (
                <li
                  className={`${CARD} flex flex-col items-center gap-3 px-6 py-12 text-center`}
                >
                  <Image
                    src="/face.svg"
                    alt=""
                    width={56}
                    height={56}
                    className="opacity-80"
                  />
                  <p className="text-sm text-gray-500">
                    아직 세운 목표가 없어요. 첫 목표를 심어보세요.
                  </p>
                </li>
              ) : (
                goals.map((goal) => {
                  const { total, done, pct } = progressOf(goal.tasks);
                  const dl = dueLabel(goal.due_date);
                  return (
                    <li
                      key={goal.id}
                      className={`${CARD} px-5 py-4 ${
                        goal.completed ? "opacity-60" : ""
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => toggleComplete(goal)}
                          aria-label={goal.completed ? "완료 취소" : "완료 표시"}
                          className={`flex h-6 w-6 flex-none items-center justify-center rounded-full border-2 transition-colors ${
                            goal.completed
                              ? "border-[#24490b] bg-[#24490b] text-white"
                              : "border-[#9da19a]"
                          }`}
                        >
                          {goal.completed && (
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="3"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M20 6 9 17l-5-5" />
                            </svg>
                          )}
                        </button>
                        <p
                          className={`min-w-0 flex-1 truncate text-sm font-semibold ${
                            goal.completed
                              ? "text-gray-500 line-through"
                              : "text-[#1b2416]"
                          }`}
                        >
                          {goal.title}
                        </p>
                        {dl && (
                          <span
                            className={`flex-none font-mono text-xs font-semibold tabular-nums ${
                              goal.completed
                                ? "text-gray-400"
                                : dl.overdue
                                  ? "text-red-600"
                                  : dl.soon
                                    ? "text-orange-500"
                                    : "text-gray-500"
                            }`}
                          >
                            {dl.text}
                          </span>
                        )}
                        <span className="flex-none font-mono text-xs tabular-nums text-gray-500">
                          {done}/{total} · {pct}%
                        </span>
                        <button
                          type="button"
                          onClick={() => removeGoal(goal)}
                          aria-label="목표 삭제"
                          className="flex-none rounded-full p-2 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
                        >
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                          </svg>
                        </button>
                      </div>

                      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-[#9da19a]/25">
                        <div
                          className="h-full rounded-full bg-[#24490b] transition-[width] duration-300"
                          style={{ width: `${pct}%` }}
                        />
                      </div>

                      {goal.memo && (
                        <p className="mt-3 text-sm text-gray-600">{goal.memo}</p>
                      )}

                      <ul className="mt-3 flex flex-col gap-1.5">
                        {goal.tasks.map((t) => (
                          <li key={t.id} className="flex items-center gap-2.5">
                            <button
                              type="button"
                              onClick={() => toggleTask(goal, t.id)}
                              aria-label={
                                t.done ? "할 일 완료 취소" : "할 일 완료"
                              }
                              className={`flex flex-none items-center justify-center rounded-md border transition-colors ${
                                t.done
                                  ? "border-[#24490b] bg-[#24490b] text-white"
                                  : "border-[#9da19a]"
                              }`}
                              style={{ height: 18, width: 18 }}
                            >
                              {t.done && (
                                <svg
                                  width="11"
                                  height="11"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="3.5"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <path d="M20 6 9 17l-5-5" />
                                </svg>
                              )}
                            </button>
                            <span
                              className={`flex-1 text-sm ${
                                t.done
                                  ? "text-gray-400 line-through"
                                  : "text-gray-700"
                              }`}
                            >
                              {t.text}
                            </span>
                            <button
                              type="button"
                              onClick={() => removeTask(goal, t.id)}
                              aria-label="할 일 삭제"
                              className="flex-none rounded-full px-1.5 text-gray-300 transition-colors hover:text-red-500"
                            >
                              ×
                            </button>
                          </li>
                        ))}
                      </ul>

                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          addTask(goal);
                        }}
                        className="mt-2.5 flex items-center gap-2"
                      >
                        <input
                          type="text"
                          value={drafts[goal.id] ?? ""}
                          onChange={(e) =>
                            setDrafts((d) => ({
                              ...d,
                              [goal.id]: e.target.value,
                            }))
                          }
                          placeholder="할 일 추가"
                          className="flex-1 rounded-full border border-[#9da19a]/40 bg-white/70 px-3.5 py-1.5 text-xs outline-none focus:border-[#24490b]"
                        />
                        <button
                          type="submit"
                          disabled={!(drafts[goal.id] ?? "").trim()}
                          className="flex-none rounded-full border border-[#9da19a]/50 px-3 py-1.5 text-xs font-semibold text-[#24490b] transition-colors hover:bg-[#e2f9d1] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          추가
                        </button>
                      </form>
                    </li>
                  );
                })
              )}
            </ul>
          </section>
        </div>
      )}
    </main>
  );
}
