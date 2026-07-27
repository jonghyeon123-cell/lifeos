"use client";

// 습관 카드. /Goal의 "매일 할 일" 목록과 목표 상세의 "연결된 습관" 섹션이
// 같은 컴포넌트를 쓴다. 목표 안에 별도의 반복 UI를 만들지 않기 위한 것.
//
// daily와 weekly의 차이는 스트릭 단위뿐이다. daily는 연속 "일", weekly는
// 목표 횟수를 채운 연속 "주"를 센다. 7일 그리드는 양쪽 다 유지한다.

import { useState } from "react";
import CheckButton from "@/components/CheckButton";
import HabitEditForm from "@/components/HabitEditForm";
import PencilIcon from "@/components/PencilIcon";
import { CARD } from "@/lib/ui";
import { type GoalOption, formatPct } from "@/lib/goals";
import { dueLabel } from "@/lib/date";
import {
  type Habit,
  currentWeekDays,
  habitStats,
  monthCells,
  weekSlots,
  weekdayLabel,
} from "@/lib/habits";

function FlameIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 2c1 3-1 4-2.5 5.5C8 9 7 10.5 7 13a5 5 0 0 0 10 0c0-2-1-3.5-2-5-1.5 1-2 .5-2-1 0-2-1-4-1-5Z" />
    </svg>
  );
}

export function frequencyLabel(
  h: Pick<
    Habit,
    "frequency_type" | "frequency_count" | "scheduled_day_of_month"
  >
) {
  if (h.frequency_type === "weekly") return `주 ${h.frequency_count}회`;
  if (h.frequency_type === "monthly") {
    return `매달 ${h.scheduled_day_of_month ?? 1}일`;
  }
  return "매일";
}

export default function HabitCard({
  habit,
  dates,
  today,
  yesterday,
  goals,
  onToggle,
  onChangeGoal,
  onUnlink,
  onRemove,
  onUpdated,
  onError,
}: {
  habit: Habit;
  dates: ReadonlySet<string>;
  today: string;
  yesterday: string;
  /** 넘기면 목표 연결 셀렉트를 렌더한다. 목표 상세처럼 목표가 자명한 곳에서는 생략. */
  goals?: GoalOption[];
  onToggle: (habit: Habit) => void;
  onChangeGoal?: (habit: Habit, nextGoalId: string) => void;
  /** 넘기면 "연결 해제" 버튼을 렌더한다. */
  onUnlink?: (habit: Habit) => void;
  onRemove?: (habit: Habit) => void;
  /** 넘기면 이름·주기 수정 버튼을 렌더한다. */
  onUpdated?: (habit: Habit) => void;
  onError?: (message: string) => void;
}) {
  const [editing, setEditing] = useState(false);

  const stats = habitStats(habit, dates, today, yesterday);
  const weekly = habit.frequency_type === "weekly";
  const monthly = habit.frequency_type === "monthly";

  // 히트맵은 주기마다 다른 걸 센다. 쓰지 않는 쪽은 계산하지 않는다.
  const week = weekly || monthly ? [] : currentWeekDays(dates, today);
  const slots = weekly ? weekSlots(habit, dates, today) : [];
  // 월간은 이번 달 한 칸만 본다. 지난 달들은 카드에서 굳이 늘어놓지 않는다.
  const thisMonth = monthly ? monthCells(habit, dates, today, 1)[0] : null;
  const nextDue = monthly ? dueLabel(stats.nextDue) : null;

  const unit = monthly ? "개월" : weekly ? "주" : "일";
  const quotaMet = weekly && stats.thisWeek >= stats.target;

  if (editing && onUpdated) {
    return (
      <li className={`${CARD} flex flex-col gap-2.5 px-5 py-3.5`}>
        <HabitEditForm
          habit={habit}
          onSaved={(next) => {
            onUpdated(next);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
          onError={onError}
        />
      </li>
    );
  }

  return (
    <li
      className={`${CARD} flex flex-col gap-2.5 px-5 py-3.5 transition-shadow hover:shadow-[0_6px_20px_rgba(36,73,11,0.10)]`}
    >
      <div className="flex items-center gap-3">
        <CheckButton
          checked={stats.doneToday}
          onToggle={() => onToggle(habit)}
          label={stats.doneToday ? "오늘 완료 취소" : "오늘 완료"}
          pressed
        />
        <span
          className={`min-w-0 flex-1 truncate text-sm font-medium ${
            stats.doneToday ? "text-gray-500" : "text-[#1b2416]"
          }`}
        >
          {habit.title}
        </span>

        <span className="flex-none rounded-full border border-[#9da19a]/40 px-2 py-0.5 font-mono text-[11px] text-gray-500">
          {frequencyLabel(habit)}
        </span>

        {stats.streak > 0 ? (
          <span className="flex flex-none items-center gap-1 rounded-full bg-[#e2f9d1] px-2.5 py-1 font-mono text-xs font-bold tabular-nums text-[#4d7c2f]">
            <FlameIcon />
            {stats.streak}
            {unit}
          </span>
        ) : (
          <span className="flex-none font-mono text-xs text-gray-400">
            시작 전
          </span>
        )}

        {onUpdated ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label={`${habit.title} 수정`}
            title="이름·주기 수정"
            className="flex-none rounded-full p-1 text-gray-400 transition-colors hover:text-[#24490b]"
          >
            <PencilIcon />
          </button>
        ) : null}

        {onRemove ? (
          <button
            type="button"
            onClick={() => onRemove(habit)}
            aria-label="습관 삭제"
            className="flex-none rounded-full px-1.5 text-gray-300 transition-colors hover:text-red-500"
          >
            ×
          </button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pl-9">
        {monthly && thisMonth ? (
          <div className="flex gap-1.5" aria-label="이번 달 기록">
            <span
              // 색과 같은 순서로 판단한다. 완료가 먼저다 — 생성 전 예정분이라도
              // 사용자가 체크했으면 완료로 보여야 색과 설명이 어긋나지 않는다.
              title={`${thisMonth.month}${
                thisMonth.done
                  ? " 완료"
                  : thisMonth.beforeStart
                    ? " (시작 전)"
                    : thisMonth.pending
                      ? " (예정일 전)"
                      : " 놓침"
              }`}
              className={`flex h-5 items-center justify-center rounded-[5px] px-1.5 font-mono text-[9px] tabular-nums ${
                thisMonth.done
                  ? "bg-[#24490b] text-white"
                  : thisMonth.beforeStart
                    ? "bg-[#9da19a]/10 text-gray-300"
                    : thisMonth.pending
                      ? "bg-[#9da19a]/20 text-gray-400 ring-1 ring-[#24490b]/30"
                      : "bg-[#c2603a]/20 text-[#c2603a]"
              }`}
            >
              {thisMonth.month.slice(2).replace("-", "/")}
            </span>
          </div>
        ) : weekly ? (
          <div
            className="flex gap-1.5"
            aria-label={`이번 주 진행 ${stats.thisWeek}/${stats.target}`}
          >
            {slots.map((s, i) => (
              <span
                key={i}
                title={
                  s.date
                    ? `${s.label}요일 · ${s.date}`
                    : s.scheduled
                      ? `${s.label}요일 (예정)`
                      : "아직 안 채운 칸"
                }
                className={`flex h-5 w-5 items-center justify-center rounded-[5px] font-mono text-[9px] ${
                  s.done
                    ? "bg-[#24490b] text-white"
                    : "bg-[#9da19a]/25 text-gray-500"
                }`}
              >
                {s.label}
              </span>
            ))}
          </div>
        ) : (
          <div className="flex gap-1.5" aria-label="이번 주 기록">
            {week.map((d) => (
              <span
                key={d.date}
                title={`${d.date}${d.date > today ? " (예정)" : ""}`}
                className={`flex h-5 w-5 items-center justify-center rounded-[5px] font-mono text-[9px] ${
                  d.done
                    ? "bg-[#24490b] text-white"
                    : d.date > today
                      ? "bg-[#9da19a]/10 text-gray-300"
                      : "bg-[#9da19a]/25 text-gray-500"
                } ${d.isToday ? "ring-1 ring-[#24490b]/40" : ""}`}
              >
                {weekdayLabel(d.date)}
              </span>
            ))}
          </div>
        )}

        {weekly ? (
          <span
            className={`font-mono text-[11px] tabular-nums ${
              quotaMet ? "font-bold text-[#4d7c2f]" : "text-gray-500"
            }`}
            title="이번 주 달성 횟수 (월요일 시작)"
          >
            이번 주 {stats.thisWeek}/{stats.target}
          </span>
        ) : null}

        {monthly ? (
          <>
            <span
              className={`font-mono text-[11px] ${
                stats.monthlyDone ? "font-bold text-[#4d7c2f]" : "text-gray-500"
              }`}
            >
              이번 달 {stats.monthlyDone ? "완료" : "미완료"}
            </span>
            {nextDue ? (
              <span
                className={`font-mono text-[11px] tabular-nums ${
                  nextDue.soon ? "font-bold text-[#c2603a]" : "text-gray-500"
                }`}
                title={`다음 예정일 ${stats.nextDue}`}
              >
                다음 {nextDue.text}
              </span>
            ) : null}
          </>
        ) : null}

        {/* 목표 진행률은 마감일까지의 전체 여정이라 초반엔 낮게 나온다.
            "지금까지는 잘 지키고 있다"를 여기서 따로 보여준다.
            monthly는 첫 예정일이 오기 전엔 잴 게 없어 아예 감춘다 (0%로 보이면
            해내지 못한 것처럼 읽힌다). */}
        {monthly && stats.monthlyDueCount === 0 ? null : (
          <span
            className="font-mono text-[11px] tabular-nums text-gray-500"
            title="습관을 만든 뒤 오늘까지의 준수율"
          >
            준수 {formatPct(stats.adherence * 100)}%
          </span>
        )}

        {stats.bestStreak > 0 ? (
          <span className="font-mono text-[11px] tabular-nums text-gray-400">
            최고 {stats.bestStreak}
            {unit}
          </span>
        ) : null}

        {goals && onChangeGoal ? (
          <select
            value={habit.goal_id ?? ""}
            onChange={(e) => onChangeGoal(habit, e.target.value)}
            aria-label={`${habit.title}의 연결 목표`}
            title="연결할 목표"
            className={`ml-auto max-w-[10rem] truncate rounded-full border px-2.5 py-0.5 text-[11px] outline-none transition-colors focus:border-[#24490b] ${
              habit.goal_id
                ? "border-[#24490b]/30 bg-[#e2f9d1] text-[#24490b]"
                : "border-[#9da19a]/40 bg-white/60 text-gray-400"
            }`}
          >
            <option value="">목표 없음</option>
            {goals.map((g) => (
              <option key={g.id} value={g.id}>
                {g.completed ? `${g.title} (완료)` : g.title}
              </option>
            ))}
          </select>
        ) : null}

        {onUnlink ? (
          <button
            type="button"
            onClick={() => onUnlink(habit)}
            title="목표에서 연결 해제 (습관은 유지)"
            className="ml-auto flex-none rounded-full border border-[#9da19a]/50 px-2.5 py-1 font-mono text-[11px] text-gray-500 transition-colors hover:border-[#24490b]/40 hover:text-[#24490b]"
          >
            연결 해제
          </button>
        ) : null}
      </div>
    </li>
  );
}
