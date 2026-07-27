"use client";

// 앱 전체에서 쓰는 완료 토글 버튼. 기존에 5곳에 복붙돼 있던 마크업을 그대로 옮겼다.
//
//   md/circle — 과제·목표·습관의 주 토글 (h-6 w-6)
//   sm/square — 목표 상세의 연결 과제 체크리스트 (18px)
//   sm/circle — 대시보드 습관 미니 토글 (18px)

type Variant = "md-circle" | "sm-square" | "sm-circle";

const SHAPE: Record<Variant, string> = {
  "md-circle": "h-6 w-6 rounded-full border-2",
  "sm-square": "rounded-md border",
  "sm-circle": "rounded-full border",
};

const TICK: Record<Variant, { size: number; stroke: number }> = {
  "md-circle": { size: 14, stroke: 3 },
  "sm-square": { size: 11, stroke: 3.5 },
  "sm-circle": { size: 10, stroke: 4 },
};

export default function CheckButton({
  checked,
  onToggle,
  label,
  variant = "md-circle",
  pressed,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
  variant?: Variant;
  /** 토글 상태를 aria-pressed로도 노출할지. 습관처럼 "오늘 눌렀다"에 가까운 것에 쓴다. */
  pressed?: boolean;
}) {
  const tick = TICK[variant];
  const small = variant !== "md-circle";
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={label}
      aria-pressed={pressed ? checked : undefined}
      style={small ? { height: 18, width: 18 } : undefined}
      className={`flex flex-none items-center justify-center transition-colors ${
        SHAPE[variant]
      } ${
        checked
          ? "border-[#24490b] bg-[#24490b] text-white"
          : "border-[#9da19a] hover:border-[#24490b]"
      }`}
    >
      {checked ? (
        <svg
          width={tick.size}
          height={tick.size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={tick.stroke}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M20 6 9 17l-5-5" />
        </svg>
      ) : null}
    </button>
  );
}
