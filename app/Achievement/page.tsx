"use client";

// 달성한 목표 보관함. completed_at이 찍힌 목표만 모아 최신순으로 보여준다.
//
// completed_at을 기록·해제하는 쪽은 진행률을 계산하는 화면(/Goal, /Goal/[seq])이다.
// 여기서는 읽기만 한다.

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRequireAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";
import PageHeader, { GoalLink } from "@/components/PageHeader";
import { CARD } from "@/lib/ui";
import { achievedLabel, goalHref, startedLabel } from "@/lib/goals";

/** 연결됐던 항목은 개수만 필요하다. 행을 다 받지 않고 count 집계로 가져온다. */
type CountRow = { count: number }[];

type AchievedRow = {
  id: string;
  seq: number;
  title: string;
  memo: string | null;
  completed_at: string;
  created_at: string;
  assignments: CountRow;
  daily_habits: CountRow;
};

type Achievement = {
  id: string;
  seq: number;
  title: string;
  memo: string | null;
  completed_at: string;
  created_at: string;
  taskCount: number;
  habitCount: number;
};

const ACHIEVED_SELECT =
  "id, seq, title, memo, completed_at, created_at, assignments(count), daily_habits(count)";

const first = (rows: CountRow | null) => rows?.[0]?.count ?? 0;

type Loaded = { failed: true } | { failed: false; items: Achievement[] };

export default function AchievementPage() {
  const { user, loading } = useRequireAuth();
  const supabase = useMemo(() => createClient(), []);

  const [items, setItems] = useState<Achievement[]>([]);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async (): Promise<Loaded | null> => {
    if (!user) return null;
    const { data, error } = await supabase
      .from("goals")
      .select(ACHIEVED_SELECT)
      .eq("user_id", user.id)
      .not("completed_at", "is", null)
      .order("completed_at", { ascending: false });
    if (error) return { failed: true };
    return {
      failed: false,
      items: ((data as AchievedRow[]) ?? []).map((g) => ({
        id: g.id,
        seq: g.seq,
        title: g.title,
        memo: g.memo,
        completed_at: g.completed_at,
        created_at: g.created_at,
        taskCount: first(g.assignments),
        habitCount: first(g.daily_habits),
      })),
    };
  }, [supabase, user]);

  const apply = useCallback((res: Loaded | null) => {
    if (!res) return;
    if (res.failed) setError("불러오지 못했어요.");
    else setItems(res.items);
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

  return (
    <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader title="/mark-achievement.png" alt="Achievement">
        <GoalLink />
      </PageHeader>
      <hr className="mt-[10px] border-t border-[#9da19a]" />

      {loading || !user || fetching ? (
        <p className="mt-10 text-sm text-gray-500">불러오는 중...</p>
      ) : (
        <div className="mx-auto mt-8 max-w-3xl">
          {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

          <p className="mb-4 font-mono text-xs text-gray-500">
            달성한 목표 {items.length}개
          </p>

          <ul className="flex flex-col gap-3">
            {items.length === 0 ? (
              <li
                className={`${CARD} flex flex-col items-center gap-3 px-6 py-14 text-center`}
              >
                <Image
                  src="/trophy.png"
                  alt=""
                  width={64}
                  height={64}
                  className="opacity-40"
                />
                <p className="text-sm text-gray-500">
                  아직 달성한 목표가 없어요.
                </p>
                <p className="text-xs text-gray-400">
                  연결된 과제와 습관을 모두 채우면 여기에 쌓입니다.
                </p>
              </li>
            ) : (
              items.map((g) => (
                <li
                  key={g.id}
                  className="rounded-3xl border border-[#24490b]/25 bg-[#e2f9d1]/70 px-5 py-4 shadow-[0_1px_3px_rgba(36,73,11,0.08)] backdrop-blur transition-shadow hover:shadow-[0_6px_20px_rgba(36,73,11,0.12)]"
                >
                  <div className="flex items-center gap-4">
                    <Image
                      src="/trophy.png"
                      alt=""
                      width={44}
                      height={44}
                      className="h-11 w-11 flex-none"
                    />
                    <div className="min-w-0 flex-1">
                      <Link
                        href={goalHref(g.seq)}
                        className="block truncate text-sm font-bold text-[#24490b] transition-colors hover:underline"
                      >
                        {g.title}
                      </Link>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 font-mono text-xs tabular-nums">
                        <span className="text-gray-500">
                          {startedLabel(g.created_at)}
                        </span>
                        <span aria-hidden="true" className="text-gray-400">
                          →
                        </span>
                        <span className="font-semibold text-[#4d7c2f]">
                          {achievedLabel(g.completed_at)}
                        </span>
                      </p>
                      {g.memo && (
                        <p className="mt-1 truncate text-xs text-gray-600">
                          {g.memo}
                        </p>
                      )}
                    </div>
                    <div className="flex-none text-right font-mono text-xs tabular-nums text-gray-500">
                      <p>과제 {g.taskCount}</p>
                      <p>습관 {g.habitCount}</p>
                    </div>
                  </div>

                  {/* 달성했으므로 진행률 바는 꽉 찬 상태로 고정한다. */}
                  <div
                    role="progressbar"
                    aria-valuenow={100}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${g.title} 진행률`}
                    className="mt-3 h-2 w-full overflow-hidden rounded-full bg-[#24490b]/15"
                  >
                    <div className="h-full w-full rounded-full bg-[#24490b]" />
                  </div>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </main>
  );
}
