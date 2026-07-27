import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  DEFAULT_SETTINGS,
  buildCandidates,
  generateMessages,
  kstParts,
  type NotifSettings,
} from "@/lib/notifications";
import { weekStart } from "@/lib/date";
import {
  EMPTY_DATES,
  HABIT_SELECT,
  type Habit,
  datesByHabit,
  isDueToday,
} from "@/lib/habits";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { date: today, hour } = kstParts();
  const monthStart = `${today.slice(0, 7)}-01`;
  const [y, m] = today.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const monthEnd = `${today.slice(0, 7)}-${String(lastDay).padStart(2, "0")}`;
  const logsFrom = weekStart(today) < monthStart ? weekStart(today) : monthStart;

  // load settings (default if none)
  const { data: settingsRow } = await supabase
    .from("notification_settings")
    .select(
      "assignment_days, goal_days, habit_reminder_enabled, habit_reminder_hour, budget_monthend_enabled"
    )
    .eq("user_id", user.id)
    .maybeSingle();
  const settings: NotifSettings = settingsRow
    ? (settingsRow as NotifSettings)
    : DEFAULT_SETTINGS;

  // gather sources in parallel
  const [aRes, gRes, bRes, hRes, lRes] = await Promise.all([
    supabase
      .from("assignments")
      .select("id, title, course, due_date, completed")
      .eq("user_id", user.id)
      .eq("completed", false),
    supabase
      .from("goals")
      .select("id, title, due_date, completed")
      .eq("user_id", user.id)
      .eq("completed", false),
    supabase
      .from("budget_entries")
      .select("type, amount")
      .eq("user_id", user.id)
      .gte("entry_date", monthStart)
      .lte("entry_date", monthEnd),
    supabase
      .from("daily_habits")
      .select(HABIT_SELECT)
      .eq("user_id", user.id),
    // weekly는 "이번 주에 몇 번 했나", monthly는 "이번 달에 했나"를 봐야 한다.
    // 그래서 이번 주 시작과 이번 달 시작 중 이른 쪽부터 오늘까지를 가져온다
    // (8월 1일처럼 주 시작이 지난달인 경우가 있다).
    supabase
      .from("daily_habit_logs")
      .select("habit_id, done_on")
      .eq("user_id", user.id)
      .gte("done_on", logsFrom)
      .lte("done_on", today),
  ]);

  let income = 0;
  let expense = 0;
  for (const e of (bRes.data as { type: string; amount: number }[]) ?? []) {
    const amt = Number(e.amount);
    if (e.type === "income") income += amt;
    else expense += amt;
  }

  // 오늘 노출 규칙은 홈 "오늘 할 일"과 같은 함수(isDueToday)를 쓴다. 알림에서만
  // 다른 기준으로 재촉하면 화면과 알림이 어긋난다.
  const logsByHabit = datesByHabit(
    (lRes.data as { habit_id: string; done_on: string }[] | null) ?? []
  );

  const habits = ((hRes.data as Habit[] | null) ?? [])
    .map((h) => ({ habit: h, dates: logsByHabit.get(h.id) ?? EMPTY_DATES }))
    .filter(({ habit, dates }) => isDueToday(habit, dates, today))
    .map(({ habit, dates }) => ({
      title: habit.title,
      satisfied: dates.has(today),
    }));

  const goals = ((gRes.data as { id: string; title: string; due_date: string | null }[]) ?? []).map(
    (g) => ({ id: g.id, title: g.title, due_date: g.due_date })
  );

  const candidates = buildCandidates({
    today,
    hour,
    settings,
    assignments:
      (aRes.data as {
        id: string;
        title: string;
        course: string | null;
        due_date: string | null;
      }[]) ?? [],
    goals,
    budget: { income, expense },
    habits,
  });

  if (candidates.length === 0) {
    return NextResponse.json({ created: 0, via: "template" });
  }

  // filter out already-existing dedup_keys
  const keys = candidates.map((c) => c.dedup_key);
  const { data: existing } = await supabase
    .from("notifications")
    .select("dedup_key")
    .eq("user_id", user.id)
    .in("dedup_key", keys);
  const existingKeys = new Set(
    ((existing as { dedup_key: string }[]) ?? []).map((r) => r.dedup_key)
  );
  const fresh = candidates.filter((c) => !existingKeys.has(c.dedup_key));

  if (fresh.length === 0) {
    return NextResponse.json({ created: 0, via: "template" });
  }

  const { map, via } = await generateMessages(fresh, process.env.GEMINI_API_KEY);

  const rows = fresh.map((c) => {
    const msg = map.get(c.dedup_key) ?? { title: c.title, body: c.body };
    return {
      user_id: user.id,
      kind: c.kind,
      dedup_key: c.dedup_key,
      title: msg.title,
      body: msg.body,
    };
  });

  const { error } = await supabase
    .from("notifications")
    .upsert(rows, { onConflict: "user_id,dedup_key", ignoreDuplicates: true });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ created: rows.length, via });
}
