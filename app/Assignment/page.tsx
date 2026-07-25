"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";

type Assignment = {
  id: string;
  title: string;
  course: string | null;
  due_date: string | null;
  due_time: string | null;
  completed: boolean;
  created_at: string;
};

const CARD =
  "bg-white/70 backdrop-blur border border-[#9da19a]/30 rounded-3xl shadow-[0_1px_3px_rgba(36,73,11,0.06)]";

function sortAssignments(items: Assignment[]) {
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

export default function AssignmentPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [fetching, setFetching] = useState(true);
  const [title, setTitle] = useState("");
  const [course, setCourse] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace("/auth");
  }, [loading, user, router]);

  const load = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("assignments")
      .select("id, title, course, due_date, due_time, completed, created_at")
      .eq("user_id", user.id);
    if (error) setError("과제를 불러오지 못했어요.");
    else setAssignments(sortAssignments((data as Assignment[]) ?? []));
    setFetching(false);
  }, [supabase, user]);

  useEffect(() => {
    if (!user) return;
    let ignore = false;
    supabase
      .from("assignments")
      .select("id, title, course, due_date, due_time, completed, created_at")
      .eq("user_id", user.id)
      .then(({ data, error }) => {
        if (ignore) return;
        if (error) setError("과제를 불러오지 못했어요.");
        else setAssignments(sortAssignments((data as Assignment[]) ?? []));
        setFetching(false);
      });
    return () => {
      ignore = true;
    };
  }, [user, supabase]);

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
      })
      .select("id, title, course, due_date, due_time, completed, created_at")
      .single();
    if (error || !data) {
      setError("추가하지 못했어요.");
    } else {
      setAssignments((prev) => sortAssignments([...prev, data as Assignment]));
      setTitle("");
      setCourse("");
      setDueDate("");
      setDueTime("");
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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-0">
          <Image
            src="/face.svg"
            alt="LifeOS logo"
            width={90}
            height={90}
            className="h-12 w-12 sm:h-16 sm:w-16 lg:h-[90px] lg:w-[90px]"
          />
          <Image src="/Assignment.png" alt="Assignment" width={0} height={0} sizes="100vw" className="h-14 w-auto sm:h-24 lg:h-40" />
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
        <div className="mx-auto mt-8 max-w-4xl">
          <form
            onSubmit={handleAdd}
            className={`${CARD} flex flex-col gap-3 p-4 sm:flex-row sm:items-center`}
          >
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="과제 제목"
              className="flex-1 rounded-full border border-[#9da19a]/40 bg-white/80 px-4 py-2.5 text-sm outline-none focus:border-[#24490b]"
            />
            <input
              type="text"
              value={course}
              onChange={(e) => setCourse(e.target.value)}
              placeholder="과목 (선택)"
              className="rounded-full border border-[#9da19a]/40 bg-white/80 px-4 py-2.5 text-sm outline-none focus:border-[#24490b] sm:w-32"
            />
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="rounded-full border border-[#9da19a]/40 bg-white/80 px-4 py-2.5 text-sm outline-none focus:border-[#24490b]"
            />
            <input
              type="time"
              value={dueTime}
              onChange={(e) => setDueTime(e.target.value)}
              disabled={!dueDate}
              aria-label="마감 시간 (선택)"
              className="rounded-full border border-[#9da19a]/40 bg-white/80 px-4 py-2.5 text-sm outline-none focus:border-[#24490b] disabled:opacity-40"
            />
            <button
              type="submit"
              disabled={!title.trim() || saving}
              className="flex-none whitespace-nowrap rounded-full border border-[#24490b] bg-[#e2f9d1] px-6 py-2.5 text-sm font-semibold text-[#24490b] transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#24490b]/40 disabled:cursor-not-allowed disabled:opacity-40"
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
              assignments.map((item) => {
                const due = dueLabel(item.due_date);
                return (
                  <li
                    key={item.id}
                    className={`${CARD} flex items-center gap-4 px-5 py-4 transition-shadow hover:shadow-[0_6px_20px_rgba(36,73,11,0.10)] ${
                      item.completed ? "opacity-55" : ""
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleDone(item)}
                      aria-label={item.completed ? "완료 취소" : "완료 표시"}
                      className={`flex h-6 w-6 flex-none items-center justify-center rounded-full border-2 transition-colors ${
                        item.completed
                          ? "border-[#24490b] bg-[#24490b] text-white"
                          : "border-[#9da19a]"
                      }`}
                    >
                      {item.completed && (
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

                    <div className="min-w-0 flex-1">
                      <p
                        className={`truncate text-sm font-medium ${
                          item.completed
                            ? "text-gray-500 line-through"
                            : "text-[#171717]"
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

                    <button
                      type="button"
                      onClick={() => remove(item)}
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
              })
            )}
          </ul>
        </div>
      )}
    </main>
  );
}
