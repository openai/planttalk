import { useEffect, useRef, useState } from "react";

interface StreamingTextProps {
  text: string;
  speed?: number;
}

export function StreamingText({ text, speed = 28 }: StreamingTextProps) {
  const [shown, setShown] = useState(0);
  const shownRef = useRef(0);
  // Bumped whenever a new utterance starts; folded into the per-letter keys so
  // React remounts the spans and replays their entrance animation.
  const [generation, setGeneration] = useState(0);
  const generationRef = useRef(0);
  const prevTextRef = useRef("");

  useEffect(() => {
    // A new utterance is one that doesn't continue what we were already showing.
    if (!text.startsWith(prevTextRef.current)) {
      shownRef.current = 0;
      generationRef.current += 1;
      setGeneration(generationRef.current);
      setShown(0);
    }
    prevTextRef.current = text;

    let rafId = 0;
    let last = 0;
    const tick = (t: number) => {
      if (!last) last = t;
      const dt = (t - last) / 1000;
      last = t;
      if (shownRef.current < text.length) {
        shownRef.current = Math.min(text.length, shownRef.current + Math.max(1, speed * dt));
        setShown(Math.floor(shownRef.current));
        rafId = requestAnimationFrame(tick);
      }
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [text, speed]);

  // Split the revealed text into words and whitespace so wrapping happens only
  // at spaces (letters are inline-block, which would otherwise break anywhere).
  const visible = text.slice(0, shown);
  const tokens: Array<{ part: string; start: number; isSpace: boolean }> = [];
  let offset = 0;
  for (const part of visible.split(/(\s+)/)) {
    if (part === "") continue;
    tokens.push({ part, start: offset, isSpace: /^\s+$/.test(part) });
    offset += part.length;
  }

  return (
    <>
      {tokens.map(({ part, start, isSpace }) =>
        isSpace ? (
          <span key={`s${generation}-${start}`}>{part}</span>
        ) : (
          <span key={`w${generation}-${start}`} className="public-experience__word">
            {Array.from(part).map((char, i) => (
              <span key={`c${generation}-${start + i}`} className="public-experience__char">
                {char}
              </span>
            ))}
          </span>
        ),
      )}
    </>
  );
}
