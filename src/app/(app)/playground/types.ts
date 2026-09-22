// One row of the transcript. `ms`, `cost` and `stopped` are filled in once a reply ends.
export type Turn = {
  id: number;
  role: "user" | "assistant";
  content: string;
  model?: string;
  ms?: number;
  cost?: number;
  stopped?: boolean;
  // Names of files sent with a user message. The bytes went to the model and were not kept.
  attachments?: string[];
  // Replies to the same message in compare mode share a group and sit side by side.
  group?: number;
  // The row in the workspace database, once saved, so its cost can be filled in later.
  messageId?: number;
};

// What the gateway said went wrong; `code` picks the advice shown next to it.
export type Failure = { message: string; code?: string };

// What the playground makes: a conversation, pictures, or a clip.
export type Mode = "text" | "image" | "video" | "evaluate";

export const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: "text", label: "Text", hint: "Chat with a language model" },
  { id: "image", label: "Image", hint: "Make pictures from a prompt" },
  { id: "video", label: "Video", hint: "Make a short clip from a prompt" },
  { id: "evaluate", label: "Evaluate", hint: "Ask Jev typed questions about some text" },
];

// Where each mode starts, until the person picks another model.
export const DEFAULT_MODELS: Record<Mode, string> = {
  text: "kredit/echo",
  image: "openai/gpt-image-2",
  video: "google/veo-3.1-fast-generate-001",
  evaluate: "typesafe-ai/jev",
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
  saved?: boolean; // in the library
};

// A file attached to a message before it is sent. Pictures go to the model as
// image parts; text files are pasted in as text.
export type Attachment = { name: string; kind: "image" | "text"; mediaType: string; data: string; size: number };

export const MAX_ATTACHMENTS = 4;
export const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024; // pictures
export const MAX_TEXT_ATTACHMENT_BYTES = 200 * 1024;
export const TEXT_ATTACHMENT_TYPES = [".txt", ".md", ".csv", ".json", ".ts", ".tsx", ".js", ".py", ".sol", ".html", ".css", ".yml", ".yaml", ".toml", ".log"];

// System prompt presets. The first is the house style; the rest are starting points.
export const PRESETS: { name: string; prompt: string }[] = [
  { name: "Plain", prompt: "" }, // filled in with HOUSE_STYLE by the settings panel
  {
    name: "Coder",
    prompt:
      "You are a senior engineer reviewing and writing code. Answer with working code first, in a fenced block with the language named, then at most three short sentences on the choices that matter. Point out bugs and edge cases plainly. No preamble.",
  },
  {
    name: "Reviewer",
    prompt:
      "You are a careful reviewer. For whatever is pasted, list the concrete problems in order of severity, each in one sentence with the fix. Then say in one sentence whether it is ready. Do not praise, do not pad.",
  },
  {
    name: "Translator",
    prompt:
      "Translate whatever is sent into the language named in the first line of the message, or into English if no language is named. Keep the tone, the formatting and the names. Reply with the translation only.",
  },
  {
    name: "Explainer",
    prompt:
      "Explain the topic to a smart person who is new to it. Start with the one-sentence answer, then the mechanism in plain words, then one concrete example. Under 200 words unless asked for more.",
  },
];
