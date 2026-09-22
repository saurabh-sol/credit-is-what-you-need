// Limits the workspace lives by. Kept apart from the workspace module, which
// talks to the database, so the browser can read them too.
export const MAX_CONVERSATIONS = 200; // the oldest is dropped when a new one would exceed it
export const HISTORY_SENT = 20; // messages sent to the model per turn
export const MAX_MESSAGE_CHARS = 48_000;
export const MAX_CREATIONS = 60; // pictures and clips kept per wallet
export const MAX_TITLE = 80;
