"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";
import NotificationCenter from "@/components/NotificationCenter";
import CheckButton from "@/components/CheckButton";
import CountUp from "@/components/CountUp";
import ProgressBar from "@/components/ProgressBar";
import Won from "@/components/Won";
import {
  type WeeklySummary,
  loadWeeklySummary,
  signedPp,
} from "@/lib/summary";
import { CARD } from "@/lib/ui";
import {
  ASSIGNMENT_SELECT,
  type Assignment,
  GOAL_SELECT,
  type Goal,
  type ProgressMode,
  goalHref,
  goalProgress,
  groupByGoal,
  isAchieved,
  saveProgressSnapshot,
  sortAssignments,
} from "@/lib/goals";
import {
  HABIT_SELECT,
  type Habit,
  currentStreak,
  datesByHabit as buildDatesByHabit,
  isDueToday,
  writeHabitLog,
} from "@/lib/habits";
import { dueLabel, localDate, monthRange, shiftDay } from "@/lib/date";
import { MOOD_SRC } from "@/lib/moods";

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

// 요약은 로그인 후 네비에만 둔다. 랜딩 칩 줄은 네 개 폭에 맞춰져 있어 건드리지 않는다.
const SUMMARY_FEATURE = {
  href: "/Summary",
  label: "요약",
  img: "/sprout-summary.png",
  w: 603,
  h: 636,
};

type DashData = {
  assignments: {
    id: string;
    title: string;
    due_date: string | null;
    due_time: string | null;
  }[];
  income: number;
  expense: number;
  diary: {
    title: string | null;
    content: string;
    mood: string | null;
    entry_date: string;
  } | null;
  goals: {
    id: string;
    seq: number;
    title: string;
    pct: number;
    taskDone: number;
    taskTotal: number;
    habitTotal: number;
    mode: ProgressMode;
  }[];
  habits: (Habit & { dates: string[] })[];
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
  const [summary, setSummary] = useState<WeeklySummary | null>(null);

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
    const { start: mStart, end: mEnd } = monthRange(
      now.getFullYear(),
      now.getMonth() + 1
    );

    Promise.all([
      // 완료된 과제도 가져온다. 목표 진행률이 "완료/전체" 비율이라 분모가 필요하다.
      supabase
        .from("assignments")
        .select(ASSIGNMENT_SELECT)
        .eq("user_id", user.id),
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
      supabase.from("goals").select(GOAL_SELECT).eq("user_id", user.id),
      supabase.from("daily_habits").select(HABIT_SELECT).eq("user_id", user.id),
      supabase
        .from("daily_habit_logs")
        .select("habit_id, done_on")
        .eq("user_id", user.id),
    ]).then(([a, b, d, g, h, l]) => {
      if (ignore) return;

      const allAssignments = (a.data as Assignment[]) ?? [];
      const inc = sortAssignments(allAssignments.filter((x) => !x.completed));

      let income = 0;
      let expense = 0;
      for (const e of (b.data as { type: string; amount: number }[]) ?? []) {
        const amt = Number(e.amount);
        if (e.type === "income") income += amt;
        else expense += amt;
      }

      const logsByHabit = buildDatesByHabit(
        (l.data as { habit_id: string; done_on: string }[] | null) ?? []
      );
      const habitRows = (h.data as Habit[]) ?? [];
      // 주기 필드를 그대로 들고 간다. 오늘 노출 여부(isDueToday)가 이걸 본다.
      const habits = habitRows.map((x) => ({
        ...x,
        dates: Array.from(logsByHabit.get(x.id) ?? []),
      }));

      const goalsAll = (g.data as Goal[]) ?? [];
      const linkedByGoal = groupByGoal(allAssignments);
      const habitsByGoal = groupByGoal(habitRows);
      const gp = goalsAll
        .map((x) => ({
          id: x.id,
          seq: x.seq,
          title: x.title,
          completed: x.completed,
          ...goalProgress({
            goal: x,
            tasks: linkedByGoal.get(x.id),
            habits: habitsByGoal.get(x.id),
            datesByHabit: logsByHabit,
            today,
          }),
        }))
        .sort((p, q) => q.pct - p.pct);

      // 오늘의 진행률을 남긴다. 달성분까지 전부 — 주간 비교는 달성한 목표도 본다.
      saveProgressSnapshot(
        supabase,
        user.id,
        today,
        gp.map((x) => ({ goalId: x.id, pct: x.pct }))
      );

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
        assignments: inc,
        income,
        expense,
        diary: diaryRow,
        // 달성한 목표는 Achievement 페이지로 간다. 대시보드는 진행 중인 것만.
        goals: gp.filter((x) => !isAchieved(x, x.pct)),
        habits,
      });
    });

    return () => {
      ignore = true;
    };
    // today는 YYYY-MM-DD 문자열이라 같은 날 동안은 값이 바뀌지 않는다.
  }, [user, supabase, today]);

  // 요약은 /Summary와 같은 함수를 쓴다. 위 조회와 목표·과제·습관이 겹치지만,
  // ponytail: 계산을 한 곳에 두는 값이 중복 조회보다 크다. 무거워지면 위 Promise.all에
  // 합치고 buildWeeklySummary를 직접 부르면 된다.
  //
  // 습관을 체크하면 준수율이 곧바로 달라지므로 토글 뒤에도 다시 읽는다(toggleToday).
  // 늦게 도착한 응답이 최신 값을 덮지 않도록 순번을 센다.
  const summaryReq = useRef(0);

  useEffect(() => {
    if (!user) return;
    const seq = ++summaryReq.current;
    loadWeeklySummary(supabase, user.id, today).then((s) => {
      if (seq === summaryReq.current) setSummary(s);
    });
  }, [user, supabase, today]);

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
    const error = await writeHabitLog(supabase, {
      userId: user.id,
      habitId: habit.id,
      date: today,
      wasDone: done,
    });
    if (error) {
      apply(base);
      return;
    }
    // ponytail: 클릭당 조회 6번. 부담되면 rows를 들고 있다가 buildWeeklySummary만
    // 다시 돌리면 된다.
    const seq = ++summaryReq.current;
    const s = await loadWeeklySummary(supabase, user.id, today);
    if (seq === summaryReq.current) setSummary(s);
  };

  /**
   * 홈은 "오늘 해야 할 것"만 보여준다. 주기별 노출 규칙은 isDueToday가 정한다.
   * 완료 여부·진행 상황·히트맵 같은 전체 정보는 /Goal의 습관 목록이 책임진다.
   */
  const dueHabits = dash
    ? dash.habits
      .map((h) => ({ habit: h, dateSet: new Set(h.dates) }))
      .filter(({ habit, dateSet }) => isDueToday(habit, dateSet, today))
    : [];

  const dueDoneCount = dueHabits.reduce(
    (n, { dateSet }) => (dateSet.has(today) ? n + 1 : n),
    0
  );

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
          // lg 아래에서는 nav가 로고와 같은 줄에 끼어 칩이 3줄로 깨진다. 아래 줄을
          // 통째로 쓰게 해 한 줄에 담는다. lg는 지금 그대로(flex-none, 폭 자동).
          <nav className="flex w-full flex-none items-center justify-end gap-2 sm:gap-4 lg:w-auto lg:gap-6">
            {/* 칩 5개 + 알림 + Log out은 375px 한 줄에 안 들어간다. 모바일에서만
                칩을 줄이고, 그래도 남으면 줄바꿈시킨다(sm 이상은 지금 그대로). */}
            <div className="flex flex-wrap items-center justify-end gap-1 sm:gap-2 lg:gap-3">
              {[...FEATURES, SUMMARY_FEATURE].map((f) => (
                <Link
                  key={f.href}
                  href={f.href}
                  title={f.label}
                  className="inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-[#9da19a]/30 bg-white/70 px-1.5 py-1.5 backdrop-blur transition-colors hover:border-[#24490b]/40 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#24490b]/40 sm:px-2 lg:pl-2 lg:pr-4"
                >
                  <Image
                    src={f.img}
                    alt={f.label}
                    width={f.w}
                    height={f.h}
                    className="h-6 w-auto sm:h-8"
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
                    <ul className="flex max-h-28 flex-col gap-2 overflow-y-auto pr-1">
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

                {/* 목표 — 진행률 중심. 연결된 과제의 완료 비율이 그대로 진행률이다. */}
                <Widget title="목표" href="/Goal">
                  {dash.goals.length === 0 ? (
                    <EmptyLine text="첫 목표를 심어보세요." />
                  ) : (
                    <div className="flex flex-col gap-4">
                      {/* 3줄까지는 그대로 보이고, 그보다 많으면 목록 안에서 스크롤된다. */}
                      <div className="flex max-h-32 flex-col gap-3 overflow-y-auto pr-1">
                        {dash.goals.map((g) => (
                          <Link
                            key={g.id}
                            href={goalHref(g.seq)}
                            className="group block"
                          >
                            <div className="flex items-center justify-between gap-2 text-sm">
                              <span className="min-w-0 flex-1 truncate text-gray-700 transition-colors group-hover:text-[#24490b]">
                                {g.title}
                              </span>
                              <span className="flex-none text-right font-mono text-xs font-semibold tabular-nums text-[#4d7c2f]">
                                목표율 {Math.round(g.pct)}%
                              </span>
                            </div>
                            <div className="mt-1">
                              <ProgressBar
                                pct={g.pct}
                                className="h-1.5"
                                label={`${g.title} 진행률`}
                              />
                            </div>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                </Widget>

                {/* 오늘 할 일 */}
                <Widget title="오늘 할 일" href="/Goal">
                  {dash.habits.length === 0 ? (
                    <EmptyLine text="매일 습관을 추가해보세요." />
                  ) : dueHabits.length === 0 ? (
                    <EmptyLine text="오늘 예정된 습관을 다 했어요." />
                  ) : (
                    <>
                      <p className="mb-2 font-mono text-sm tabular-nums text-gray-500">
                        <b className="text-[#24490b]">{dueDoneCount}</b>
                        /{dueHabits.length} 완료
                      </p>
                      {/* 4줄까지는 그대로 보이고, 그보다 많으면 목록 안에서 스크롤된다. */}
                      <ul className="flex max-h-[7.5rem] flex-col gap-1.5 overflow-y-auto pr-1">
                        {dueHabits.map(({ habit: h, dateSet }) => {
                          const doneToday = dateSet.has(today);
                          const streak = currentStreak(
                            dateSet,
                            today,
                            yesterday
                          );
                          return (
                            <li
                              key={h.id}
                              className="flex items-center gap-2 text-sm"
                            >
                              <CheckButton
                                checked={doneToday}
                                onToggle={() => toggleToday(h)}
                                label={
                                  doneToday ? "오늘 완료 취소" : "오늘 완료"
                                }
                                variant="sm-circle"
                                pressed
                              />
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

                {/* 이번 주 요약 — 세 값만. 목표별 변화 상세는 /Summary가 맡는다. */}
                <Widget title="이번 주 요약" href="/Summary">
                  {!summary ? (
                    <EmptyLine text="집계하는 중..." />
                  ) : (
                    <dl className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <dt className="text-xs text-gray-500">습관 준수</dt>
                        <dd className="mt-1 font-mono text-lg font-bold tabular-nums text-[#4d7c2f]">
                          {summary.habit.rate === null ? (
                            "-"
                          ) : (
                            <CountUp
                              value={Math.round(summary.habit.rate)}
                              suffix="%"
                            />
                          )}
                        </dd>
                        {summary.habit.deltaPp !== null && (
                          <dd className="font-mono text-[11px] tabular-nums text-gray-400">
                            {signedPp(summary.habit.deltaPp)}
                          </dd>
                        )}
                      </div>
                      <div>
                        <dt className="text-xs text-gray-500">완료 과제</dt>
                        <dd className="mt-1 font-mono text-lg font-bold tabular-nums text-[#1b2416]">
                          {summary.tasksDone}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-gray-500">지출</dt>
                        <dd className="mt-1 font-mono text-sm font-bold tabular-nums text-[#c2603a]">
                          <Won value={summary.spend.total} />
                        </dd>
                        {summary.spend.changePct !== null && (
                          <dd className="font-mono text-[11px] tabular-nums text-gray-400">
                            {summary.spend.changePct > 0 ? "+" : ""}
                            {Math.round(summary.spend.changePct)}%
                          </dd>
                        )}
                      </div>
                    </dl>
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
