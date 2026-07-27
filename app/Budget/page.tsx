"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";
import PageHeader from "@/components/PageHeader";

type EntryType = "income" | "expense";

type BudgetEntry = {
  id: string;
  type: EntryType;
  amount: number;
  category: string | null;
  memo: string | null;
  entry_date: string;
  created_at: string;
};

const CARD =
  "bg-white/70 backdrop-blur border border-[#9da19a]/30 rounded-3xl shadow-[0_1px_3px_rgba(36,73,11,0.06)]";
const INPUT =
  "rounded-full border border-[#9da19a]/40 bg-white/80 px-4 py-2.5 text-sm outline-none focus:border-[#24490b]";

const EXPENSE_CATEGORIES = ["식비", "교통", "쇼핑", "문화", "주거", "기타"];
const INCOME_CATEGORIES = ["급여", "용돈", "기타"];

const pad = (n: number) => String(n).padStart(2, "0");
const fmt = (n: number) => new Intl.NumberFormat("ko-KR").format(n);

function Won({ value }: { value: number }) {
  return (
    <>
      <span className="mr-0.5 align-[0.05em] text-[0.72em] font-normal opacity-70">
        ₩
      </span>
      {fmt(value)}
    </>
  );
}

export default function BudgetPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [year, setYear] = useState<number>(() => new Date().getFullYear());
  const [month, setMonth] = useState<number>(() => new Date().getMonth()); // 0-11

  const range = useMemo(() => {
    const start = `${year}-${pad(month + 1)}-01`;
    const lastDay = new Date(year, month + 1, 0).getDate();
    const end = `${year}-${pad(month + 1)}-${pad(lastDay)}`;
    return { start, end };
  }, [year, month]);

  const [entries, setEntries] = useState<BudgetEntry[]>([]);
  const [fetching, setFetching] = useState(true);
  const [type, setType] = useState<EntryType>("expense");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [memo, setMemo] = useState("");
  const [date, setDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace("/auth");
  }, [loading, user, router]);

  const normalize = (rows: BudgetEntry[]) =>
    rows
      .map((r) => ({ ...r, amount: Number(r.amount) }))
      .sort((a, b) => b.entry_date.localeCompare(a.entry_date));

  const load = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("budget_entries")
      .select("id, type, amount, category, memo, entry_date, created_at")
      .eq("user_id", user.id)
      .gte("entry_date", range.start)
      .lte("entry_date", range.end);
    if (error) setError("내역을 불러오지 못했어요.");
    else setEntries(normalize((data as BudgetEntry[]) ?? []));
    setFetching(false);
  }, [supabase, user, range.start, range.end]);

  useEffect(() => {
    if (!user) return;
    let ignore = false;
    supabase
      .from("budget_entries")
      .select("id, type, amount, category, memo, entry_date, created_at")
      .eq("user_id", user.id)
      .gte("entry_date", range.start)
      .lte("entry_date", range.end)
      .then(({ data, error }) => {
        if (ignore) return;
        if (error) setError("내역을 불러오지 못했어요.");
        else setEntries(normalize((data as BudgetEntry[]) ?? []));
        setFetching(false);
      });
    return () => {
      ignore = true;
    };
  }, [user, supabase, range.start, range.end]);

  const summary = useMemo(() => {
    let income = 0;
    let expense = 0;
    for (const e of entries) {
      if (e.type === "income") income += e.amount;
      else expense += e.amount;
    }
    return { income, expense, balance: income - expense };
  }, [entries]);

  const changeMonth = (delta: number) => {
    const d = new Date(year, month + delta, 1);
    setFetching(true);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = Number(amount);
    if (!user || saving || !amount || Number.isNaN(value) || value <= 0) return;
    setSaving(true);
    setError(null);
    const { data, error } = await supabase
      .from("budget_entries")
      .insert({
        user_id: user.id,
        type,
        amount: value,
        category: category || null,
        memo: memo.trim() || null,
        entry_date:
          date || `${year}-${pad(month + 1)}-${pad(new Date().getDate())}`,
      })
      .select("id, type, amount, category, memo, entry_date, created_at")
      .single();
    if (error || !data) {
      setError("추가하지 못했어요.");
    } else {
      const row = { ...(data as BudgetEntry), amount: Number(data.amount) };
      const inRange =
        row.entry_date >= range.start && row.entry_date <= range.end;
      if (inRange) setEntries((prev) => normalize([...prev, row]));
      setAmount("");
      setCategory("");
      setMemo("");
      setDate("");
    }
    setSaving(false);
  };

  const remove = async (item: BudgetEntry) => {
    setEntries((prev) => prev.filter((a) => a.id !== item.id));
    const { error } = await supabase
      .from("budget_entries")
      .delete()
      .eq("id", item.id);
    if (error) load();
  };

  const categories = type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  return (
    <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader title="/mark-budget.png" alt="Budget" />
      <hr className="mt-[10px] border-t border-[#9da19a]" />

      {loading || !user ? (
        <p className="mt-10 text-sm text-gray-500">불러오는 중...</p>
      ) : (
        <div className="mx-auto mt-8 max-w-2xl">
          {/* 월 전환 바 */}
          <div className="flex items-center justify-center gap-6">
            <button
              type="button"
              onClick={() => changeMonth(-1)}
              aria-label="이전 달"
              className="rounded-full px-3 py-1 text-lg text-gray-600 transition-colors hover:bg-gray-100"
            >
              ◀
            </button>
            <span className="text-base font-semibold">
              {year}년 {month + 1}월
            </span>
            <button
              type="button"
              onClick={() => changeMonth(1)}
              aria-label="다음 달"
              className="rounded-full px-3 py-1 text-lg text-gray-600 transition-colors hover:bg-gray-100"
            >
              ▶
            </button>
          </div>

          {/* 요약 카드 */}
          <div
            className={`${CARD} mt-6 grid grid-cols-3 divide-x divide-[#9da19a]/20 px-2 py-5`}
          >
            <div className="px-2 text-center">
              <p className="text-xs text-gray-500">수입</p>
              <p className="mt-1 font-mono text-sm font-bold tabular-nums text-[#4d7c2f] sm:text-base">
                <Won value={summary.income} />
              </p>
            </div>
            <div className="px-2 text-center">
              <p className="text-xs text-gray-500">지출</p>
              <p className="mt-1 font-mono text-sm font-bold tabular-nums text-[#c2603a] sm:text-base">
                <Won value={summary.expense} />
              </p>
            </div>
            <div className="px-2 text-center">
              <p className="text-xs text-gray-500">잔액</p>
              <p
                className={`mt-1 font-mono text-sm font-bold tabular-nums sm:text-base ${
                  summary.balance < 0 ? "text-red-500" : "text-[#1b2416]"
                }`}
              >
                <Won value={summary.balance} />
              </p>
            </div>
          </div>

          {/* 추가 입력 */}
          <form
            onSubmit={handleAdd}
            className={`${CARD} mt-6 flex flex-col gap-3 p-4`}
          >
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setType("expense");
                  setCategory("");
                }}
                className={`flex-1 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                  type === "expense"
                    ? "bg-[#f9e0d1] text-[#171717]"
                    : "border border-[#9da19a]/40 bg-white/80 text-gray-600"
                }`}
              >
                지출
              </button>
              <button
                type="button"
                onClick={() => {
                  setType("income");
                  setCategory("");
                }}
                className={`flex-1 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                  type === "income"
                    ? "bg-[#e2f9d1] text-[#24490b]"
                    : "border border-[#9da19a]/40 bg-white/80 text-gray-600"
                }`}
              >
                수입
              </button>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                type="number"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="금액"
                className={`${INPUT} flex-1`}
              />
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className={`${INPUT} sm:w-32`}
              >
                <option value="">분류</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={INPUT}
              />
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <input
                type="text"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="내용 (선택)"
                className={`${INPUT} flex-1`}
              />
              <button
                type="submit"
                disabled={!amount || Number(amount) <= 0 || saving}
                className="rounded-full border border-[#24490b] bg-[#e2f9d1] px-6 py-2.5 text-sm font-semibold text-[#24490b] transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#24490b]/40 disabled:cursor-not-allowed disabled:opacity-40"
              >
                추가
              </button>
            </div>
          </form>

          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

          {/* 내역 목록 */}
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
                  이번 달 내역이 없어요. 위에서 첫 내역을 추가해보세요.
                </p>
              </li>
            ) : (
              entries.map((item) => (
                <li
                  key={item.id}
                  className={`${CARD} flex items-center gap-4 px-5 py-4 transition-shadow hover:shadow-[0_6px_20px_rgba(36,73,11,0.10)]`}
                >
                  <span className="flex-none font-mono text-xs tabular-nums text-gray-400">
                    {item.entry_date.slice(5).replace("-", "/")}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-[#171717]">
                      {item.memo || (item.type === "income" ? "수입" : "지출")}
                    </p>
                    {item.category && (
                      <span className="mt-1 inline-block rounded-full bg-[#9da19a]/20 px-2.5 py-0.5 text-xs text-gray-600">
                        {item.category}
                      </span>
                    )}
                  </div>
                  <span
                    className={`flex-none font-mono text-sm font-semibold tabular-nums ${
                      item.type === "income"
                        ? "text-[#4d7c2f]"
                        : "text-[#c2603a]"
                    }`}
                  >
                    {item.type === "income" ? "+" : "-"}
                    <Won value={item.amount} />
                  </span>
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
              ))
            )}
          </ul>
        </div>
      )}
    </main>
  );
}
