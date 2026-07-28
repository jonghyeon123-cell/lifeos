"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRequireAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";
import EmptyCard from "@/components/EmptyCard";
import PageHeader from "@/components/PageHeader";
import TrashButton from "@/components/TrashButton";
import { CARD, INPUT } from "@/lib/ui";
import { MOODS, MOOD_SRC } from "@/lib/moods";

type DiaryEntry = {
  id: string;
  title: string | null;
  content: string;
  mood: string | null;
  entry_date: string;
  created_at: string;
};

const ENTRY_SELECT = "id, title, content, mood, entry_date, created_at";

type Loaded = { failed: true } | { failed: false; entries: DiaryEntry[] };

const sortEntries = (rows: DiaryEntry[]) =>
  [...rows].sort((a, b) => {
    if (a.entry_date !== b.entry_date)
      return b.entry_date.localeCompare(a.entry_date);
    return b.created_at.localeCompare(a.created_at);
  });

export default function DiaryPage() {
  const { user, loading } = useRequireAuth();
  const supabase = useMemo(() => createClient(), []);

  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [fetching, setFetching] = useState(true);
  const [mood, setMood] = useState<string>("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [date, setDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 조회는 순수하게, 상태 반영은 then 콜백에서 (과제·목표 페이지와 같은 형태).
  const fetchAll = useCallback(async (): Promise<Loaded | null> => {
    if (!user) return null;
    const { data, error } = await supabase
      .from("diary_entries")
      .select(ENTRY_SELECT)
      .eq("user_id", user.id);
    if (error) return { failed: true };
    return { failed: false, entries: sortEntries((data as DiaryEntry[]) ?? []) };
  }, [supabase, user]);

  const apply = useCallback((res: Loaded | null) => {
    if (!res) return;
    if (res.failed) setError("일기를 불러오지 못했어요.");
    else setEntries(res.entries);
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

  /** 낙관적 삭제가 실패했을 때 서버 상태로 되돌린다. */
  const reload = useCallback(() => {
    fetchAll().then(apply);
  }, [fetchAll, apply]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = content.trim();
    if (!trimmed || !user || saving) return;
    setSaving(true);
    setError(null);
    const { data, error } = await supabase
      .from("diary_entries")
      .insert({
        user_id: user.id,
        title: title.trim() || null,
        content: trimmed,
        mood: mood || null,
        entry_date: date || undefined,
      })
      .select(ENTRY_SELECT)
      .single();
    if (error || !data) {
      setError("저장하지 못했어요.");
    } else {
      setEntries((prev) => sortEntries([data as DiaryEntry, ...prev]));
      setMood("");
      setTitle("");
      setContent("");
      setDate("");
    }
    setSaving(false);
  };

  const remove = async (item: DiaryEntry) => {
    setEntries((prev) => prev.filter((a) => a.id !== item.id));
    const { error } = await supabase
      .from("diary_entries")
      .delete()
      .eq("id", item.id);
    if (error) reload();
  };

  return (
    <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader title="/mark-diary.png" alt="Diary" />
      <div className="relative">
        <hr className="mt-[10px] border-t border-[#9da19a]" />
        {/* w-100(400px)은 375px 화면을 넘겨 페이지 전체에 가로 스크롤을 만든다. */}
        <Image
          src="/Diary_cheer-up.png"
          alt=""
          width={0}
          height={0}
          sizes="100vw"
          aria-hidden
          className="pointer-events-none absolute left-0 top-[calc(100%+20px)] h-auto w-64 select-none sm:w-100"
        />
      </div>

      {loading || !user ? (
        <p className="mt-10 text-sm text-gray-500">불러오는 중...</p>
      ) : (
        <div className="mx-auto mt-8 max-w-2xl">
          {/* 작성 카드 */}
          <form onSubmit={handleSave} className={`${CARD} flex flex-col gap-3 p-4`}>
            {/* Narrow screens drop the title/date pair below the mood row so the
                title keeps a usable width; desktop stays on one line. */}
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <div className="flex gap-1.5">
                {MOODS.map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => setMood(mood === m.key ? "" : m.key)}
                    aria-label={`기분 ${m.label}`}
                    aria-pressed={mood === m.key}
                    className={`flex h-11 w-11 items-center justify-center rounded-full p-1 transition ${mood === m.key
                      ? "bg-[#e2f9d1] ring-2 ring-[#24490b]"
                      : "bg-white/80 hover:bg-[#e2f9d1]/60"
                      }`}
                  >
                    <Image
                      src={m.src}
                      alt=""
                      width={34}
                      height={34}
                      className={mood === m.key ? "" : "opacity-60"}
                    />
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-3 sm:min-w-0 sm:flex-1">
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="제목 (선택)"
                  className={`${INPUT} min-w-0 flex-1`}
                />
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className={`${INPUT} shrink-0`}
                />
              </div>
            </div>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="오늘 하루는 어땠나요?"
              rows={4}
              className="resize-none rounded-2xl border border-[#9da19a]/40 bg-white/80 px-4 py-3 text-sm outline-none focus:border-[#24490b]"
            />
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={!content.trim() || saving}
                className="rounded-full border border-[#24490b] bg-[#e2f9d1] px-6 py-2.5 text-sm font-semibold text-[#24490b] transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#24490b]/40 disabled:cursor-not-allowed disabled:opacity-40"
              >
                저장
              </button>
            </div>
          </form>

          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

          {/* 일기 목록 */}
          <ul className="mt-6 flex flex-col gap-3">
            {fetching ? (
              <li className="text-sm text-gray-500">불러오는 중...</li>
            ) : entries.length === 0 ? (
              <EmptyCard>아직 쓴 일기가 없어요. 오늘 하루를 남겨보세요.</EmptyCard>
            ) : (
              entries.map((item) => (
                <li
                  key={item.id}
                  className={`${CARD} flex gap-4 px-5 py-4 transition-shadow hover:shadow-[0_6px_20px_rgba(36,73,11,0.10)]`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {item.mood && MOOD_SRC[item.mood] && (
                        <Image
                          src={MOOD_SRC[item.mood]}
                          alt=""
                          width={22}
                          height={22}
                          className="flex-none"
                        />
                      )}
                      <span className="font-mono text-xs tabular-nums text-gray-400">
                        {item.entry_date.replaceAll("-", ".")}
                      </span>
                      {item.title && (
                        <span className="truncate text-sm font-semibold text-[#1b2416]">
                          {item.title}
                        </span>
                      )}
                    </div>
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm text-gray-700">
                      {item.content}
                    </p>
                  </div>
                  <TrashButton
                    onClick={() => remove(item)}
                    className="self-start"
                  />
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </main>
  );
}
