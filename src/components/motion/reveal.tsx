"use client";

import { useInView } from "./use-in-view";

type RevealProps = {
  children: React.ReactNode;
  as?: "div" | "li" | "section";
  /** Milliseconds to wait after entering the viewport; use it to stagger siblings. */
  delay?: number;
  /** "mark" only adds `is-visible`, for children that animate themselves. */
  variant?: "rise" | "mark";
  className?: string;
};

export function Reveal({ children, as = "div", delay = 0, variant = "rise", className = "" }: RevealProps) {
  const [ref, inView] = useInView<HTMLDivElement>();
  // Every allowed tag takes the same props, so one concrete type keeps the ref simple.
  const Tag = as as "div";

  return (
    <Tag
      ref={ref}
      style={delay ? ({ "--reveal-delay": `${delay}ms` } as React.CSSProperties) : undefined}
      className={`${variant === "rise" ? "reveal" : ""} ${inView ? "is-visible" : ""} ${className}`}
    >
      {children}
    </Tag>
  );
}
