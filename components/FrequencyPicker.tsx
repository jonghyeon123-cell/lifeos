"use client";

// 주기 입력 UI. 습관 생성 폼과 수정 폼이 함께 쓴다.
//
// 상태를 갖지 않는 순수 controlled 컴포넌트다. 저장 로직(어느 테이블에 어떻게 쓰는지)은
// 쓰는 쪽이 정하고, 여기서는 "무엇을 고를 수 있는가"만 책임진다.

import { INPUT } from "@/lib/ui";
import {
  DEFAULT_DAY_OF_MONTH,
  FREQUENCY_OPTIONS,
  WEEKDAYS,
  clampDayOfMonth,
  parseFrequency,
} from "@/lib/habits";

export default function FrequencyPicker({
  frequency,
  onFrequencyChange,
  scheduledDays,
  onToggleDay,
  dayOfMonth,
  onDayOfMonthChange,
  selectClassName = "sm:w-28",
}: {
  frequency: string;
  onFrequencyChange: (value: string) => void;
  scheduledDays: readonly number[];
  onToggleDay: (weekday: number) => void;
  dayOfMonth: number;
  onDayOfMonthChange: (day: number) => void;
  selectClassName?: string;
}) {
  const { frequency_type, frequency_count } = parseFrequency(frequency);
  const isWeekly = frequency_type === "weekly";
  const isMonthly = frequency_type === "monthly";

  // 요일을 골랐는데 개수가 주 N회와 어긋난 경우. 막지 않고 알려만 준다.
  const dayCountMismatch =
    isWeekly &&
    scheduledDays.length > 0 &&
    scheduledDays.length !== frequency_count;

  return (
    <>
      <select
        value={frequency}
        onChange={(e) => onFrequencyChange(e.target.value)}
        aria-label="반복 주기"
        className={`${INPUT} ${selectClassName}`}
      >
        {FREQUENCY_OPTIONS.map((f) => (
          <option key={f.value} value={f.value}>
            {f.label}
          </option>
        ))}
      </select>

      {isWeekly ? (
        <div className="flex w-full flex-col gap-1.5">
          <div
            role="group"
            aria-label="반복 요일 (선택)"
            className="flex flex-wrap items-center gap-1.5"
          >
            <span className="mr-1 font-mono text-[11px] text-gray-500">
              요일 (선택)
            </span>
            {WEEKDAYS.map((d) => {
              const on = scheduledDays.includes(d.value);
              return (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => onToggleDay(d.value)}
                  aria-pressed={on}
                  className={`h-7 w-7 rounded-full border text-xs transition-colors ${
                    on
                      ? "border-[#24490b] bg-[#24490b] font-semibold text-white"
                      : "border-[#9da19a]/40 bg-white/60 text-gray-500 hover:border-[#24490b]/40"
                  }`}
                >
                  {d.label}
                </button>
              );
            })}
          </div>
          {dayCountMismatch ? (
            <p className="font-mono text-[11px] text-[#c2603a]">
              주 {frequency_count}회인데 요일은 {scheduledDays.length}개
              골랐어요. 이대로도 저장돼요.
            </p>
          ) : null}
        </div>
      ) : null}

      {isMonthly ? (
        <label className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-gray-500">
          매달
          <input
            type="number"
            min={1}
            max={31}
            value={dayOfMonth}
            onChange={(e) => {
              const n = e.target.valueAsNumber;
              onDayOfMonthChange(
                Number.isNaN(n) ? DEFAULT_DAY_OF_MONTH : clampDayOfMonth(n)
              );
            }}
            className={`${INPUT} w-20 text-center text-sm`}
          />
          일에 한 번
          <span className="text-gray-400">
            · 그 달에 없는 날짜면 말일에 옵니다
          </span>
        </label>
      ) : null}
    </>
  );
}
