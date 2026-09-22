"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { CloseIcon, PlusIcon, SendIcon, StopIcon } from "@/components/icons";
import { MicIcon, PaperclipIcon } from "./icons";
import { MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS, MAX_TEXT_ATTACHMENT_BYTES, TEXT_ATTACHMENT_TYPES, type Attachment } from "./types";

type ComposerProps = {
  busy: boolean;
  // Why nothing can be sent right now, said in words; null when sending is fine.
  blocked: ReactNode | null;
  canReset: boolean;
  maxChars: number;
  onSend: (text: string, attachments: Attachment[]) => void;
  onStop: () => void;
  onReset: () => void;
};

// The browser's own speech engine, when it has one. Nothing is sent anywhere.
type Recognition = { start: () => void; stop: () => void; lang: string; interimResults: boolean; continuous: boolean; onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null };
const speechEngine = () => {
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

const readFile = (file: File, as: "text" | "dataUrl") =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    if (as === "text") reader.readAsText(file);
    else reader.readAsDataURL(file);
  });

const kb = (bytes: number) => `${Math.max(1, Math.round(bytes / 1024))} KB`;

// The draft lives here, so typing never re-renders the transcript above.
export function Composer({ busy, blocked, canReset, maxChars, onSend, onStop, onReset }: ComposerProps) {
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  // Whether this browser has a speech engine; false on the server.
  const canListen = useSyncExternalStore(() => () => {}, () => speechEngine() !== null, () => false);
  const input = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const recognizer = useRef<Recognition | null>(null);
  const ready = !busy && !blocked && (draft.trim() !== "" || attachments.length > 0) && draft.length <= maxChars;

  useEffect(() => () => recognizer.current?.stop(), []);

  function submit() {
    if (!ready) return;
    recognizer.current?.stop();
    onSend(draft, attachments);
    setDraft("");
    setAttachments([]);
    setNote(null);
  }

  async function attach(files: FileList | null) {
    if (!files) return;
    const next = [...attachments];
    for (const file of Array.from(files)) {
      if (next.length >= MAX_ATTACHMENTS) {
        setNote(`Up to ${MAX_ATTACHMENTS} files per message.`);
        break;
      }
      const isImage = file.type.startsWith("image/");
      const isText = TEXT_ATTACHMENT_TYPES.some((extension) => file.name.toLowerCase().endsWith(extension)) || file.type.startsWith("text/");
      if (!isImage && !isText) {
        setNote(`${file.name}: pictures and plain text files only.`);
        continue;
      }
      const limit = isImage ? MAX_ATTACHMENT_BYTES : MAX_TEXT_ATTACHMENT_BYTES;
      if (file.size > limit) {
        setNote(`${file.name} is ${kb(file.size)}; the limit is ${kb(limit)}.`);
        continue;
      }
      try {
        next.push({
          name: file.name,
          kind: isImage ? "image" : "text",
          mediaType: file.type || "text/plain",
          data: await readFile(file, isImage ? "dataUrl" : "text"),
          size: file.size,
        });
      } catch {
        setNote(`${file.name} could not be read.`);
      }
    }
    setAttachments(next);
    if (picker.current) picker.current.value = "";
  }

  function toggleListening() {
    if (listening) {
      recognizer.current?.stop();
      return;
    }
    const Engine = speechEngine();
    if (!Engine) return;
    const engine = new Engine();
    engine.lang = navigator.language || "en-US";
    engine.interimResults = false;
    engine.continuous = true;
    const before = draft;
    engine.onresult = (event) => {
      let heard = "";
      for (let index = 0; index < event.results.length; index++) heard += event.results[index][0].transcript;
      setDraft(`${before}${before && !before.endsWith(" ") ? " " : ""}${heard}`);
    };
    engine.onend = () => {
      setListening(false);
      recognizer.current = null;
      input.current?.focus();
    };
    engine.onerror = () => {
      setListening(false);
      recognizer.current = null;
      setNote("The microphone did not start. Check the browser's permission for this site.");
    };
    recognizer.current = engine;
    setListening(true);
    engine.start();
  }

  const over = draft.length > maxChars;

  return (
    <form
      className="shrink-0 border-t border-line px-4 pt-3 pb-4 sm:px-6"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        void attach(event.dataTransfer.files);
      }}
    >
      <div className="mx-auto w-full max-w-[760px]">
        {blocked && (
          <p id="composer-blocked" className="mb-2.5 text-[0.8125rem] leading-relaxed text-mist">
            {blocked}
          </p>
        )}

        <div className="rounded-xl border border-line bg-surface transition-[border-color,box-shadow] duration-200 focus-within:border-accent/60 focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-accent)_12%,transparent)]">
          {attachments.length > 0 && (
            <ul className="flex flex-wrap gap-1.5 px-3 pt-3">
              {attachments.map((file, index) => (
                <li key={`${file.name}-${index}`} className="flex items-center gap-1.5 rounded-md border border-line bg-raised px-2 py-1 font-mono text-[0.6875rem] text-fog">
                  {file.kind === "image" ? (
                    // A data URL the person just chose; nothing for next/image to optimize.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={file.data} alt="" className="size-4 rounded-sm object-cover" />
                  ) : (
                    <PaperclipIcon className="size-3 text-mist" />
                  )}
                  <span className="max-w-40 truncate">{file.name}</span>
                  <span className="text-mist">{kb(file.size)}</span>
                  <button type="button" aria-label={`Remove ${file.name}`} onClick={() => setAttachments(attachments.filter((_, at) => at !== index))} className="text-mist hover:text-fog">
                    <CloseIcon className="size-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <label className="sr-only" htmlFor="prompt">
            Message
          </label>
          <textarea
            id="prompt"
            ref={input}
            rows={1}
            value={draft}
            disabled={Boolean(blocked)}
            aria-describedby={blocked ? "composer-blocked" : undefined}
            onChange={(event) => setDraft(event.target.value)}
            onPaste={(event) => {
              const files = event.clipboardData?.files;
              if (files && files.length > 0) {
                event.preventDefault();
                void attach(files);
              }
            }}
            onKeyDown={(event) => {
              // Enter also confirms a word in an input method editor; leave that one alone.
              if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
              event.preventDefault();
              submit();
            }}
            placeholder={blocked ? "Sending is off for now" : listening ? "Listening…" : "Ask something"}
            className="block max-h-48 min-h-12 w-full resize-none bg-transparent px-3.5 pt-3 pb-1.5 text-[0.9375rem] leading-6 text-fog [field-sizing:content] placeholder:text-mist focus:outline-none disabled:cursor-not-allowed"
          />

          <div className="flex flex-wrap items-center gap-2 px-2.5 pb-2.5">
            <button
              type="button"
              disabled={busy || !canReset}
              onClick={() => {
                onReset();
                input.current?.focus();
              }}
              className="btn-sm"
            >
              <PlusIcon className="size-3.5" />
              New chat
            </button>
            <input ref={picker} type="file" multiple accept={`image/*,${TEXT_ATTACHMENT_TYPES.join(",")}`} className="hidden" onChange={(event) => void attach(event.target.files)} />
            <button type="button" disabled={Boolean(blocked) || busy} onClick={() => picker.current?.click()} className="btn-sm" title="Attach a picture or a text file">
              <PaperclipIcon className="size-3.5" />
              Attach
            </button>
            {canListen && (
              <button
                type="button"
                disabled={Boolean(blocked) || busy}
                onClick={toggleListening}
                aria-pressed={listening}
                className={`btn-sm ${listening ? "text-accent" : ""}`}
                title="Dictate with your browser's speech engine; nothing is sent to Kredit"
              >
                <MicIcon className="size-3.5" />
                {listening ? "Stop" : "Dictate"}
              </button>
            )}

            <p className="ml-auto hidden items-center gap-1.5 text-xs text-mist md:flex">
              {over ? (
                <span className="text-danger">{draft.length.toLocaleString("en-US")} characters; the limit is {maxChars.toLocaleString("en-US")}.</span>
              ) : (
                <>
                  <kbd className="kbd">Enter</kbd> to send
                  <span className="ml-2 inline-flex items-center gap-1">
                    <kbd className="kbd">Shift</kbd>
                    <kbd className="kbd">Enter</kbd>
                  </span>
                  for a new line
                </>
              )}
            </p>

            {busy ? (
              <button type="button" onClick={onStop} className="btn-sm ml-auto md:ml-1">
                <StopIcon className="size-3.5" />
                Stop
              </button>
            ) : (
              <button type="submit" disabled={!ready} className="btn-sm btn-sm-primary ml-auto md:ml-1">
                Send
                <SendIcon className="size-3.5" />
              </button>
            )}
          </div>
        </div>
        {note && (
          <p role="status" className="mt-2 text-xs text-mist">
            {note}
          </p>
        )}
      </div>
    </form>
  );
}
