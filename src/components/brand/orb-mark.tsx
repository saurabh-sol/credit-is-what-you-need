import Image from "next/image";
import orb from "./orb.png";

// Kredit's mark: the striped orange orb. Decorative wherever it appears, since
// the word "Kredit" or the model's name sits next to it.
export function OrbMark({ className = "size-7" }: { className?: string }) {
  return <Image src={orb} alt="" aria-hidden priority className={`${className} shrink-0 select-none object-contain`} draggable={false} />;
}
