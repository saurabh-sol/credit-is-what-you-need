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
