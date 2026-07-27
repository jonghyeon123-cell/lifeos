export default function ProgressBar({
  pct,
  className = "h-2",
  label,
}: {
  pct: number;
  /** 트랙 높이 등. 기본 h-2. */
  className?: string;
  label?: string;
}) {
  return (
    <div
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={`w-full overflow-hidden rounded-full bg-[#9da19a]/25 ${className}`}
    >
      <div
        className="h-full rounded-full bg-[#24490b] transition-[width] duration-300"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
