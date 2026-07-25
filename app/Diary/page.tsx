"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";

type DiaryEntry = {
  id: string;
  title: string | null;
  content: string;
  mood: string | null;
  entry_date: string;
  created_at: string;
};

const CARD =
  "bg-white/70 backdrop-blur border border-[#9da19a]/30 rounded-3xl shadow-[0_1px_3px_rgba(36,73,11,0.06)]";
const INPUT =
  "rounded-full border border-[#9da19a]/40 bg-white/80 px-4 py-2.5 text-sm outline-none focus:border-[#24490b]";

const MOODS = [
  { key: "happy", src: "/emotion-happy.png", label: "활짝" },
  { key: "smile", src: "/emotion-smile.png", label: "좋음" },
  { key: "neutral", src: "/emotion-neutral.png", label: "보통" },
  { key: "sad", src: "/emotion-sad.png", label: "시무룩" },
  { key: "cry", src: "/emotion-cry.png", label: "울음" },
];
const MOOD_SRC: Record<string, string> = Object.fromEntries(
  MOODS.map((m) => [m.key, m.src])
);

const sortEntries = (rows: DiaryEntry[]) =>
  [...rows].sort((a, b) => {
    if (a.entry_date !== b.entry_date)
      return b.entry_date.localeCompare(a.entry_date);
    return b.created_at.localeCompare(a.created_at);
  });

export default function DiaryPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [fetching, setFetching] = useState(true);
  const [mood, setMood] = useState<string>("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [date, setDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace("/auth");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    let ignore = false;
    supabase
      .from("diary_entries")
      .select("id, title, content, mood, entry_date, created_at")
      .eq("user_id", user.id)
      .then(({ data, error }) => {
        if (ignore) return;
        if (error) setError("일기를 불러오지 못했어요.");
        else setEntries(sortEntries((data as DiaryEntry[]) ?? []));
        setFetching(false);
      });
    return () => {
      ignore = true;
    };
  }, [user, supabase]);

  const reload = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("diary_entries")
      .select("id, title, content, mood, entry_date, created_at")
      .eq("user_id", user.id);
    if (error) setError("일기를 불러오지 못했어요.");
    else setEntries(sortEntries((data as DiaryEntry[]) ?? []));
  };

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
      .select("id, title, content, mood, entry_date, created_at")
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
            src="/Diary.png"
            alt="Diary"
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
      <div className="relative">
        <hr className="mt-[10px] border-t border-[#9da19a]" />
        <Image
          src="/Diary_cheer-up.png"
          alt=""
          width={0}
          height={0}
          sizes="100vw"
          aria-hidden
          className="pointer-events-none absolute left-0 top-[calc(100%+20px)] h-auto w-100 select-none"
        />
      </div>

      {loading || !user ? (
        <p className="mt-10 text-sm text-gray-500">불러오는 중...</p>
      ) : (
        <div className="mx-auto mt-8 max-w-2xl">
          {/* 작성 카드 */}
          <form onSubmit={handleSave} className={`${CARD} flex flex-col gap-3 p-4`}>
            <div className="flex flex-wrap items-center gap-3">
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
                className={INPUT}
              />
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
                  아직 쓴 일기가 없어요. 오늘 하루를 남겨보세요.
                </p>
              </li>
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
                  <button
                    type="button"
                    onClick={() => remove(item)}
                    aria-label="삭제"
                    className="flex-none self-start rounded-full p-2 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
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
              ))
            )}
          </ul>
        </div>
      )}
    </main>
  );
}
