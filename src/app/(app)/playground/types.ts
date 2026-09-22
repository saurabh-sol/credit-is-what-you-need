// One row of the transcript. `ms`, `cost` and `stopped` are filled in once a reply ends.
export type Turn = {
  id: number;
  role: "user" | "assistant";
  content: string;
  model?: string;
  ms?: number;
  cost?: number;
  stopped?: boolean;
};

// What the gateway said went wrong; `code` picks the advice shown next to it.
export type Failure = { message: string; code?: string };

// What the playground makes: a conversation, pictures, or a clip.
export type Mode = "text" | "image" | "video";

export const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: "text", label: "Text", hint: "Chat with a language model" },
  { id: "image", label: "Image", hint: "Make pictures from a prompt" },
  { id: "video", label: "Video", hint: "Make a short clip from a prompt" },
];

// Where each mode starts, until the person picks another model.
export const DEFAULT_MODELS: Record<Mode, string> = {
  text: "kredit/echo",
  image: "openai/gpt-image-2",
  video: "google/veo-3.1-fast-generate-001",
};

export type ImageOptions = { size: string; n: number };
export type VideoOptions = { duration: number; resolution: string; aspectRatio: string; generateAudio: boolean };

// One picture or clip made in the studio, with what it cost.
export type Creation = {
  id: number;
  kind: "image" | "video";
  prompt: string;
  model: string;
  files: { base64: string; mediaType: string }[];
  ms?: number;
  cost?: number;
  error?: Failure;
};
