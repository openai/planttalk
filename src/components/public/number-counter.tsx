import { useEffect, useRef, useState } from "react";

interface NumberCounterProps {
  value: number;
  decimalPlaces?: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
  className?: string;
}

export function NumberCounter({
  value,
  decimalPlaces = 0,
  prefix = "",
  suffix = "",
  duration = 0.8,
  className,
}: NumberCounterProps) {
  const [display, setDisplay] = useState(value);
  const displayRef = useRef(value);
  displayRef.current = display;

  useEffect(() => {
    const from = displayRef.current;
    const delta = value - from;
    if (delta === 0) return;

    const totalMs = Math.max(1, duration * 1000);
    let rafId = 0;
    let startTs: number | null = null;

    const tick = (ts: number) => {
      if (startTs === null) startTs = ts;
      const progress = Math.min(1, (ts - startTs) / totalMs);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(from + delta * eased);
      if (progress < 1) rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [value, duration]);

  return (
    <span className={className}>
      {prefix}
      {display.toFixed(decimalPlaces)}
      {suffix}
    </span>
  );
}
