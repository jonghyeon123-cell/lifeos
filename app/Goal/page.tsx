"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";
import CheckButton from "@/components/CheckButton";
import HabitCard from "@/components/HabitCard";
import HabitForm from "@/components/HabitForm";
import PageHeader, { AchievementLink } from "@/components/PageHeader";
import ProgressBar from "@/components/ProgressBar";
import { CARD, INPUT, PRIMARY_BTN } from "@/lib/ui";
import {
  GOAL_SELECT,
  type Goal,
  type GoalOption,
  formatPct,
  goalHref,
  goalProgress,
  groupByGoal,
  isAchieved,
  pendingCompletionWrites,
  sortGoalOptions,
  sortGoals,
} from "@/lib/goals";
import {
  EMPTY_DATES,
  HABIT_SELECT,
  type Habit,
  type HabitLog,
  datesByHabit as buildDatesByHabit,
} from "@/lib/habits";
import { dueLabel, localDate, shiftDay } from "@/lib/date";

/** 진행률 계산에만 쓰이므로 과제 전체가 아니라 최소 필드만 가져온다. */
type LinkedAssignment = { id: string; completed: boolean; goal_id: string | null };

const LOG_SELECT = "habit_id, done_on";
const LINKED_SELECT = "id, completed, goal_id";
const EMPTY_LINKED: LinkedAssignment[] = [];
const EMPTY_HABITS: Habit[] = [];

type Loaded =
  | { failed: true }
  | {
      failed: false;
      goals: Goal[];
      linked: LinkedAssignment[];
      habits: Habit[];
      logs: HabitLog[];
    };

export default function GoalPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const today = localDate(new Date());
  const yesterday = shiftDay(today, -1);

  const [goals, setGoals] = useState<Goal[]>([]);
  const [linked, setLinked] = useState<LinkedAssignment[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [logs, setLogs] = useState<HabitLog[]>([]);
  const [fetching, setFetching] = useState(true);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const logsByHabit = useMemo(() => buildDatesByHabit(logs), [logs]);

  // 목표마다 배열 전체를 훑는 대신 goal_id로 한 번만 묶는다.
  const linkedByGoal = useMemo(() => groupByGoal(linked), [linked]);
  const habitsByGoal = useMemo(() => groupByGoal(habits), [habits]);

  const goalOptions = useMemo<GoalOption[]>(
    () => sortGoalOptions(goals),
    [goals]
  );

  // 목표별 진행률을 한 번만 구해 카드 렌더와 달성 판정이 같은 값을 쓰게 한다.
  const progressByGoal = useMemo(() => {
    const m = new Map<string, ReturnType<typeof goalProgress>>();
    for (const g of goals) {
      m.set(
        g.id,
        goalProgress({
          goal: g,
          tasks: linkedByGoal.get(g.id),
          habits: habitsByGoal.get(g.id),
          datesByHabit: logsByHabit,
          today,
        })
      );
    }
    return m;
  }, [goals, linkedByGoal, habitsByGoal, logsByHabit, today]);

  /** 달성한 목표는 여기서 빠지고 Achievement 페이지로 간다. */
  const activeGoals = useMemo(
    () =>
      goals.filter((g) => !isAchieved(g, progressByGoal.get(g.id)?.pct ?? 0)),
    [goals, progressByGoal]
  );

  // 진행률은 저장되지 않으므로, 계산 결과와 서버의 completed_at이 어긋나면 맞춰준다.
  const pendingWrites = useMemo(
    () =>
      pendingCompletionWrites(
        goals.map((g) => ({ goal: g, pct: progressByGoal.get(g.id)?.pct ?? 0 })),
        today
      ),
    [goals, progressByGoal, today]
  );

  const applyCompletion = useCallback(
    (writes: { id: string; completed_at: string | null }[]) => {
      const byId = new Map(writes.map((w) => [w.id, w.completed_at]));
      setGoals((prev) =>
        prev.map((g) =>
          byId.has(g.id) ? { ...g, completed_at: byId.get(g.id) ?? null } : g
        )
      );
    },
    []
  );

  useEffect(() => {
    if (pendingWrites.length === 0) return;
    let ignore = false;
    Promise.all(
      pendingWrites.map((w) =>
        supabase
          .from("goals")
          .update({ completed_at: w.completed_at })
          .eq("id", w.id)
      )
    ).then((results) => {
      if (ignore || results.some((r) => r.error)) return;
      applyCompletion(pendingWrites);
    });
    return () => {
      ignore = true;
    };
  }, [pendingWrites, supabase, applyCompletion]);

  useEffect(() => {
    if (!loading && !user) router.replace("/auth");
  }, [loading, user, router]);

  // 조회는 순수하게 데이터만 만들고, 상태 반영은 then 콜백에서 한다.
  // (effect 본문에서 직접 setState 하면 cascading render가 된다)
  const fetchAll = useCallback(async (): Promise<Loaded | null> => {
    if (!user) return null;
    const [g, a, h, l] = await Promise.all([
      supabase.from("goals").select(GOAL_SELECT).eq("user_id", user.id),
      supabase
        .from("assignments")
        .select(LINKED_SELECT)
        .eq("user_id", user.id)
        .not("goal_id", "is", null),
      supabase.from("daily_habits").select(HABIT_SELECT).eq("user_id", user.id),
      supabase.from("daily_habit_logs").select(LOG_SELECT).eq("user_id", user.id),
    ]);
    if (g.error || a.error || h.error || l.error) return { failed: true };
    return {
      failed: false,
      goals: sortGoals((g.data as Goal[]) ?? []),
      linked: (a.data as LinkedAssignment[]) ?? [],
      habits: ((h.data as Habit[]) ?? []).sort((x, y) =>
        x.created_at.localeCompare(y.created_at)
      ),
      logs: (l.data as HabitLog[]) ?? [],
    };
  }, [supabase, user]);

  const apply = useCallback((res: Loaded | null) => {
    if (!res) return;
    if (res.failed) {
      setError("데이터를 불러오지 못했어요.");
    } else {
      setGoals(res.goals);
      setLinked(res.linked);
      setHabits(res.habits);
      setLogs(res.logs);
    }
    setFetching(false);
  }, []);

  useEffect(() => {
    let ignore = false;
    fetchAll().then((res) => {
      if (!ignore) apply(res);
    });
    return () => {
      ignore = true;
    };
  }, [fetchAll, apply]);

  /** 낙관적 갱신이 실패했을 때 서버 상태로 되돌린다. */
  const load = useCallback(() => {
    fetchAll().then(apply);
  }, [fetchAll, apply]);

  // ---- goals ----
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
      })
      .select(GOAL_SELECT)
      .single();
    if (error || !data) {
      setError("추가하지 못했어요.");
    } else {
      setGoals((prev) => sortGoals([data as Goal, ...prev]));
      setTitle("");
      setDue("");
    }
    setSaving(false);
  };

  const removeGoal = async (goal: Goal) => {
    setGoals((prev) => prev.filter((g) => g.id !== goal.id));
    // goal_id는 on delete set null이므로 연결된 과제는 독립 과제로 남는다.
    setLinked((prev) => prev.filter((a) => a.goal_id !== goal.id));
    const { error } = await supabase.from("goals").delete().eq("id", goal.id);
    if (error) load();
  };

  const toggleComplete = async (goal: Goal) => {
    const next = !goal.completed;
    setGoals((prev) =>
      sortGoals(
        prev.map((g) => (g.id === goal.id ? { ...g, completed: next } : g))
      )
    );
    const { error } = await supabase
      .from("goals")
      .update({ completed: next })
      .eq("id", goal.id);
    if (error) load();
  };

  // ---- daily habits ----
  const changeHabitGoal = async (habit: Habit, next: string) => {
    const nextGoalId = next || null;
    if (nextGoalId === habit.goal_id) return;
    setHabits((prev) =>
      prev.map((h) => (h.id === habit.id ? { ...h, goal_id: nextGoalId } : h))
    );
    const { error } = await supabase
      .from("daily_habits")
      .update({ goal_id: nextGoalId })
      .eq("id", habit.id);
    if (error) {
      setError("목표 연결을 바꾸지 못했어요.");
      load();
    }
  };

  const toggleHabit = async (habit: Habit) => {
    if (!user) return;
    const doneToday = (logsByHabit.get(habit.id) ?? EMPTY_DATES).has(today);
    if (doneToday) {
      setLogs((prev) =>
        prev.filter((l) => !(l.habit_id === habit.id && l.done_on === today))
      );
      const { error } = await supabase
        .from("daily_habit_logs")
        .delete()
        .eq("habit_id", habit.id)
        .eq("done_on", today);
      if (error) load();
    } else {
      setLogs((prev) => [...prev, { habit_id: habit.id, done_on: today }]);
      const { error } = await supabase
        .from("daily_habit_logs")
        .insert({ user_id: user.id, habit_id: habit.id, done_on: today });
      if (error) load();
    }
  };

  const removeHabit = async (habit: Habit) => {
    setHabits((prev) => prev.filter((h) => h.id !== habit.id));
    setLogs((prev) => prev.filter((l) => l.habit_id !== habit.id));
    const { error } = await supabase
      .from("daily_habits")
      .delete()
      .eq("id", habit.id);
    if (error) load();
  };

  return (
    <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
      {/* Achievement는 목표 화면에서만 들어간다. 전체 메인 네비에는 넣지 않는다. */}
      <PageHeader title="/mark-goal.png" alt="Goal">
        <AchievementLink />
      </PageHeader>
      <hr className="mt-[10px] border-t border-[#9da19a]" />

      {loading || !user ? (
        <p className="mt-10 text-sm text-gray-500">불러오는 중...</p>
      ) : (
        <div className="mx-auto mt-8 grid max-w-7xl grid-cols-1 items-start gap-8 lg:grid-cols-2">
          {/* ── 습관 (매일 / 주 N회) ── */}
          <section>
            <h2 className="mb-4 flex items-center gap-2 text-base font-bold text-[#1b2416]">
              습관
              <span className="font-mono text-xs font-normal text-gray-400">
                habits
              </span>
            </h2>

            <HabitForm
              goalOptions={goalOptions}
              onCreated={(habit) => setHabits((prev) => [...prev, habit])}
              onError={setError}
            />

            <ul className="mt-4 flex flex-col gap-2.5">
              {habits.length === 0 ? (
                <li
                  className={`${CARD} px-6 py-8 text-center text-sm text-gray-500`}
                >
                  반복할 습관을 추가해보세요. 매일도, 주 2회도 됩니다.
                </li>
              ) : (
                habits.map((h) => (
                  <HabitCard
                    key={h.id}
                    habit={h}
                    dates={logsByHabit.get(h.id) ?? EMPTY_DATES}
                    today={today}
                    yesterday={yesterday}
                    goals={goalOptions}
                    onToggle={toggleHabit}
                    onChangeGoal={changeHabitGoal}
                    onRemove={removeHabit}
                    onUpdated={(next) =>
                      setHabits((prev) =>
                        prev.map((x) => (x.id === next.id ? next : x))
                      )
                    }
                    onError={setError}
                  />
                ))
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
              ) : activeGoals.length === 0 ? (
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
                    {goals.length === 0
                      ? "아직 세운 목표가 없어요. 첫 목표를 심어보세요."
                      : "진행 중인 목표가 없어요. 달성한 목표는 Achievement에 있어요."}
                  </p>
                </li>
              ) : (
                activeGoals.map((goal) => (
                  <GoalCard
                    key={goal.id}
                    goal={goal}
                    linked={linkedByGoal.get(goal.id) ?? EMPTY_LINKED}
                    habits={habitsByGoal.get(goal.id) ?? EMPTY_HABITS}
                    datesByHabit={logsByHabit}
                    today={today}
                    onToggleComplete={toggleComplete}
                    onRemove={removeGoal}
                  />
                ))
              )}
            </ul>
          </section>
        </div>
      )}
    </main>
  );
}

function GoalCard({
  goal,
  linked,
  habits,
  datesByHabit,
  today,
  onToggleComplete,
  onRemove,
}: {
  goal: Goal;
  linked: LinkedAssignment[];
  habits: Habit[];
  datesByHabit: Map<string, Set<string>>;
  today: string;
  onToggleComplete: (goal: Goal) => void;
  onRemove: (goal: Goal) => void;
}) {
  const { pct, mode, taskDone, taskTotal, habitTotal, itemTotal } = goalProgress({
    goal,
    tasks: linked,
    habits,
    datesByHabit,
    today,
  });
  const dl = dueLabel(goal.due_date);
  return (
    <li className={`${CARD} px-5 py-4 ${goal.completed ? "opacity-60" : ""}`}>
      <div className="flex items-center gap-3">
        <CheckButton
          checked={goal.completed}
          onToggle={() => onToggleComplete(goal)}
          label={goal.completed ? "완료 취소" : "완료 표시"}
        />
        <Link
          href={goalHref(goal.seq)}
          className={`min-w-0 flex-1 truncate text-sm font-semibold transition-colors hover:text-[#24490b] hover:underline ${
            goal.completed ? "text-gray-500 line-through" : "text-[#1b2416]"
          }`}
        >
          {goal.title}
        </Link>
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
          {mode === "auto" ? `${formatPct(pct)}%` : `수동 ${formatPct(pct)}%`}
        </span>
        <button
          type="button"
          onClick={() => onRemove(goal)}
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

      <div className="mt-3">
        <ProgressBar pct={pct} label={`${goal.title} 진행률`} />
      </div>

      {goal.memo && <p className="mt-3 text-sm text-gray-600">{goal.memo}</p>}

      <div className="mt-3 flex items-center justify-between">
        <span className="font-mono text-xs text-gray-400">
          {itemTotal === 0
            ? "연결된 항목 없음"
            : `과제 ${taskDone}/${taskTotal} · 습관 ${habitTotal}`}
        </span>
        <Link
          href={goalHref(goal.seq)}
          className="font-mono text-xs text-[#4d7c2f] transition-colors hover:text-[#24490b]"
        >
          상세 · 수정 →
        </Link>
      </div>
    </li>
  );
}
