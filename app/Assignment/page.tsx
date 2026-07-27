"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";
import CheckButton from "@/components/CheckButton";
import PageHeader from "@/components/PageHeader";
import PencilIcon from "@/components/PencilIcon";
import { CARD, PRIMARY_BTN } from "@/lib/ui";
import {
  ASSIGNMENT_SELECT,
  type Assignment,
  GOAL_OPTION_SELECT,
  type GoalOption,
  goalHref,
  sortAssignments,
  sortGoalOptions,
} from "@/lib/goals";
import {
  DEFAULT_FREQUENCY,
  FREQUENCY_OPTIONS,
  parseFrequency,
} from "@/lib/habits";
import { dueLabel } from "@/lib/date";

const NO_GOAL = "";

const FIELD =
  "rounded-full border border-[#9da19a]/40 bg-white/80 px-4 py-2.5 text-sm outline-none focus:border-[#24490b]";

type Loaded =
  | { failed: true }
  | { failed: false; assignments: Assignment[]; goals: GoalOption[] };

export default function AssignmentPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [goals, setGoals] = useState<GoalOption[]>([]);
  const [fetching, setFetching] = useState(true);
  const [title, setTitle] = useState("");
  const [course, setCourse] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [goalId, setGoalId] = useState<string>(NO_GOAL);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const goalById = useMemo(() => {
    const m = new Map<string, GoalOption>();
    for (const g of goals) m.set(g.id, g);
    return m;
  }, [goals]);

  useEffect(() => {
    if (!loading && !user) router.replace("/auth");
  }, [loading, user, router]);

  // 조회는 순수하게, 상태 반영은 then 콜백에서 (effect 본문 setState 회피).
  const fetchAll = useCallback(async (): Promise<Loaded | null> => {
    if (!user) return null;
    const [a, g] = await Promise.all([
      supabase
        .from("assignments")
        .select(ASSIGNMENT_SELECT)
        .eq("user_id", user.id),
      supabase.from("goals").select(GOAL_OPTION_SELECT).eq("user_id", user.id),
    ]);
    if (a.error || g.error) return { failed: true };
    return {
      failed: false,
      assignments: sortAssignments((a.data as Assignment[]) ?? []),
      goals: sortGoalOptions((g.data as GoalOption[]) ?? []),
    };
  }, [supabase, user]);

  const apply = useCallback((res: Loaded | null) => {
    if (!res) return;
    if (res.failed) {
      setError("과제를 불러오지 못했어요.");
    } else {
      setAssignments(res.assignments);
      setGoals(res.goals);
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

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed || !user || saving) return;
    setSaving(true);
    setError(null);
    const { data, error } = await supabase
      .from("assignments")
      .insert({
        user_id: user.id,
        title: trimmed,
        course: course.trim() || null,
        due_date: dueDate || null,
        due_time: dueDate && dueTime ? dueTime : null,
        goal_id: goalId || null,
      })
      .select(ASSIGNMENT_SELECT)
      .single();
    if (error || !data) {
      setError("추가하지 못했어요.");
    } else {
      setAssignments((prev) => sortAssignments([...prev, data as Assignment]));
      setTitle("");
      setCourse("");
      setDueDate("");
      setDueTime("");
      setGoalId(NO_GOAL);
    }
    setSaving(false);
  };

  const toggleDone = async (item: Assignment) => {
    const next = !item.completed;
    setAssignments((prev) =>
      sortAssignments(
        prev.map((a) => (a.id === item.id ? { ...a, completed: next } : a))
      )
    );
    const { error } = await supabase
      .from("assignments")
      .update({ completed: next, updated_at: new Date().toISOString() })
      .eq("id", item.id);
    if (error) load();
  };

  const changeGoal = async (item: Assignment, next: string) => {
    const nextGoalId = next || null;
    if (nextGoalId === item.goal_id) return;
    setAssignments((prev) =>
      prev.map((a) => (a.id === item.id ? { ...a, goal_id: nextGoalId } : a))
    );
    const { error } = await supabase
      .from("assignments")
      .update({ goal_id: nextGoalId, updated_at: new Date().toISOString() })
      .eq("id", item.id);
    if (error) {
      setError("목표 연결을 바꾸지 못했어요.");
      load();
    }
  };

  /** 저장 성공 여부를 돌려준다. 실패하면 카드가 편집 상태를 유지해 입력이 날아가지 않는다. */
  const saveEdit = async (
    item: Assignment,
    patch: Pick<Assignment, "title" | "course" | "due_date" | "due_time">
  ) => {
    setAssignments((prev) =>
      sortAssignments(
        prev.map((a) => (a.id === item.id ? { ...a, ...patch } : a))
      )
    );
    const { error } = await supabase
      .from("assignments")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", item.id);
    if (error) {
      setError("과제를 수정하지 못했어요.");
      load();
      return false;
    }
    setError(null);
    return true;
  };

  /**
   * 일회성 과제를 반복 습관으로 옮긴다. 제목과 목표 연결은 유지하고,
   * 마감일·과목은 습관에 해당 개념이 없어 버린다.
   *
   * 두 문장(습관 생성 + 과제 삭제)이 한 트랜잭션이 아니다. 삭제가 실패하면
   * 습관과 과제가 둘 다 남으므로 그 경우를 사용자에게 명시적으로 알린다.
   */
  const convertToHabit = async (item: Assignment, frequency: string) => {
    if (!user) return false;
    setError(null);
    const { error: insertError } = await supabase.from("daily_habits").insert({
      user_id: user.id,
      title: item.title,
      goal_id: item.goal_id,
      ...parseFrequency(frequency),
    });
    if (insertError) {
      setError("습관으로 전환하지 못했어요.");
      return false;
    }
    const { error: deleteError } = await supabase
      .from("assignments")
      .delete()
      .eq("id", item.id);
    if (deleteError) {
      setError(
        `"${item.title}" 습관은 만들어졌지만 원래 과제를 지우지 못했어요. 과제를 직접 삭제해주세요.`
      );
      load();
      return true;
    }
    setAssignments((prev) => prev.filter((a) => a.id !== item.id));
    return true;
  };

  const remove = async (item: Assignment) => {
    setAssignments((prev) => prev.filter((a) => a.id !== item.id));
    const { error } = await supabase
      .from("assignments")
      .delete()
      .eq("id", item.id);
    if (error) load();
  };

  return (
    <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader title="/mark-assignment.png" alt="Assignment" />
      <hr className="mt-[10px] border-t border-[#9da19a]" />

      {loading || !user ? (
        <p className="mt-10 text-sm text-gray-500">불러오는 중...</p>
      ) : (
        <div className="mx-auto mt-8 max-w-4xl">
          <form
            onSubmit={handleAdd}
            className={`${CARD} flex flex-col gap-3 p-4 sm:flex-row sm:flex-wrap sm:items-center`}
          >
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="과제 제목"
              className={`${FIELD} flex-1 sm:min-w-[12rem]`}
            />
            <input
              type="text"
              value={course}
              onChange={(e) => setCourse(e.target.value)}
              placeholder="과목 (선택)"
              className={`${FIELD} sm:w-32`}
            />
            <select
              value={goalId}
              onChange={(e) => setGoalId(e.target.value)}
              aria-label="연결할 목표 (선택)"
              className={`${FIELD} sm:w-44`}
            >
              <option value={NO_GOAL}>목표 없음</option>
              {goals.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.completed ? `${g.title} (완료)` : g.title}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className={FIELD}
            />
            <input
              type="time"
              value={dueTime}
              onChange={(e) => setDueTime(e.target.value)}
              disabled={!dueDate}
              aria-label="마감 시간 (선택)"
              className={`${FIELD} disabled:opacity-40`}
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

          <ul className="mt-6 flex flex-col gap-3">
            {fetching ? (
              <li className="text-sm text-gray-500">불러오는 중...</li>
            ) : assignments.length === 0 ? (
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
                  아직 등록된 과제가 없어요. 위에서 첫 과제를 추가해보세요.
                </p>
              </li>
            ) : (
              assignments.map((item) => (
                <AssignmentRow
                  key={item.id}
                  item={item}
                  goals={goals}
                  linkedGoal={
                    item.goal_id ? goalById.get(item.goal_id) : undefined
                  }
                  onToggle={toggleDone}
                  onChangeGoal={changeGoal}
                  onSaveEdit={saveEdit}
                  onConvertToHabit={convertToHabit}
                  onRemove={remove}
                />
              ))
            )}
          </ul>
        </div>
      )}
    </main>
  );
}

function AssignmentRow({
  item,
  goals,
  linkedGoal,
  onToggle,
  onChangeGoal,
  onSaveEdit,
  onConvertToHabit,
  onRemove,
}: {
  item: Assignment;
  goals: GoalOption[];
  /** 목록 로드가 늦어 goals에 아직 없을 수 있어 별도로 받는다. */
  linkedGoal: GoalOption | undefined;
  onToggle: (item: Assignment) => void;
  onChangeGoal: (item: Assignment, next: string) => void;
  onSaveEdit: (
    item: Assignment,
    patch: Pick<Assignment, "title" | "course" | "due_date" | "due_time">
  ) => Promise<boolean>;
  onConvertToHabit: (item: Assignment, frequency: string) => Promise<boolean>;
  onRemove: (item: Assignment) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [converting, setConverting] = useState(false);
  const [convertFreq, setConvertFreq] = useState<string>(DEFAULT_FREQUENCY);
  const [convertBusy, setConvertBusy] = useState(false);
  const [eTitle, setETitle] = useState(item.title);
  const [eCourse, setECourse] = useState(item.course ?? "");
  const [eDate, setEDate] = useState(item.due_date ?? "");
  const [eTime, setETime] = useState(item.due_time?.slice(0, 5) ?? "");
  const [savingEdit, setSavingEdit] = useState(false);

  const startEdit = () => {
    // 편집을 열 때마다 현재 값으로 되맞춘다. 취소했다가 다시 열어도 최신 값이 보인다.
    setETitle(item.title);
    setECourse(item.course ?? "");
    setEDate(item.due_date ?? "");
    setETime(item.due_time?.slice(0, 5) ?? "");
    setEditing(true);
  };

  const submitEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = eTitle.trim();
    if (!trimmed || savingEdit) return;
    setSavingEdit(true);
    const ok = await onSaveEdit(item, {
      title: trimmed,
      course: eCourse.trim() || null,
      due_date: eDate || null,
      // 마감 시간은 날짜가 있을 때만 의미가 있다 (추가 폼과 동일한 규칙)
      due_time: eDate && eTime ? eTime : null,
    });
    setSavingEdit(false);
    if (ok) setEditing(false);
  };

  const submitConvert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (convertBusy) return;
    setConvertBusy(true);
    const ok = await onConvertToHabit(item, convertFreq);
    setConvertBusy(false);
    if (ok) setConverting(false);
  };

  if (converting) {
    return (
      <li className={`${CARD} px-5 py-4`}>
        <form onSubmit={submitConvert} className="flex flex-col gap-3">
          <p className="text-sm text-[#1b2416]">
            <b>{item.title}</b>을(를) 반복 습관으로 옮깁니다.
          </p>
          <p className="text-xs text-gray-500">
            제목과 목표 연결은 그대로 유지됩니다. 습관에는 마감일 개념이 없어
            마감일{item.course ? "과 과목은" : "은"} 사라집니다.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={convertFreq}
              onChange={(e) => setConvertFreq(e.target.value)}
              aria-label="반복 주기"
              className={`${FIELD} sm:w-28`}
            >
              {FREQUENCY_OPTIONS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
            <button type="submit" disabled={convertBusy} className={PRIMARY_BTN}>
              전환
            </button>
            <button
              type="button"
              onClick={() => setConverting(false)}
              className="flex-none whitespace-nowrap rounded-full border border-[#9da19a]/50 px-5 py-2.5 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-100"
            >
              취소
            </button>
          </div>
        </form>
      </li>
    );
  }

  if (editing) {
    return (
      <li className={`${CARD} px-5 py-4`}>
        <form onSubmit={submitEdit} className="flex flex-col gap-3">
          <input
            type="text"
            value={eTitle}
            onChange={(e) => setETitle(e.target.value)}
            placeholder="과제 제목"
            aria-label="과제 제목"
            className={`${FIELD} w-full`}
          />
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="text"
              value={eCourse}
              onChange={(e) => setECourse(e.target.value)}
              placeholder="과목 (선택)"
              aria-label="과목 (선택)"
              className={`${FIELD} sm:w-32`}
            />
            <input
              type="date"
              value={eDate}
              onChange={(e) => setEDate(e.target.value)}
              aria-label="마감기한 (선택)"
              className={FIELD}
            />
            <input
              type="time"
              value={eTime}
              onChange={(e) => setETime(e.target.value)}
              disabled={!eDate}
              aria-label="마감 시간 (선택)"
              className={`${FIELD} disabled:opacity-40`}
            />
            <button
              type="submit"
              disabled={!eTitle.trim() || savingEdit}
              className={PRIMARY_BTN}
            >
              저장
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="flex-none whitespace-nowrap rounded-full border border-[#9da19a]/50 px-5 py-2.5 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-100"
            >
              취소
            </button>
          </div>
        </form>
      </li>
    );
  }

  const due = dueLabel(item.due_date);
  return (
    <li
      className={`${CARD} flex items-center gap-4 px-5 py-4 transition-shadow hover:shadow-[0_6px_20px_rgba(36,73,11,0.10)] ${
        item.completed ? "opacity-55" : ""
      }`}
    >
      <CheckButton
        checked={item.completed}
        onToggle={() => onToggle(item)}
        label={item.completed ? "완료 취소" : "완료 표시"}
      />

      <div className="min-w-0 flex-1">
        <p
          className={`truncate text-sm font-medium ${
            item.completed ? "text-gray-500 line-through" : "text-[#171717]"
          }`}
        >
          {item.title}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {item.course && (
            <span className="inline-block rounded-full bg-[#9da19a]/20 px-2.5 py-0.5 text-xs text-gray-600">
              {item.course}
            </span>
          )}
          {/* 목표 연결은 여기서 바로 바꾼다. 별도 편집 화면 없이 1:N 연결을 관리한다. */}
          <select
            value={item.goal_id ?? ""}
            onChange={(e) => onChangeGoal(item, e.target.value)}
            aria-label={`${item.title}의 연결 목표`}
            title="연결할 목표"
            className={`max-w-[12rem] truncate rounded-full border px-2.5 py-0.5 text-xs outline-none transition-colors focus:border-[#24490b] ${
              item.goal_id
                ? "border-[#24490b]/30 bg-[#e2f9d1] text-[#24490b]"
                : "border-[#9da19a]/40 bg-white/60 text-gray-400"
            }`}
          >
            <option value="">목표 없음</option>
            {goals.map((g) => (
              <option key={g.id} value={g.id}>
                {g.completed ? `${g.title} (완료)` : g.title}
              </option>
            ))}
            {/* 목록에 없는 목표에 연결돼 있으면(로드 지연 등) 값이 사라지지 않도록 보강 */}
            {item.goal_id && !goals.some((g) => g.id === item.goal_id) && (
              <option value={item.goal_id}>{linkedGoal?.title ?? "목표"}</option>
            )}
          </select>
          {linkedGoal && (
            <Link
              href={goalHref(linkedGoal.seq)}
              className="font-mono text-[11px] text-[#4d7c2f] transition-colors hover:text-[#24490b]"
            >
              목표 보기 →
            </Link>
          )}
        </div>
      </div>

      {(due || item.due_time) && (
        <div className="flex flex-none flex-col items-end leading-tight">
          {due && (
            <span
              className={`font-mono text-xs font-semibold tabular-nums ${
                item.completed
                  ? "text-gray-400"
                  : due.overdue
                    ? "text-red-600"
                    : due.soon
                      ? "text-orange-500"
                      : "text-gray-500"
              }`}
            >
              {due.text}
            </span>
          )}
          {item.due_time && (
            <span className="font-mono text-[11px] tabular-nums text-gray-400">
              {item.due_time.slice(0, 5)}
            </span>
          )}
        </div>
      )}

      {/* 반복해야 하는 일을 과제로 만들어두면 체크가 다음 날 리셋되지 않는다.
          그럴 때 기록을 새로 만들지 않고 습관 쪽으로 옮기는 경로. */}
      <button
        type="button"
        onClick={() => setConverting(true)}
        aria-label="습관으로 전환"
        title="반복되는 일이면 습관으로 전환"
        className="flex-none whitespace-nowrap rounded-full border border-[#9da19a]/50 px-2.5 py-1 font-mono text-[11px] text-gray-500 transition-colors hover:border-[#24490b]/40 hover:text-[#24490b]"
      >
        습관으로
      </button>

      <button
        type="button"
        onClick={startEdit}
        aria-label="과제 수정"
        title="과제 수정"
        className="flex-none rounded-full p-2 text-gray-400 transition-colors hover:bg-[#e2f9d1] hover:text-[#24490b]"
      >
        <PencilIcon />
      </button>

      <button
        type="button"
        onClick={() => onRemove(item)}
        aria-label="삭제"
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
    </li>
  );
}
