"use client";

// 주간 요약. 집계는 전부 lib/summary의 loadWeeklySummary가 하고, 홈 대시보드의
// 요약 카드도 같은 함수를 쓴다 — 두 화면이 다른 숫자를 보이면 안 된다.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRequireAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";
import PageHeader from "@/components/PageHeader";
import ProgressBar from "@/components/ProgressBar";
import Won from "@/components/Won";
import { CARD } from "@/lib/ui";
import { localDate } from "@/lib/date";
import { formatPct, goalHref } from "@/lib/goals";
import {
  type WeeklySummary,
  loadWeeklySummary,
  signedPp,
} from "@/lib/summary";

/** 큰 숫자 한 칸. 아래 한 줄은 값이 없어도 자리를 지켜 세 칸의 높이를 맞춘다. */
function Stat({
  label,
  value,
  note,
  tone = "text-[#1b2416]",
}: {
  label: string;
  value: React.ReactNode;
  note?: string;
  tone?: string;
}) {
  return (
    <div className="px-1 text-center sm:px-2">
      <p className="text-xs text-gray-500">{label}</p>
      {/* 375px에서 3열이면 한 칸이 111px. text-xl로는 ₩11,010,000이 칸을 넘어
          가운데 구분선을 밟는다. text-sm이면 9자리(₩111,010,000)까지 들어간다. */}
      <p
        className={`mt-1 font-mono text-sm font-bold tabular-nums sm:text-2xl ${tone}`}
      >
        {value}
      </p>
      <p className="mt-1 font-mono text-[11px] tabular-nums text-gray-400">
        {note ?? " "}
      </p>
    </div>
  );
}

export default function SummaryPage() {
  const { user, loading } = useRequireAuth();
  const supabase = useMemo(() => createClient(), []);

  const today = localDate(new Date());
  const [summary, setSummary] = useState<WeeklySummary | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!user) return;
    let ignore = false;
    loadWeeklySummary(supabase, user.id, today).then((res) => {
      if (ignore) return;
      if (res) setSummary(res);
      else setFailed(true);
    });
    return () => {
      ignore = true;
    };
  }, [supabase, user, today]);

  return (
    <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader title="/mark-summary.png" alt="Summary" />
      <hr className="mt-[10px] border-t border-[#9da19a]" />

      {loading || !user ? (
        <p className="mt-10 text-sm text-gray-500">불러오는 중...</p>
      ) : failed ? (
        <p className="mt-10 text-sm text-red-600">요약을 불러오지 못했어요.</p>
      ) : !summary ? (
        <p className="mt-10 text-sm text-gray-500">집계하는 중...</p>
      ) : (
        <div className="mx-auto mt-8 max-w-3xl">
          <p className="font-mono text-xs text-gray-500">
            {summary.week.start.replaceAll("-", ".")} ~{" "}
            {summary.week.end.replaceAll("-", ".")}
          </p>

          <div
            className={`${CARD} mt-3 grid grid-cols-3 divide-x divide-[#9da19a]/20 px-1 py-5 sm:px-2`}
          >
            <Stat
              label="습관 준수율"
              tone="text-[#4d7c2f]"
              value={
                summary.habit.rate === null
                  ? "-"
                  : `${Math.round(summary.habit.rate)}%`
              }
              note={
                summary.habit.rate === null
                  ? "이번 주 예정된 습관 없음"
                  : summary.habit.deltaPp === null
                    ? `습관 ${summary.habit.count}개`
                    : `지난주 대비 ${signedPp(summary.habit.deltaPp)}`
              }
            />
            <Stat
              label="완료한 과제"
              value={summary.tasksDone}
              note={summary.tasksDone === 0 ? "아직 없어요" : undefined}
            />
            <Stat
              label="이번 주 지출"
              tone="text-[#c2603a]"
              value={<Won value={summary.spend.total} />}
              note={
                summary.spend.changePct === null
                  ? "지난주 지출 없음"
                  : `지난주 대비 ${
                      summary.spend.changePct > 0 ? "+" : ""
                    }${Math.round(summary.spend.changePct)}%`
              }
            />
          </div>

          <h2 className="mb-3 mt-8 flex items-center gap-2 text-base font-bold text-[#1b2416]">
            목표 진행률
            <span className="font-mono text-xs font-normal text-gray-400">
              vs 지난주
            </span>
          </h2>

          {summary.goals.length === 0 ? (
            <p
              className={`${CARD} px-6 py-10 text-center text-sm text-gray-500`}
            >
              아직 세운 목표가 없어요.
            </p>
          ) : (
            <>
              {!summary.goalsComparable && (
                <p className="mb-3 rounded-2xl border border-[#9da19a]/30 bg-white/60 px-4 py-3 text-xs text-gray-500">
                  비교할 지난주 기록이 아직 없어요. 앱을 여는 날마다 그날의
                  진행률이 쌓이고, 다음 주가 되면 변화가 표시됩니다.
                </p>
              )}
              <ul className="flex flex-col gap-3">
                {summary.goals.map((g) => (
                  <li key={g.id} className={`${CARD} px-5 py-4`}>
                    <div className="flex items-center gap-3">
                      <Link
                        href={goalHref(g.seq)}
                        className="min-w-0 flex-1 truncate text-sm font-semibold text-[#1b2416] transition-colors hover:text-[#24490b] hover:underline"
                      >
                        {g.title}
                      </Link>
                      <span className="flex-none font-mono text-xs tabular-nums text-gray-500">
                        {formatPct(g.pct)}%
                      </span>
                      <span
                        className={`flex-none font-mono text-xs font-semibold tabular-nums ${
                          g.deltaPp === null || g.deltaPp === 0
                            ? "text-gray-400"
                            : g.deltaPp > 0
                              ? "text-[#4d7c2f]"
                              : "text-[#c2603a]"
                        }`}
                      >
                        {g.deltaPp === null ? "기록 중" : signedPp(g.deltaPp)}
                      </span>
                    </div>
                    <div className="mt-3">
                      <ProgressBar pct={g.pct} label={`${g.title} 진행률`} />
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </main>
  );
}
