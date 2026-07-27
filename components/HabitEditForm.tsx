"use client";

// 습관 수정 폼. 이름과 반복 주기(주기 종류·주당 횟수·요일·월 지정일)를 함께 고친다.
//
// 생성 폼과 같은 FrequencyPicker를 쓰고, 저장도 같은 buildFrequencyFields를 거친다.
// 타입을 바꾸면 안 쓰는 컬럼이 null로 지워지므로 DB의 조합 제약에 걸리지 않는다.
// (예: 주 3회 → 월 1회로 바꾸면 scheduled_days가 지워지고 지정일이 채워진다.)

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import FrequencyPicker from "@/components/FrequencyPicker";
import { INPUT, PRIMARY_BTN } from "@/lib/ui";
import {
  DEFAULT_DAY_OF_MONTH,
  HABIT_SELECT,
  type Habit,
  buildFrequencyFields,
  frequencyValueOf,
} from "@/lib/habits";

export default function HabitEditForm({
  habit,
  onSaved,
  onCancel,
  onError,
}: {
  habit: Habit;
  onSaved: (habit: Habit) => void;
  onCancel: () => void;
  onError?: (message: string) => void;
}) {
  const supabase = useMemo(() => createClient(), []);

  const [title, setTitle] = useState(habit.title);
  const [frequency, setFrequency] = useState(frequencyValueOf(habit));
  const [scheduledDays, setScheduledDays] = useState<number[]>(
    habit.scheduled_days ?? []
  );
  const [dayOfMonth, setDayOfMonth] = useState(
    habit.scheduled_day_of_month ?? DEFAULT_DAY_OF_MONTH
  );
  const [saving, setSaving] = useState(false);

  const toggleDay = (value: number) =>
    setScheduledDays((prev) =>
      prev.includes(value) ? prev.filter((d) => d !== value) : [...prev, value]
    );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    const { data, error } = await supabase
      .from("daily_habits")
      .update({
        title: trimmed,
        ...buildFrequencyFields({ frequency, scheduledDays, dayOfMonth }),
      })
      .eq("id", habit.id)
      .select(HABIT_SELECT)
      .single();
    if (error || !data) {
      onError?.("수정하지 못했어요.");
      setSaving(false);
      return;
    }
    onSaved(data as Habit);
    setSaving(false);
  };

  return (
    <form onSubmit={submit} className="flex w-full flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          aria-label="습관 이름"
          placeholder="습관 이름"
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
        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={!title.trim() || saving}
            className={PRIMARY_BTN}
          >
            저장
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-[#9da19a]/50 px-4 py-2 font-mono text-[11px] text-gray-500 transition-colors hover:border-[#24490b]/40 hover:text-[#24490b]"
          >
            취소
          </button>
        </div>
      </div>
    </form>
  );
}
