import { useEffect, useState } from "react";

/** Seconds since mount (ticks every 250 ms) — for honest "working…" timers. */
export function useElapsed(): number {
  const [start] = useState(() => performance.now());
  const [now, setNow] = useState(start);
  useEffect(() => {
    const id = setInterval(() => setNow(performance.now()), 250);
    return () => clearInterval(id);
  }, []);
  return (now - start) / 1000;
}
