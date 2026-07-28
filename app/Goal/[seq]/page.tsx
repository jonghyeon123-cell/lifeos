"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useRequireAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";
import CheckButton from "@/components/CheckButton";
import PageHeader, { GoalLink } from "@/components/PageHeader";
import PencilIcon from "@/components/PencilIcon";
import ProgressBar from "@/components/ProgressBar";
import { CARD, INPUT, PRIMARY_BTN, SECONDARY_BTN } from "@/lib/ui";
import {
  ASSIGNMENT_SELECT,
  type Assignment,
  GOAL_SELECT,
  type Goal,
  achievedLabel,
  formatPct,
  goalProgress,
  pendingCompletionWrites,
  setAssignmentCompleted,
  sortAssignments,
} from "@/lib/goals";
import {
  EMPTY_DATES,
  HABIT_SELECT,
  type Habit,
  type HabitLog,
  datesByHabit as buildDatesByHabit,
  sortHabits,
  writeHabitLog,
} from "@/lib/habits";
import HabitCard from "@/components/HabitCard";
import HabitForm from "@/components/HabitForm";
import { dueLabel, localDate, shiftDay } from "@/lib/date";

type Loaded =
  | { status: "error" }
  | { status: "missing" }
  | {
      status: "ok";
      goal: Goal;
      items: Assignment[];
      habits: Habit[];
      logs: HabitLog[];
    };


export default function GoalDetailPage() {
  const { user, loading } = useRequireAuth();
  const params = useParams<{ seq: string }>();
  // URL은 사용자별 번호다. 숫자가 아니면 조회 자체를 하지 않는다.
  const goalSeq = Number(params.seq);
  const validSeq = Number.isInteger(goalSeq) && goalSeq > 0;
  const supabase = useMemo(() => createClient(), []);

  const today = localDate(new Date());
  const yesterday = shiftDay(today, -1);

  const [goal, setGoal] = useState<Goal | null>(null);
  const [items, setItems] = useState<Assignment[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [logs, setLogs] = useState<HabitLog[]>([]);
  const [fetching, setFetching] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [draftTitle, setDraftTitle] = useState("");
  const [draftDue, setDraftDue] = useState("");
  const [saving, setSaving] = useState(false);

  // 목표 자체(제목·메모·마감일) 수정
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editMemo, setEditMemo] = useState("");
  const [editDue, setEditDue] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  // 수동 진행률 슬라이더는 서버 왕복을 기다리지 않고 즉시 움직여야 하므로 별도 상태로 둔다.
  const [manualDraft, setManualDraft] = useState<number | null>(null);

  // 조회는 순수하게, 상태 반영은 then 콜백에서 (effect 본문 setState 회피).
  const fetchAll = useCallback(async (): Promise<Loaded | null> => {
    if (!user) return null;
    if (!validSeq) return { status: "missing" };
    const [g, l] = await Promise.all([
      // URL은 seq인데 자식은 goal_id(uuid)로 연결돼 있다. seq를 먼저 uuid로
      // 바꾸면 왕복이 하나 늘어나므로, 중첩 select로 한 번에 받는다.
      // 중첩 행에도 각 테이블의 RLS가 그대로 적용된다.
      supabase
        .from("goals")
        .select(
          `${GOAL_SELECT}, assignments(${ASSIGNMENT_SELECT}), daily_habits(${HABIT_SELECT})`
        )
        .eq("user_id", user.id)
        .eq("seq", goalSeq)
        .maybeSingle(),
      // 습관 id를 먼저 알아야 로그를 좁힐 수 있다. 개인 규모 데이터라
      // 전체를 한 번에 받아 클라이언트에서 묶는 편이 빠르다.
      supabase
        .from("daily_habit_logs")
        .select("habit_id, done_on")
        .eq("user_id", user.id),
    ]);
    if (g.error || l.error) return { status: "error" };
    if (!g.data) return { status: "missing" };

    const {
      assignments = [],
      daily_habits = [],
      ...goal
    } = g.data as Goal & { assignments: Assignment[]; daily_habits: Habit[] };

    return {
      status: "ok",
      goal,
      items: sortAssignments(assignments),
      habits: sortHabits(daily_habits),
      logs: (l.data as HabitLog[]) ?? [],
    };
  }, [supabase, user, goalSeq, validSeq]);

  const apply = useCallback((res: Loaded | null) => {
    if (!res) return;
    if (res.status === "error") setError("불러오지 못했어요.");
    else if (res.status === "missing") setNotFound(true);
    else {
      setGoal(res.goal);
      setItems(res.items);
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

  const logsByHabit = useMemo(() => buildDatesByHabit(logs), [logs]);

  const progress = useMemo(
    () =>
      goal
        ? goalProgress({
            goal: { ...goal, manual_progress: manualDraft ?? goal.manual_progress },
            tasks: items,
            habits,
            datesByHabit: logsByHabit,
            today,
          })
        : null,
    [goal, items, habits, logsByHabit, manualDraft, today]
  );

  // 진행률이 100%에 닿거나 다시 내려가면 서버의 completed_at을 맞춘다.
  // progress가 items·habits·logs에서 파생되므로 어떤 토글이든 여기로 수렴한다.
  const pendingWrites = useMemo(
    () =>
      goal && progress
        ? pendingCompletionWrites([{ goal, pct: progress.pct }], today)
        : [],
    [goal, progress, today]
  );

  useEffect(() => {
    const write = pendingWrites[0];
    if (!write) return;
    let ignore = false;
    supabase
      .from("goals")
      .update({ completed_at: write.completed_at })
      .eq("id", write.id)
      .then(({ error }) => {
        if (ignore || error) return;
        setGoal((prev) =>
          prev ? { ...prev, completed_at: write.completed_at } : prev
        );
      });
    return () => {
      ignore = true;
    };
  }, [pendingWrites, supabase]);

  // 과제 완료 체크 → 낙관적 반영. progress는 items에서 파생되므로 즉시 갱신된다.
  const toggleDone = async (item: Assignment) => {
    const next = !item.completed;
    setItems((prev) =>
      sortAssignments(
        prev.map((a) => (a.id === item.id ? { ...a, completed: next } : a))
      )
    );
    const error = await setAssignmentCompleted(supabase, item.id, next);
    if (error) load();
  };

  const addAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = draftTitle.trim();
    if (!trimmed || !user || !goal || saving) return;
    setSaving(true);
    setError(null);
    const { data, error } = await supabase
      .from("assignments")
      .insert({
        user_id: user.id,
        title: trimmed,
        due_date: draftDue || null,
        goal_id: goal.id,
      })
      .select(ASSIGNMENT_SELECT)
      .single();
    if (error || !data) {
      setError("과제를 추가하지 못했어요.");
    } else {
      setItems((prev) => sortAssignments([...prev, data as Assignment]));
      setDraftTitle("");
      setDraftDue("");
    }
    setSaving(false);
  };

  /** 습관 체크. logs가 바뀌면 progress가 파생 재계산되어 진행률이 즉시 움직인다. */
  const toggleHabit = async (habit: Habit) => {
    if (!user) return;
    const wasDone = (logsByHabit.get(habit.id) ?? EMPTY_DATES).has(today);
    setLogs((prev) =>
      wasDone
        ? prev.filter((l) => !(l.habit_id === habit.id && l.done_on === today))
        : [...prev, { habit_id: habit.id, done_on: today }]
    );
    const error = await writeHabitLog(supabase, {
      userId: user.id,
      habitId: habit.id,
      date: today,
      wasDone,
    });
    if (error) load();
  };

  /** 목표에서만 떼어낸다. 습관 자체와 기록은 그대로 남는다. */
  const unlinkHabit = async (habit: Habit) => {
    setHabits((prev) => prev.filter((h) => h.id !== habit.id));
    const { error } = await supabase
      .from("daily_habits")
      .update({ goal_id: null })
      .eq("id", habit.id);
    if (error) load();
  };

  /** 목표에서만 떼어낸다. 과제 자체는 독립 과제로 남아 /Assignment에 계속 보인다. */
  const unlink = async (item: Assignment) => {
    setItems((prev) => prev.filter((a) => a.id !== item.id));
    const { error } = await supabase
      .from("assignments")
      .update({ goal_id: null, updated_at: new Date().toISOString() })
      .eq("id", item.id);
    if (error) load();
  };

  const commitManual = async (value: number) => {
    if (!goal) return;
    setGoal((prev) => (prev ? { ...prev, manual_progress: value } : prev));
    setManualDraft(null);
    const { error } = await supabase
      .from("goals")
      .update({ manual_progress: value })
      .eq("id", goal.id);
    if (error) load();
  };

  const startEdit = () => {
    if (!goal) return;
    setEditTitle(goal.title);
    setEditMemo(goal.memo ?? "");
    setEditDue(goal.due_date ?? "");
    setEditing(true);
  };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = editTitle.trim();
    if (!trimmed || !goal || savingEdit) return;
    setSavingEdit(true);
    setError(null);
    const patch = {
      title: trimmed,
      memo: editMemo.trim() || null,
      due_date: editDue || null,
    };
    const { error } = await supabase
      .from("goals")
      .update(patch)
      .eq("id", goal.id);
    if (error) {
      setError("목표를 수정하지 못했어요.");
    } else {
      setGoal((prev) => (prev ? { ...prev, ...patch } : prev));
      setEditing(false);
    }
    setSavingEdit(false);
  };

  const toggleGoalComplete = async () => {
    if (!goal) return;
    const next = !goal.completed;
    setGoal({ ...goal, completed: next });
    const { error } = await supabase
      .from("goals")
      .update({ completed: next })
      .eq("id", goal.id);
    if (error) load();
  };

  const dl = goal ? dueLabel(goal.due_date) : null;

  return (
    <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader title="/mark-goal.png" alt="Goal">
        <GoalLink />
      </PageHeader>
      <hr className="mt-[10px] border-t border-[#9da19a]" />

      {loading || !user || fetching ? (
        <p className="mt-10 text-sm text-gray-500">불러오는 중...</p>
      ) : notFound || !goal || !progress ? (
        <div className="mx-auto mt-10 max-w-3xl">
          <p className="text-sm text-gray-500">
            목표를 찾을 수 없어요.{" "}
            <Link href="/Goal" className="text-[#4d7c2f] hover:underline">
              목표 목록으로
            </Link>
          </p>
        </div>
      ) : (
        <div className="mx-auto mt-8 flex max-w-3xl flex-col gap-5">
          {/* ── 진행률 ── */}
          <section className={`${CARD} px-6 py-5`}>
            {editing ? (
              <form onSubmit={saveEdit} className="flex flex-col gap-3">
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="목표 제목"
                  aria-label="목표 제목"
                  className={`${INPUT} w-full`}
                />
                <textarea
                  value={editMemo}
                  onChange={(e) => setEditMemo(e.target.value)}
                  placeholder="메모 (선택)"
                  aria-label="메모"
                  rows={2}
                  className="w-full resize-y rounded-2xl border border-[#9da19a]/40 bg-white/80 px-4 py-2.5 text-sm outline-none focus:border-[#24490b]"
                />
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    type="date"
                    value={editDue}
                    onChange={(e) => setEditDue(e.target.value)}
                    aria-label="마감기한 (선택)"
                    className={INPUT}
                  />
                  <button
                    type="submit"
                    disabled={!editTitle.trim() || savingEdit}
                    className={PRIMARY_BTN}
                  >
                    저장
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(false)}
                    className={SECONDARY_BTN}
                  >
                    취소
                  </button>
                </div>
              </form>
            ) : (
              <div className="flex items-start gap-3">
                <CheckButton
                  checked={goal.completed}
                  onToggle={toggleGoalComplete}
                  label={goal.completed ? "완료 취소" : "완료 표시"}
                />
                <div className="min-w-0 flex-1">
                  <h1
                    className={`text-lg font-bold ${
                      goal.completed
                        ? "text-gray-500 line-through"
                        : "text-[#1b2416]"
                    }`}
                  >
                    {goal.title}
                  </h1>
                  {goal.memo && (
                    <p className="mt-1 text-sm text-gray-600">{goal.memo}</p>
                  )}
                </div>
                {/* 달성한 뒤에는 남은 기간이 의미가 없으니 달성일로 바꾼다. */}
                {goal.completed_at ? (
                  <span className="flex flex-none items-center gap-1.5 rounded-full bg-[#e2f9d1] px-3 py-1 font-mono text-xs font-semibold tabular-nums text-[#24490b]">
                    <Image src="/trophy.png" alt="" width={16} height={16} />
                    {achievedLabel(goal.completed_at)}
                  </span>
                ) : dl ? (
                  <span
                    className={`flex-none font-mono text-sm font-semibold tabular-nums ${
                      dl.overdue
                        ? "text-red-600"
                        : dl.soon
                          ? "text-orange-500"
                          : "text-gray-500"
                    }`}
                  >
                    {dl.text}
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={startEdit}
                  aria-label="목표 수정"
                  title="목표 수정"
                  className="flex-none rounded-full p-2 text-gray-400 transition-colors hover:bg-[#e2f9d1] hover:text-[#24490b]"
                >
                  <PencilIcon />
                </button>
              </div>
            )}

            <div className="mt-5 flex items-baseline justify-between">
              <span className="font-mono text-3xl font-bold tabular-nums text-[#24490b]">
                {formatPct(progress.pct)}%
              </span>
              <span className="font-mono text-xs tabular-nums text-gray-500">
                {progress.mode === "auto"
                  ? `과제 ${progress.taskDone}/${progress.taskTotal} · 습관 ${progress.habitTotal}`
                  : "연결된 항목 없음 · 수동 진행률"}
              </span>
            </div>
            <div className="mt-2">
              <ProgressBar
                pct={progress.pct}
                className="h-3"
                label={`${goal.title} 진행률`}
              />
            </div>

            {/* 연결된 과제가 없을 때만 수동 입력 (fallback) */}
            {progress.mode === "manual" && (
              <div className="mt-4 flex items-center gap-3">
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={manualDraft ?? goal.manual_progress}
                  onChange={(e) => setManualDraft(Number(e.target.value))}
                  onPointerUp={(e) =>
                    commitManual(Number(e.currentTarget.value))
                  }
                  onKeyUp={(e) => commitManual(Number(e.currentTarget.value))}
                  aria-label="수동 진행률"
                  className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-[#9da19a]/25 accent-[#24490b]"
                />
                <span className="w-12 flex-none text-right font-mono text-xs tabular-nums text-gray-500">
                  {manualDraft ?? goal.manual_progress}%
                </span>
              </div>
            )}
          </section>

          {/* ── 연결된 과제 ── */}
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-base font-bold text-[#1b2416]">
              연결된 과제
              <span className="font-mono text-xs font-normal text-gray-400">
                {progress.taskTotal}
              </span>
            </h2>

            <form
              onSubmit={addAssignment}
              className={`${CARD} flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center`}
            >
              <input
                type="text"
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                placeholder="이 목표에 필요한 과제"
                className={`${INPUT} flex-1`}
              />
              <input
                type="date"
                value={draftDue}
                onChange={(e) => setDraftDue(e.target.value)}
                aria-label="마감기한 (선택)"
                className={INPUT}
              />
              <button
                type="submit"
                disabled={!draftTitle.trim() || saving}
                className={PRIMARY_BTN}
              >
                추가
              </button>
            </form>

            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

            <ul className="mt-4 flex flex-col gap-2">
              {items.length === 0 ? (
                <li
                  className={`${CARD} px-6 py-8 text-center text-sm text-gray-500`}
                >
                  아직 연결된 과제가 없어요. 위에서 추가하거나,{" "}
                  <Link
                    href="/Assignment"
                    className="text-[#4d7c2f] hover:underline"
                  >
                    과제 페이지
                  </Link>
                  에서 기존 과제를 이 목표에 연결해보세요.
                </li>
              ) : (
                items.map((item) => {
                  const itemDue = dueLabel(item.due_date);
                  return (
                    <li
                      key={item.id}
                      className={`${CARD} flex items-center gap-3 px-5 py-3.5 ${
                        item.completed ? "opacity-55" : ""
                      }`}
                    >
                      <CheckButton
                        checked={item.completed}
                        onToggle={() => toggleDone(item)}
                        label={item.completed ? "완료 취소" : "완료 표시"}
                        variant="sm-square"
                      />
                      <div className="min-w-0 flex-1">
                        <p
                          className={`truncate text-sm ${
                            item.completed
                              ? "text-gray-400 line-through"
                              : "text-gray-700"
                          }`}
                        >
                          {item.title}
                        </p>
                        {item.course && (
                          <span className="mt-1 inline-block rounded-full bg-[#9da19a]/20 px-2.5 py-0.5 text-xs text-gray-600">
                            {item.course}
                          </span>
                        )}
                      </div>
                      {itemDue && (
                        <span
                          className={`flex-none font-mono text-xs font-semibold tabular-nums ${
                            item.completed
                              ? "text-gray-400"
                              : itemDue.overdue
                                ? "text-red-600"
                                : itemDue.soon
                                  ? "text-orange-500"
                                  : "text-gray-500"
                          }`}
                        >
                          {itemDue.text}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => unlink(item)}
                        title="목표에서 연결 해제 (과제는 유지)"
                        className="flex-none rounded-full border border-[#9da19a]/50 px-2.5 py-1 font-mono text-[11px] text-gray-500 transition-colors hover:border-[#24490b]/40 hover:text-[#24490b]"
                      >
                        연결 해제
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </section>

          {/* ── 연결된 습관 ── */}
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-base font-bold text-[#1b2416]">
              연결된 습관
              <span className="font-mono text-xs font-normal text-gray-400">
                {habits.length}
              </span>
            </h2>

            {/* 여기서 만든 습관은 이 목표에 붙은 채로 생성된다. */}
            <HabitForm
              goalId={goal.id}
              onCreated={(habit) => setHabits((prev) => [...prev, habit])}
              onError={setError}
            />

            <ul className="mt-4 flex flex-col gap-2.5">
              {habits.length === 0 ? (
                <li
                  className={`${CARD} px-6 py-8 text-center text-sm text-gray-500`}
                >
                  아직 연결된 습관이 없어요. 위에서 추가하거나,{" "}
                  <Link href="/Goal" className="text-[#4d7c2f] hover:underline">
                    습관 목록
                  </Link>
                  에서 기존 습관을 이 목표에 연결해보세요.
                </li>
              ) : (
                habits.map((h) => (
                  <HabitCard
                    key={h.id}
                    habit={h}
                    dates={logsByHabit.get(h.id) ?? EMPTY_DATES}
                    today={today}
                    yesterday={yesterday}
                    onToggle={toggleHabit}
                    onUnlink={unlinkHabit}
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
        </div>
      )}
    </main>
  );
}
