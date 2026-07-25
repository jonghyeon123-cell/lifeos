import { GoogleGenAI } from "@google/genai";

// ---- types ----
export type NotifSettings = {
  assignment_days: number[];
  goal_days: number[];
  habit_reminder_enabled: boolean;
  habit_reminder_hour: number;
  budget_monthend_enabled: boolean;
};

export const DEFAULT_SETTINGS: NotifSettings = {
  assignment_days: [5, 3, 1, 0],
  goal_days: [30, 10, 1],
  habit_reminder_enabled: true,
  habit_reminder_hour: 22,
  budget_monthend_enabled: true,
};

export type Candidate = {
  kind: "assignment" | "goal" | "budget" | "habit";
  dedup_key: string;
  title: string; // template title (always present)
  body: string; // template body (always present)
  fact: string; // plain facts for the LLM
};

type BuildInput = {
  today: string; // YYYY-MM-DD (KST)
  hour: number; // 0-23 (KST)
  settings: NotifSettings;
  assignments: {
    id: string;
    title: string;
    course: string | null;
    due_date: string | null;
  }[];
  goals: { id: string; title: string; due_date: string | null }[];
  budget: { income: number; expense: number };
  habits: { title: string; doneToday: boolean }[];
};

// ---- date helpers (KST) ----
export function kstParts(d: Date = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  });
  const parts = fmt.formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  let hour = Number(get("hour"));
  if (hour === 24) hour = 0;
  return { date: `${get("year")}-${get("month")}-${get("day")}`, hour };
}

function daysUntil(due: string, today: string) {
  const [y1, m1, d1] = today.split("-").map(Number);
  const [y2, m2, d2] = due.split("-").map(Number);
  return Math.round(
    (Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000
  );
}

function isMonthEnd(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d === last;
}

const won = (n: number) => `₩${new Intl.NumberFormat("ko-KR").format(n)}`;
const dLabel = (d: number) => (d === 0 ? "오늘" : `${d}일 후`);

// ---- candidate builder (pure) ----
export function buildCandidates(input: BuildInput): Candidate[] {
  const { today, hour, settings } = input;
  const out: Candidate[] = [];

  // 1) assignments
  for (const a of input.assignments) {
    if (!a.due_date) continue;
    const d = daysUntil(a.due_date, today);
    if (!settings.assignment_days.includes(d)) continue;
    const dd = d === 0 ? "D-day" : `D-${d}`;
    const course = a.course ? `${a.course} ` : "";
    out.push({
      kind: "assignment",
      dedup_key: `assign:${a.id}:D${d}`,
      title: `과제 마감 ${dd}`,
      body: `${course}${a.title}, ${dLabel(d)} 마감이에요! 🌱`,
      fact: `과제 "${a.title}"${a.course ? ` (${a.course})` : ""}의 마감이 ${dLabel(d)}입니다.`,
    });
  }

  // 2) goals
  for (const g of input.goals) {
    if (!g.due_date) continue;
    const d = daysUntil(g.due_date, today);
    if (!settings.goal_days.includes(d)) continue;
    const dd = d === 0 ? "D-day" : `D-${d}`;
    out.push({
      kind: "goal",
      dedup_key: `goal:${g.id}:D${d}`,
      title: `목표 마감 ${dd}`,
      body: `목표 "${g.title}" 마감이 ${dLabel(d)}예요. 🌱`,
      fact: `목표 "${g.title}"의 마감이 ${dLabel(d)}입니다.`,
    });
  }

  // 3) month-end budget
  if (settings.budget_monthend_enabled && isMonthEnd(today)) {
    const { income, expense } = input.budget;
    const balance = income - expense;
    const month = Number(today.split("-")[1]);
    out.push({
      kind: "budget",
      dedup_key: `budget:${today.slice(0, 7)}`,
      title: `${month}월 결산`,
      body: `이번 달 수입 ${won(income)}, 지출 ${won(expense)}, 잔액 ${won(balance)}이에요. 🌱`,
      fact: `${month}월 결산: 수입 ${won(income)}, 지출 ${won(expense)}, 잔액 ${won(balance)}.`,
    });
  }

  // 4) today's habits (only after the reminder hour)
  if (settings.habit_reminder_enabled && hour >= settings.habit_reminder_hour) {
    const undone = input.habits.filter((h) => !h.doneToday);
    if (undone.length > 0) {
      const names = undone.map((h) => h.title).join(", ");
      out.push({
        kind: "habit",
        dedup_key: `habit:${today}`,
        title: "오늘 할 일 알림",
        body: `아직 ${undone.length}개 습관이 남았어요: ${names}. 오늘 안에 끝내볼까요? 🌱`,
        fact: `오늘 아직 완료하지 않은 습관 ${undone.length}개: ${names}.`,
      });
    }
  }

  return out;
}

// ---- message generation (Gemini with template fallback) ----
type Msg = { title: string; body: string };

async function geminiMessages(
  cands: Candidate[],
  apiKey: string
): Promise<{ dedup_key: string; title: string; body: string }[]> {
  const ai = new GoogleGenAI({ apiKey });
  const system =
    "너는 LifeOS의 '새싹' 마스코트야. 사용자에게 다정하고 짧게 말해. " +
    "각 항목마다 제목(20자 이내)과 본문(1~2문장, 이모지 1개 정도)을 만들어. " +
    "주어진 사실만 사용하고 새로운 정보를 지어내지 마. 한국어로.";
  const items = cands.map((c) => ({ dedup_key: c.dedup_key, fact: c.fact }));
  const prompt =
    "다음 각 항목의 알림 문구를 만들어줘. 오직 JSON 배열로만 응답해: " +
    '[{"dedup_key":"...","title":"...","body":"..."}]\n\n' +
    JSON.stringify(items, null, 2);

  const res = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: {
      systemInstruction: system,
      responseMimeType: "application/json",
      temperature: 0.7,
    },
  });

  const text = res.text ?? "[]";
  const parsed = JSON.parse(text);
  return Array.isArray(parsed) ? parsed : [];
}

export async function generateMessages(
  cands: Candidate[],
  apiKey: string | undefined
): Promise<{ map: Map<string, Msg>; via: "gemini" | "template" }> {
  const templateMap = new Map<string, Msg>(
    cands.map((c) => [c.dedup_key, { title: c.title, body: c.body }])
  );
  if (!apiKey || cands.length === 0) {
    return { map: templateMap, via: "template" };
  }
  try {
    const arr = await geminiMessages(cands, apiKey);
    const map = new Map(templateMap);
    for (const g of arr) {
      if (g?.dedup_key && g.title && g.body && map.has(g.dedup_key)) {
        map.set(g.dedup_key, { title: String(g.title), body: String(g.body) });
      }
    }
    return { map, via: "gemini" };
  } catch {
    return { map: templateMap, via: "template" };
  }
}
