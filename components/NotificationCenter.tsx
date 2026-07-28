"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";
import {
  DEFAULT_SETTINGS,
  NOTIF_SETTINGS_SELECT,
  type NotifSettings,
} from "@/lib/notifications";

type Notif = {
  id: string;
  kind: string;
  title: string;
  body: string;
  read: boolean;
  created_at: string;
};

const NOTIF_SELECT = "id, kind, title, body, read, created_at";

// 목록용 입력은 패널 폭에 맞춰 lib/ui의 INPUT보다 좁다.
const INPUT =
  "rounded-full border border-[#9da19a]/40 bg-white/80 px-3.5 py-2 text-sm outline-none focus:border-[#24490b]";

const parseDays = (s: string) =>
  Array.from(
    new Set(
      s
        .split(/[,\s]+/)
        .map((x) => parseInt(x, 10))
        .filter((n) => Number.isInteger(n) && n >= 0 && n <= 3650)
    )
  ).sort((a, b) => b - a);

function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}

export default function NotificationCenter() {
  const { user } = useAuth();
  const supabase = useMemo(() => createClient(), []);

  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"list" | "settings">("list");
  const [items, setItems] = useState<Notif[]>([]);
  const [settings, setSettings] = useState<NotifSettings>(DEFAULT_SETTINGS);
  const [assignStr, setAssignStr] = useState(
    DEFAULT_SETTINGS.assignment_days.join(", ")
  );
  const [goalStr, setGoalStr] = useState(
    DEFAULT_SETTINGS.goal_days.join(", ")
  );
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const unread = items.filter((i) => !i.read).length;

  const fetchNotifs = useCallback(async () => {
    if (!user) return null;
    const { data } = await supabase
      .from("notifications")
      .select(NOTIF_SELECT)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);
    return (data as Notif[]) ?? [];
  }, [supabase, user]);

  const loadNotifs = useCallback(async () => {
    const rows = await fetchNotifs();
    if (rows) setItems(rows);
  }, [fetchNotifs]);

  useEffect(() => {
    if (!user) return;
    let ignore = false;
    Promise.all([
      fetchNotifs(),
      supabase
        .from("notification_settings")
        .select(NOTIF_SETTINGS_SELECT)
        .eq("user_id", user.id)
        .maybeSingle(),
    ]).then(([rows, s]) => {
      if (ignore) return;
      setItems(rows ?? []);
      if (s.data) {
        const st = s.data as NotifSettings;
        setSettings(st);
        setAssignStr(st.assignment_days.join(", "));
        setGoalStr(st.goal_days.join(", "));
      }
    });
    return () => {
      ignore = true;
    };
  }, [user, supabase, fetchNotifs]);

  const openPanel = async () => {
    setOpen(true);
    if (!user) return;
    const unreadIds = items.filter((i) => !i.read).map((i) => i.id);
    if (unreadIds.length === 0) return;
    setItems((prev) => prev.map((i) => ({ ...i, read: true })));
    await supabase.from("notifications").update({ read: true }).in("id", unreadIds);
  };

  const runCheck = async () => {
    if (checking) return;
    setChecking(true);
    setNote(null);
    try {
      const res = await fetch("/api/notifications/check", { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        setNote(json?.error ? `오류: ${json.error}` : "확인에 실패했어요.");
      } else if (json.created > 0) {
        setNote(
          `새 알림 ${json.created}개 (${json.via === "gemini" ? "Gemini" : "기본"} 문구)`
        );
      } else {
        setNote("새 알림이 없어요.");
      }
      await loadNotifs();
    } catch {
      setNote("확인에 실패했어요.");
    }
    setChecking(false);
  };

  const remove = async (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    await supabase.from("notifications").delete().eq("id", id);
  };

  const saveSettings = async () => {
    if (!user || saving) return;
    setSaving(true);
    setNote(null);
    const next: NotifSettings = {
      assignment_days: parseDays(assignStr),
      goal_days: parseDays(goalStr),
      habit_reminder_enabled: settings.habit_reminder_enabled,
      habit_reminder_hour: settings.habit_reminder_hour,
      budget_monthend_enabled: settings.budget_monthend_enabled,
    };
    const { error } = await supabase
      .from("notification_settings")
      .upsert(
        { user_id: user.id, ...next, updated_at: new Date().toISOString() },
        { onConflict: "user_id" }
      );
    if (error) {
      setNote(`설정 저장 실패: ${error.message}`);
    } else {
      setSettings(next);
      setAssignStr(next.assignment_days.join(", "));
      setGoalStr(next.goal_days.join(", "));
      setNote("설정을 저장했어요.");
    }
    setSaving(false);
  };

  if (!user) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openPanel())}
        aria-label="알림"
        className="relative flex h-11 w-11 items-center justify-center rounded-full border border-[#9da19a]/40 bg-white/70 text-[#24490b] transition-colors hover:bg-[#e2f9d1]"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex min-w-5 items-center justify-center rounded-full bg-[#c2603a] px-1 font-mono text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="닫기"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default bg-black/10 sm:bg-transparent"
          />
          <div className="fixed inset-x-3 top-24 z-50 max-h-[70vh] overflow-hidden rounded-3xl border border-[#9da19a]/40 bg-white shadow-[0_12px_40px_rgba(36,73,11,0.18)] sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[380px]">
            {/* header */}
            <div className="flex items-center gap-2 border-b border-[#9da19a]/20 px-4 py-3">
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setTab("list")}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                    tab === "list"
                      ? "bg-[#e2f9d1] text-[#24490b]"
                      : "text-gray-500 hover:text-[#24490b]"
                  }`}
                >
                  알림
                </button>
                <button
                  type="button"
                  onClick={() => setTab("settings")}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                    tab === "settings"
                      ? "bg-[#e2f9d1] text-[#24490b]"
                      : "text-gray-500 hover:text-[#24490b]"
                  }`}
                >
                  설정
                </button>
              </div>
              <button
                type="button"
                onClick={runCheck}
                disabled={checking}
                className="ml-auto rounded-full border border-[#24490b] bg-[#e2f9d1] px-3 py-1 text-xs font-semibold text-[#24490b] transition-opacity hover:opacity-85 disabled:opacity-40"
              >
                {checking ? "확인 중..." : "알림 확인"}
              </button>
            </div>

            {note && (
              <p className="border-b border-[#9da19a]/20 bg-[#e2f9d1]/40 px-4 py-2 text-xs text-[#24490b]">
                {note}
              </p>
            )}

            <div className="max-h-[calc(70vh-52px)] overflow-y-auto p-3">
              {tab === "list" ? (
                items.length === 0 ? (
                  <p className="px-2 py-8 text-center text-sm text-gray-400">
                    아직 알림이 없어요. “알림 확인”을 눌러보세요.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {items.map((n) => (
                      <li
                        key={n.id}
                        className="flex items-start gap-2 rounded-2xl border border-[#9da19a]/25 bg-white/70 px-3.5 py-2.5"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-bold text-[#1b2416]">
                              {n.title}
                            </p>
                            <span className="flex-none font-mono text-[10px] text-gray-400">
                              {relTime(n.created_at)}
                            </span>
                          </div>
                          <p className="mt-0.5 text-xs text-gray-600">{n.body}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => remove(n.id)}
                          aria-label="삭제"
                          className="flex-none rounded-full px-1 text-gray-300 transition-colors hover:text-red-500"
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                )
              ) : (
                <div className="flex flex-col gap-4 px-1 py-1">
                  <label className="flex flex-col gap-1 text-xs text-gray-600">
                    과제 마감 며칠 전 알림 (쉼표로 구분)
                    <input
                      value={assignStr}
                      onChange={(e) => setAssignStr(e.target.value)}
                      placeholder="5, 3, 1, 0"
                      className={INPUT}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-gray-600">
                    목표 마감 며칠 전 알림 (쉼표로 구분)
                    <input
                      value={goalStr}
                      onChange={(e) => setGoalStr(e.target.value)}
                      placeholder="30, 10, 1"
                      className={INPUT}
                    />
                  </label>
                  <label className="flex items-center justify-between text-sm text-gray-700">
                    오늘 할 일 알림
                    <input
                      type="checkbox"
                      checked={settings.habit_reminder_enabled}
                      onChange={(e) =>
                        setSettings((s) => ({
                          ...s,
                          habit_reminder_enabled: e.target.checked,
                        }))
                      }
                      className="h-4 w-4 accent-[#24490b]"
                    />
                  </label>
                  <label className="flex items-center justify-between text-sm text-gray-700">
                    알림 시각
                    <select
                      value={settings.habit_reminder_hour}
                      onChange={(e) =>
                        setSettings((s) => ({
                          ...s,
                          habit_reminder_hour: Number(e.target.value),
                        }))
                      }
                      className={INPUT}
                    >
                      {Array.from({ length: 24 }, (_, h) => (
                        <option key={h} value={h}>
                          {String(h).padStart(2, "0")}:00
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center justify-between text-sm text-gray-700">
                    월말 예산 요약
                    <input
                      type="checkbox"
                      checked={settings.budget_monthend_enabled}
                      onChange={(e) =>
                        setSettings((s) => ({
                          ...s,
                          budget_monthend_enabled: e.target.checked,
                        }))
                      }
                      className="h-4 w-4 accent-[#24490b]"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={saveSettings}
                    disabled={saving}
                    className="mt-1 rounded-full border border-[#24490b] bg-[#e2f9d1] px-5 py-2 text-sm font-semibold text-[#24490b] transition-opacity hover:opacity-85 disabled:opacity-40"
                  >
                    {saving ? "저장 중..." : "설정 저장"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
