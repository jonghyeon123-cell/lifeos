"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";
import NotificationCenter from "@/components/NotificationCenter";

// The four LifeOS features — sprout mascots cropped from public/Landing.png.
// Drives both the signed-in header nav and the landing chips.
const FEATURES = [
  {
    href: "/Assignment",
    label: "과제",
    img: "/sprout-assignment.png",
    w: 332,
    h: 376,
  },
  { href: "/Budget", label: "예산", img: "/sprout-budget.png", w: 346, h: 368 },
  { href: "/Diary", label: "일기", img: "/sprout-diary.png", w: 262, h: 360 },
  { href: "/Goal", label: "목표", img: "/sprout-goal.png", w: 368, h: 322 },
];

const CARD =
  "bg-white/70 backdrop-blur border border-[#9da19a]/30 rounded-3xl shadow-[0_1px_3px_rgba(36,73,11,0.06)]";

const MOOD_SRC: Record<string, string> = {
  happy: "/emotion-happy.png",
  smile: "/emotion-smile.png",
  neutral: "/emotion-neutral.png",
  sad: "/emotion-sad.png",
  cry: "/emotion-cry.png",
};

const pad = (n: number) => String(n).padStart(2, "0");
const localDate = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const shiftDay = (s: string, delta: number) => {
  const [y, m, d] = s.split("-").map(Number);
  return localDate(new Date(y, m - 1, d + delta));
};

function dueLabel(due: string | null) {
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

function currentStreak(set: Set<string>, today: string, yesterday: string) {
  const anchor = set.has(today) ? today : set.has(yesterday) ? yesterday : null;
  if (!anchor) return 0;
  let n = 0;
  let cur = anchor;
  while (set.has(cur)) {
    n++;
    cur = shiftDay(cur, -1);
  }
  return n;
}

function Won({ value }: { value: number }) {
  return (
    <>
      <span className="mr-0.5 align-[0.05em] text-[0.7em] font-normal opacity-70">
        ₩
      </span>
      {new Intl.NumberFormat("ko-KR").format(value)}
    </>
  );
}

type DashData = {
  assignments: {
    id: string;
    title: string;
    due_date: string | null;
    due_time: string | null;
  }[];
  assignmentCount: number;
  income: number;
  expense: number;
  diary: {
    title: string | null;
    content: string;
    mood: string | null;
    entry_date: string;
  } | null;
  goals: { id: string; title: string; pct: number }[];
  goalCount: number;
  habits: { id: string; title: string; dates: string[] }[];
};

function Widget({
  title,
  href,
  children,
}: {
  title: string;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`${CARD} flex flex-col p-5`}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-bold text-[#1b2416]">{title}</h2>
        <Link
          href={href}
          className="font-mono text-xs text-[#4d7c2f] transition-colors hover:text-[#24490b]"
        >
          전체 보기 →
        </Link>
      </div>
      {children}
    </section>
  );
}

function EmptyLine({ text }: { text: string }) {
  return <p className="py-2 text-sm text-gray-400">{text}</p>;
}

export default function Home() {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [dash, setDash] = useState<DashData | null>(null);

  const today = localDate(new Date());
  const yesterday = shiftDay(today, -1);

  const handleLogOut = async () => {
    await signOut();
    router.push("/");
  };

  useEffect(() => {
    if (!user) return;
    let ignore = false;
    const now = new Date();
    const mStart = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const mEnd = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(lastDay)}`;

    Promise.all([
      supabase
        .from("assignments")
        .select("id, title, due_date, due_time, completed")
        .eq("user_id", user.id)
        .eq("completed", false),
      supabase
        .from("budget_entries")
        .select("type, amount")
        .eq("user_id", user.id)
        .gte("entry_date", mStart)
        .lte("entry_date", mEnd),
      supabase
        .from("diary_entries")
        .select("title, content, mood, entry_date, created_at")
        .eq("user_id", user.id)
        .order("entry_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1),
      supabase
        .from("goals")
        .select("id, title, tasks, completed")
        .eq("user_id", user.id),
      supabase.from("daily_habits").select("id, title").eq("user_id", user.id),
      supabase
        .from("daily_habit_logs")
        .select("habit_id, done_on")
        .eq("user_id", user.id),
    ]).then(([a, b, d, g, h, l]) => {
      if (ignore) return;

      const inc = (
        (a.data as {
          id: string;
          title: string;
          due_date: string | null;
          due_time: string | null;
        }[]) ?? []
      ).sort((x, y) => {
        if (x.due_date && y.due_date) {
          const c = x.due_date.localeCompare(y.due_date);
          if (c !== 0) return c;
          return (x.due_time ?? "99:99").localeCompare(y.due_time ?? "99:99");
        }
        if (x.due_date) return -1;
        if (y.due_date) return 1;
        return 0;
      });

      let income = 0;
      let expense = 0;
      for (const e of (b.data as { type: string; amount: number }[]) ?? []) {
        const amt = Number(e.amount);
        if (e.type === "income") income += amt;
        else expense += amt;
      }

      const goalsAll =
        (g.data as {
          id: string;
          title: string;
          tasks: { done: boolean }[] | null;
          completed: boolean;
        }[]) ?? [];
      const gp = goalsAll
        .filter((x) => !x.completed)
        .map((x) => {
          const tasks = Array.isArray(x.tasks) ? x.tasks : [];
          const done = tasks.filter((t) => t.done).length;
          return {
            id: x.id,
            title: x.title,
            pct: tasks.length ? Math.round((done / tasks.length) * 100) : 0,
          };
        })
        .sort((p, q) => q.pct - p.pct);

      const logsByHabit = new Map<string, Set<string>>();
      const logRows =
        (l.data as { habit_id: string; done_on: string }[] | null) ?? [];
      for (const lg of logRows) {
        let s = logsByHabit.get(lg.habit_id);
        if (!s) {
          s = new Set();
          logsByHabit.set(lg.habit_id, s);
        }
        s.add(lg.done_on);
      }
      const habits = (
        (h.data as { id: string; title: string }[]) ?? []
      ).map((x) => {
        const s = logsByHabit.get(x.id) ?? new Set<string>();
        return { id: x.id, title: x.title, dates: Array.from(s) };
      });

      const diaryRow =
        (
          d.data as {
            title: string | null;
            content: string;
            mood: string | null;
            entry_date: string;
          }[]
        )?.[0] ?? null;

      setDash({
        assignments: inc.slice(0, 3),
        assignmentCount: inc.length,
        income,
        expense,
        diary: diaryRow,
        goals: gp.slice(0, 3),
        goalCount: gp.length,
        habits,
      });
    });

    return () => {
      ignore = true;
    };
  }, [user, supabase]);

  const toggleToday = async (habit: { id: string; dates: string[] }) => {
    if (!user) return;
    const base = habit.dates ?? [];
    const done = base.includes(today);
    const nextDates = done
      ? base.filter((d) => d !== today)
      : [...base, today];
    const apply = (dates: string[]) =>
      setDash((prev) =>
        prev
          ? {
            ...prev,
            habits: prev.habits.map((h) =>
              h.id === habit.id ? { ...h, dates } : h
            ),
          }
          : prev
      );
    apply(nextDates);
    const { error } = done
      ? await supabase
        .from("daily_habit_logs")
        .delete()
        .eq("habit_id", habit.id)
        .eq("done_on", today)
      : await supabase
        .from("daily_habit_logs")
        .insert({ user_id: user.id, habit_id: habit.id, done_on: today });
    if (error) apply(base);
  };

  // The landing stays pinned to one screen on desktop; mobile stacks and scrolls.
  const rootClass =
    !loading && !user
      ? "flex min-h-screen flex-col lg:h-screen lg:overflow-hidden"
      : "flex min-h-screen flex-col";

  return (
    <div className={rootClass}>
      <header className="flex flex-wrap items-center justify-between gap-y-3 px-4 pt-4 sm:px-6 lg:px-8 lg:pt-6">
        <div className="flex items-center gap-0">
          <Image
            src="/face.svg"
            alt="LifeOS logo"
            width={100}
            height={100}
            className="h-14 w-14 sm:h-20 sm:w-20 lg:h-[100px] lg:w-[100px]"
          />
          <Image
            src="/LifeOS.png"
            alt="LifeOS"
            width={0}
            height={0}
            sizes="100vw"
            className="h-16 w-auto sm:h-24 lg:h-40"
          />
        </div>

        {!loading && user ? (
          <nav className="flex flex-1 items-center justify-end gap-2 sm:gap-4 lg:flex-none lg:gap-6">
            <div className="flex items-center gap-1.5 sm:gap-2 lg:gap-3">
              {FEATURES.map((f) => (
                <Link
                  key={f.href}
                  href={f.href}
                  title={f.label}
                  className="inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-[#9da19a]/30 bg-white/70 px-2 py-1.5 backdrop-blur transition-colors hover:border-[#24490b]/40 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#24490b]/40 lg:pl-2 lg:pr-4"
                >
                  <Image
                    src={f.img}
                    alt={f.label}
                    width={f.w}
                    height={f.h}
                    className="h-7 w-auto sm:h-8"
                  />
                  <span className="hidden text-sm font-semibold text-[#1b2416] lg:inline">
                    {f.label}
                  </span>
                </Link>
              ))}
            </div>
            <NotificationCenter />
            <button
              type="button"
              onClick={handleLogOut}
              className="rounded-full border border-[#171717] bg-transparent px-3 py-2 text-xs font-semibold text-[#171717] transition-colors hover:bg-[#171717]/10 sm:px-6 sm:py-3 sm:text-sm"
            >
              Log out
            </button>
          </nav>
        ) : null}
      </header>

      <hr className="mx-4 mt-[6px] border-t border-[#9da19a] sm:mx-6 lg:mx-8" />

      {loading ? (
        <main className="flex-1 px-4 py-10 sm:px-6 lg:px-8">
          <p className="text-sm text-gray-500">불러오는 중...</p>
        </main>
      ) : user ? (
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="mx-auto max-w-6xl">
            <div className="mb-6 flex items-center gap-3">
              <Image src="/face.svg" alt="" width={44} height={44} />
              <div>
                <p className="text-lg font-bold text-[#1b2416]">
                  오늘도 한 걸음씩 🌱
                </p>
              </div>
            </div>

            {!dash ? (
              <p className="text-sm text-gray-500">요약을 불러오는 중...</p>
            ) : (
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {/* 과제 */}
                <Widget title="과제" href="/Assignment">
                  {dash.assignments.length === 0 ? (
                    <EmptyLine text="임박한 과제가 없어요 🎉" />
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {dash.assignments.map((a) => {
                        const dl = dueLabel(a.due_date);
                        return (
                          <li
                            key={a.id}
                            className="flex items-center gap-2 text-sm"
                          >
                            <span className="min-w-0 flex-1 truncate text-gray-700">
                              {a.title}
                            </span>
                            {(dl || a.due_time) && (
                              <div className="flex flex-none flex-col items-end leading-tight">
                                {dl && (
                                  <span
                                    className={`font-mono text-xs font-semibold tabular-nums ${dl.overdue
                                      ? "text-red-600"
                                      : dl.soon
                                        ? "text-orange-500"
                                        : "text-gray-500"
                                      }`}
                                  >
                                    {dl.text}
                                  </span>
                                )}
                                {a.due_time && (
                                  <span className="font-mono text-[11px] tabular-nums text-gray-400">
                                    {a.due_time.slice(0, 5)}
                                  </span>
                                )}
                              </div>
                            )}
                          </li>
                        );
                      })}
                      {dash.assignmentCount > 3 && (
                        <li className="text-xs text-gray-400">
                          +{dash.assignmentCount - 3}개 더
                        </li>
                      )}
                    </ul>
                  )}
                </Widget>

                {/* 이번 달 예산 */}
                <Widget title="이번 달 예산" href="/Budget">
                  <div>
                    <p className="text-xs text-gray-500">잔액</p>
                    <p
                      className={`font-mono text-2xl font-bold tabular-nums ${dash.income - dash.expense < 0
                        ? "text-[#c2603a]"
                        : "text-[#4d7c2f]"
                        }`}
                    >
                      <Won value={dash.income - dash.expense} />
                    </p>
                    <div className="mt-2 flex gap-4 font-mono text-xs tabular-nums">
                      <span className="text-[#4d7c2f]">
                        수입 <Won value={dash.income} />
                      </span>
                      <span className="text-[#c2603a]">
                        지출 <Won value={dash.expense} />
                      </span>
                    </div>
                  </div>
                </Widget>

                {/* 최근 일기 */}
                <Widget title="최근 일기" href="/Diary">
                  {!dash.diary ? (
                    <EmptyLine text="오늘 하루를 남겨보세요." />
                  ) : (
                    <div className="flex gap-3">
                      {dash.diary.mood && MOOD_SRC[dash.diary.mood] && (
                        <Image
                          src={MOOD_SRC[dash.diary.mood]}
                          alt=""
                          width={36}
                          height={36}
                          className="h-9 w-9 flex-none"
                        />
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs tabular-nums text-gray-400">
                            {dash.diary.entry_date.replaceAll("-", ".")}
                          </span>
                          {dash.diary.title && (
                            <span className="truncate text-sm font-semibold text-[#1b2416]">
                              {dash.diary.title}
                            </span>
                          )}
                        </div>
                        <p className="mt-1 line-clamp-2 text-sm text-gray-600">
                          {dash.diary.content}
                        </p>
                      </div>
                    </div>
                  )}
                </Widget>

                {/* 목표 */}
                <Widget title="목표" href="/Goal">
                  {dash.goals.length === 0 ? (
                    <EmptyLine text="첫 목표를 심어보세요." />
                  ) : (
                    <div className="flex flex-col gap-3">
                      {dash.goals.map((g) => (
                        <div key={g.id}>
                          <div className="flex items-center justify-between gap-2 text-sm">
                            <span className="min-w-0 flex-1 truncate text-gray-700">
                              {g.title}
                            </span>
                            <span className="flex-none font-mono text-xs tabular-nums text-gray-500">
                              {g.pct}%
                            </span>
                          </div>
                          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[#9da19a]/25">
                            <div
                              className="h-full rounded-full bg-[#24490b]"
                              style={{ width: `${g.pct}%` }}
                            />
                          </div>
                        </div>
                      ))}
                      {dash.goalCount > 3 && (
                        <p className="text-xs text-gray-400">
                          +{dash.goalCount - 3}개 더
                        </p>
                      )}
                    </div>
                  )}
                </Widget>

                {/* 오늘 할 일 */}
                <Widget title="오늘 할 일" href="/Goal">
                  {dash.habits.length === 0 ? (
                    <EmptyLine text="매일 습관을 추가해보세요." />
                  ) : (
                    <>
                      <p className="mb-2 font-mono text-sm tabular-nums text-gray-500">
                        <b className="text-[#24490b]">
                          {
                            dash.habits.filter((h) =>
                              (h.dates ?? []).includes(today)
                            ).length
                          }
                        </b>
                        /{dash.habits.length} 완료
                      </p>
                      <ul className="flex flex-col gap-1.5">
                        {dash.habits.slice(0, 4).map((h) => {
                          const dates = h.dates ?? [];
                          const doneToday = dates.includes(today);
                          const streak = currentStreak(
                            new Set(dates),
                            today,
                            yesterday
                          );
                          return (
                            <li
                              key={h.id}
                              className="flex items-center gap-2 text-sm"
                            >
                              <button
                                type="button"
                                onClick={() => toggleToday(h)}
                                aria-label={
                                  doneToday ? "오늘 완료 취소" : "오늘 완료"
                                }
                                aria-pressed={doneToday}
                                style={{ height: 18, width: 18 }}
                                className={`flex flex-none items-center justify-center rounded-full border transition-colors ${doneToday
                                  ? "border-[#24490b] bg-[#24490b]"
                                  : "border-[#9da19a] hover:border-[#24490b]"
                                  }`}
                              >
                                {doneToday && (
                                  <svg
                                    width="10"
                                    height="10"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="#fff"
                                    strokeWidth="4"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  >
                                    <path d="M20 6 9 17l-5-5" />
                                  </svg>
                                )}
                              </button>
                              <span
                                className={`min-w-0 flex-1 truncate ${doneToday ? "text-gray-400" : "text-gray-700"
                                  }`}
                              >
                                {h.title}
                              </span>
                              {streak > 0 && (
                                <span className="flex-none font-mono text-xs text-[#4d7c2f]">
                                  🔥{streak}
                                </span>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </>
                  )}
                </Widget>
              </div>
            )}
          </div>
        </main>
      ) : (
        <main className="flex flex-1 flex-col items-center gap-8 px-4 pb-10 sm:px-6 lg:flex-row lg:items-start lg:justify-between lg:gap-0 lg:px-8 lg:pb-0">
          <div className="flex flex-col items-center gap-6 pt-4 lg:items-start lg:gap-7 lg:pt-[20px]">
            <Image
              src="/cheer up.png"
              alt="작은 실천이 모여 큰 변화를 만들어요. 오늘도, 당신의 삶을 응원합니다."
              width={0}
              height={0}
              sizes="100vw"
              className="h-auto w-full max-w-[320px] lg:h-[213px] lg:w-auto"
              priority
            />

            <Link
              href="/auth"
              className="rounded-full bg-[#24490b] px-8 py-3.5 text-base font-semibold text-white shadow-[0_1px_3px_rgba(36,73,11,0.15)] transition-colors hover:bg-[#2f5e0e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#24490b]/40 lg:ml-[40px] lg:mt-[10px]"
            >
              START →
            </Link>

            <ul className="flex flex-wrap justify-center gap-2 sm:gap-3 lg:ml-[30px] lg:mt-[100px] lg:flex-nowrap lg:items-center">
              {FEATURES.map((f) => (
                <li
                  key={f.label}
                  className="inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-[#9da19a]/30 bg-white/70 py-1.5 pl-2 pr-4 backdrop-blur"
                >
                  <Image
                    src={f.img}
                    alt=""
                    width={f.w}
                    height={f.h}
                    className="h-8 w-auto sm:h-10"
                  />
                  <span className="text-sm font-semibold text-[#1b2416]">
                    {f.label}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <Image
            src="/lifeos_charcter.png"
            alt="LifeOS character"
            width={714}
            height={714}
            className="h-auto w-56 max-w-full sm:w-72 lg:-mr-8 lg:w-[476px] lg:self-end"
            priority
          />
        </main>
      )}
    </div>
  );
}
