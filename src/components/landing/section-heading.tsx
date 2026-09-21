import { Reveal } from "@/components/motion/reveal";
import { TextReveal } from "@/components/motion/text-reveal";

type SectionHeadingProps = { eyebrow: string; title: string; children?: React.ReactNode };

// Every section opens the same way: eyebrow, title, lede, arriving one after another.
export function SectionHeading({ eyebrow, title, children }: SectionHeadingProps) {
  return (
    <div>
      <Reveal>
        <p className="eyebrow">{eyebrow}</p>
      </Reveal>
      <TextReveal text={title} className="mt-4 max-w-[22ch] text-3xl font-semibold tracking-tight text-balance sm:text-4xl" />
      {children && (
        <Reveal delay={180}>
          <p className="mt-5 max-w-[60ch] text-lg leading-relaxed text-mist">{children}</p>
        </Reveal>
      )}
    </div>
  );
}
