"use client";

// 값이 바뀌면 이전 숫자에서 새 숫자까지 세어 올린다. 정수 전용.
// 0에서 시작하므로 첫 렌더에서도 올라가는 게 보인다.

import { useEffect, useRef, useState } from "react";

const DURATION = 600;

export default function CountUp({
  value,
  suffix = "",
}: {
  value: number;
  suffix?: string;
}) {
  const [shown, setShown] = useState(0);
  // 애니메이션 도중 값이 또 바뀌면 지금 보이는 숫자에서 이어서 센다.
  const from = useRef(0);

  useEffect(() => {
    const skip =
      from.current === value ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (skip) {
      from.current = value;
      setShown(value);
      return;
    }

    const start = from.current;
    const startAt = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - startAt) / DURATION);
      // ease-out: 빠르게 올라갔다 끝에서 붙는다.
      const v = Math.round(start + (value - start) * (1 - (1 - t) ** 3));
      from.current = v;
      setShown(v);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return (
    <>
      {shown}
      {suffix}
    </>
  );
}
