import { randomUUID } from "node:crypto";
import { all, NOW, one, run, transaction } from "./db.ts";

// The workspace: conversations, their messages, and the pictures and clips a
// wallet made. Everything is scoped to the wallet that made it, kept until
// that wallet deletes it, and deleted for real when it does.

const lower = (address: string) => address.toLowerCase();

import { HISTORY_SENT, MAX_CONVERSATIONS, MAX_CREATIONS, MAX_MESSAGE_CHARS, MAX_TITLE } from "./workspace-limits.ts";

export { HISTORY_SENT, MAX_CONVERSATIONS, MAX_CREATIONS, MAX_MESSAGE_CHARS, MAX_TITLE };

export type Conversation = { id: string; title: string; model: string; system: string | null; createdAt: string; updatedAt: string; messages: number };

export type Message = {
  id: number;
  role: "user" | "assistant";
  content: string;
  model: string | null;
  credits: number | null;
  ms: number | null;
  createdAt: string;
  // Attachments the person sent with the message: their names only, the
  // bytes went to the model and were not kept.
  attachments: string[];
};

export async function listConversations(address: string): Promise<Conversation[]> {
  return all<Conversation>(
    `SELECT c.id, c.title, c.model, c.system, c.created_at AS "createdAt", c.updated_at AS "updatedAt",
            (SELECT COUNT(*)::int FROM messages m WHERE m.conversation_id = c.id) AS messages
     FROM conversations c WHERE c.address = ? ORDER BY c.updated_at DESC, c.id`,
    [lower(address)],
  );
}

export const titleFrom = (text: string) => {
  const line = text.replace(/\s+/g, " ").trim();
  return (line.length > MAX_TITLE ? `${line.slice(0, MAX_TITLE - 1)}…` : line) || "New chat";
};

export async function createConversation(address: string, input: { title?: string; model: string; system?: string | null }) {
  const owner = lower(address);
  const id = randomUUID();
  return transaction(async () => {
    await run("INSERT INTO conversations (id, address, title, model, system) VALUES (?, ?, ?, ?, ?)", [
      id,
      owner,
      titleFrom(input.title ?? ""),
      input.model,
      input.system?.trim() || null,
    ]);
    // Keep the list bounded: the oldest conversations beyond the limit go.
    await run(
      `DELETE FROM conversations WHERE address = ? AND id IN (
         SELECT id FROM conversations WHERE address = ? ORDER BY updated_at DESC, id OFFSET ?)`,
      [owner, owner, MAX_CONVERSATIONS],
    );
    return (await getConversation(owner, id))!;
  }, owner);
}

export async function getConversation(address: string, id: string) {
  const row = await one<Conversation>(
    `SELECT id, title, model, system, created_at AS "createdAt", updated_at AS "updatedAt",
            (SELECT COUNT(*)::int FROM messages m WHERE m.conversation_id = conversations.id) AS messages
     FROM conversations WHERE address = ? AND id = ?`,
    [lower(address), id],
  );
  return row ?? null;
}

export async function listMessages(address: string, conversationId: string): Promise<Message[]> {
  const rows = await all<Omit<Message, "attachments"> & { attachments: string | null }>(
    `SELECT m.id, m.role, m.content, m.model, m.credits, m.ms, m.created_at AS "createdAt", m.attachments
     FROM messages m JOIN conversations c ON c.id = m.conversation_id
     WHERE c.address = ? AND c.id = ? ORDER BY m.id`,
    [lower(address), conversationId],
  );
  return rows.map((row) => ({ ...row, attachments: row.attachments ? (JSON.parse(row.attachments) as string[]) : [] }));
}

export async function updateConversation(address: string, id: string, patch: { title?: string; model?: string; system?: string | null }) {
  const sets: string[] = [];
  const params: unknown[] = [];
  if (patch.title !== undefined) {
    sets.push("title = ?");
    params.push(titleFrom(patch.title));
  }
  if (patch.model !== undefined) {
    sets.push("model = ?");
    params.push(patch.model);
  }
  if (patch.system !== undefined) {
    sets.push("system = ?");
    params.push(patch.system?.trim() || null);
  }
  if (sets.length === 0) return getConversation(address, id);
  sets.push(`updated_at = ${NOW}`);
  const changed = await run(`UPDATE conversations SET ${sets.join(", ")} WHERE address = ? AND id = ?`, [...params, lower(address), id]);
  return changed > 0 ? getConversation(address, id) : null;
}

// A hard delete: the messages go with it (ON DELETE CASCADE).
export async function deleteConversation(address: string, id: string) {
  return (await run("DELETE FROM conversations WHERE address = ? AND id = ?", [lower(address), id])) > 0;
}

export async function appendMessage(
  address: string,
  conversationId: string,
  message: { role: "user" | "assistant"; content: string; model?: string | null; credits?: number | null; ms?: number | null; attachments?: string[] },
) {
  const owner = lower(address);
  const content = message.content.slice(0, MAX_MESSAGE_CHARS);
  return transaction(async () => {
    const owned = await one("SELECT 1 FROM conversations WHERE address = ? AND id = ?", [owner, conversationId]);
    if (!owned) return null;
    const row = await one<{ id: number; createdAt: string }>(
      `INSERT INTO messages (conversation_id, role, content, model, credits, ms, attachments) VALUES (?, ?, ?, ?, ?, ?, ?)
       RETURNING id, created_at AS "createdAt"`,
      [
        conversationId,
        message.role,
        content,
        message.model ?? null,
        message.credits ?? null,
        message.ms ?? null,
        message.attachments && message.attachments.length > 0 ? JSON.stringify(message.attachments) : null,
      ],
    );
    await run(`UPDATE conversations SET updated_at = ${NOW} WHERE id = ?`, [conversationId]);
    return row!;
  }, owner);
}

// The cost of a reply is known only once its charge settles; this fills it in.
export async function priceMessage(address: string, messageId: number, credits: number) {
  return run(
    `UPDATE messages SET credits = ? WHERE id = ? AND conversation_id IN (SELECT id FROM conversations WHERE address = ?)`,
    [credits, messageId, lower(address)],
  );
}

// --- The library: pictures and clips -------------------------------------------

export type CreationFile = { base64: string; mediaType: string };
export type Creation = {
  id: string;
  kind: "image" | "video";
  prompt: string;
  model: string;
  credits: number | null;
  createdAt: string;
  files: CreationFile[];
};

export async function listCreations(address: string, { withFiles = true } = {}): Promise<Creation[]> {
  const rows = await all<Omit<Creation, "files"> & { files: string }>(
    `SELECT id, kind, prompt, model, credits, created_at AS "createdAt", ${withFiles ? "files" : "'[]' AS files"}
     FROM creations WHERE address = ? ORDER BY created_at DESC, id`,
    [lower(address)],
  );
  return rows.map((row) => ({ ...row, files: JSON.parse(row.files) as CreationFile[] }));
}

export async function saveCreation(address: string, creation: { kind: "image" | "video"; prompt: string; model: string; credits?: number | null; files: CreationFile[] }) {
  const owner = lower(address);
  const id = randomUUID();
  return transaction(async () => {
    await run("INSERT INTO creations (id, address, kind, prompt, model, credits, files) VALUES (?, ?, ?, ?, ?, ?, ?)", [
      id,
      owner,
      creation.kind,
      creation.prompt.slice(0, 4000),
      creation.model,
      creation.credits ?? null,
      JSON.stringify(creation.files),
    ]);
    await run(
      `DELETE FROM creations WHERE address = ? AND id IN (
         SELECT id FROM creations WHERE address = ? ORDER BY created_at DESC, id OFFSET ?)`,
      [owner, owner, MAX_CREATIONS],
    );
    return id;
  }, owner);
}

export async function deleteCreation(address: string, id: string) {
  return (await run("DELETE FROM creations WHERE address = ? AND id = ?", [lower(address), id])) > 0;
}

// Everything the workspace holds for a wallet, gone. The ledger is untouched.
export async function clearWorkspace(address: string) {
  const owner = lower(address);
  await run("DELETE FROM conversations WHERE address = ?", [owner]);
  await run("DELETE FROM creations WHERE address = ?", [owner]);
}
