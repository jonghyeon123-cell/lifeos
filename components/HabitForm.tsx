"use client";

// 습관 생성 폼. 습관 목록(/Goal)과 목표 상세(/Goal/[seq])가 함께 쓴다.
//
// 두 화면의 차이는 "어느 목표에 붙일지"를 누가 정하느냐뿐이다.
//   목록   — 사용자가 드롭다운에서 고른다 (목표 없이 만들 수도 있다)
//   목표 상세 — 보고 있는 목표에 자동으로 붙는다 (goalId를 넘기면 드롭다운을 감춘다)
//
// 주기 입력은 수정 폼과 같은 FrequencyPicker를 쓴다.

import { useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";
import FrequencyPicker from "@/components/FrequencyPicker";
import { CARD, INPUT, PRIMARY_BTN } from "@/lib/ui";
import {
  DEFAULT_DAY_OF_MONTH,
  DEFAULT_FREQUENCY,
  HABIT_SELECT,
  type Habit,
  buildFrequencyFields,
} from "@/lib/habits";
import type { GoalOption } from "@/lib/goals";

export default function HabitForm({
  goalId,
  goalOptions,
  onCreated,
  onError,
}: {
  /** 넘기면 이 목표에 연결된 채로 만들어지고, 목표 선택 드롭다운은 나오지 않는다. */
  goalId?: string;
  /** goalId가 없을 때 쓰는 목표 선택 드롭다운의 선택지. */
  goalOptions?: readonly GoalOption[];
  /** 생성된 습관. 호출한 화면이 자기 목록에 반영한다. */
  onCreated: (habit: Habit) => void;
  onError?: (message: string) => void;
}) {
  const { user } = useAuth();
  const supabase = useMemo(() => createClient(), []);

  const [title, setTitle] = useState("");
  const [frequency, setFrequency] = useState<string>(DEFAULT_FREQUENCY);
  const [pickedGoal, setPickedGoal] = useState("");
  const [scheduledDays, setScheduledDays] = useState<number[]>([]);
  const [dayOfMonth, setDayOfMonth] = useState(DEFAULT_DAY_OF_MONTH);
  const [saving, setSaving] = useState(false);

  const showGoalPicker = !goalId && goalOptions !== undefined;

  const toggleDay = (value: number) =>
    setScheduledDays((prev) =>
      prev.includes(value) ? prev.filter((d) => d !== value) : [...prev, value]
    );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed || !user || saving) return;
    setSaving(true);
    const { data, error } = await supabase
      .from("daily_habits")
      .insert({
        user_id: user.id,
        title: trimmed,
        goal_id: goalId ?? (pickedGoal || null),
        ...buildFrequencyFields({ frequency, scheduledDays, dayOfMonth }),
      })
      .select(HABIT_SELECT)
      .single();
    if (error || !data) {
      onError?.("추가하지 못했어요.");
    } else {
      onCreated(data as Habit);
      setTitle("");
      setFrequency(DEFAULT_FREQUENCY);
      setPickedGoal("");
      setScheduledDays([]);
      setDayOfMonth(DEFAULT_DAY_OF_MONTH);
    }
    setSaving(false);
  };

  return (
    <form
      onSubmit={submit}
      className={`${CARD} flex w-full flex-col gap-3 px-5 py-4`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="반복할 습관 (예: 30분 운동)"
          className={`${INPUT} flex-1 sm:min-w-[10rem]`}
        />
        <FrequencyPicker
          frequency={frequency}
          onFrequencyChange={setFrequency}
          scheduledDays={scheduledDays}
          onToggleDay={toggleDay}
          dayOfMonth={dayOfMonth}
          onDayOfMonthChange={setDayOfMonth}
        />
        {showGoalPicker ? (
          <select
            value={pickedGoal}
            onChange={(e) => setPickedGoal(e.target.value)}
            aria-label="연결할 목표 (선택)"
            className={`${INPUT} sm:w-36`}
          >
            <option value="">목표 없음</option>
            {goalOptions.map((g) => (
              <option key={g.id} value={g.id}>
                {g.completed ? `${g.title} (완료)` : g.title}
              </option>
            ))}
          </select>
        ) : null}
        <button
          type="submit"
          disabled={!title.trim() || saving}
          className={PRIMARY_BTN}
        >
          추가
        </button>
      </div>
    </form>
  );
}
