import { Playground } from "./playground";
import { MODES, type Mode } from "./types";

export const metadata = { title: "Playground — Kredit" };

// /playground?model=openai/gpt-4o&mode=text opens with that model chosen; the
// model board and the docs link here.
export default async function PlaygroundPage({ searchParams }: { searchParams: Promise<{ model?: string; mode?: string }> }) {
  const { model, mode } = await searchParams;
  const initialMode = MODES.some((entry) => entry.id === mode) ? (mode as Mode) : undefined;
  return <Playground initialModel={model} initialMode={initialMode} />;
}
