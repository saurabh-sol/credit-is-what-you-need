"use client";

import { useInView } from "./use-in-view";

type TextRevealProps = {
  text: string;
  as?: "h1" | "h2" | "h3" | "p";
  className?: string;
  /** Words to paint in the accent color, e.g. the last word of a headline. */
  accent?: string[];
};

// Each word rises out of its own mask, one after another, the first time the
// text scrolls into view. Screen readers get the sentence as plain text.
export function TextReveal({ text, as = "h2", className = "", accent = [] }: TextRevealProps) {
  const [ref, inView] = useInView<HTMLHeadingElement>();
  const Tag = as as "h2";
  const words = text.split(" ");

  return (
    <Tag ref={ref} aria-label={text} className={`text-reveal ${inView ? "is-visible" : ""} ${className}`}>
      {words.map((word, index) => (
        <span key={index} aria-hidden className="word">
          <span style={{ "--i": index } as React.CSSProperties} className={accent.includes(word) ? "text-accent" : undefined}>
            {word}
          </span>
          {index < words.length - 1 && " "}
        </span>
      ))}
    </Tag>
  );
}
