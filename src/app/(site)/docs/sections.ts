// The order of the page, shared by the page itself and the rail that follows it.
// Other pages link to these ids, so they stay as they are.
export const sectionGroups = [
  {
    title: "Get started",
    sections: [
      ["key", "Get your key"],
      ["quickstart", "Quickstart"],
      ["auth", "Authentication"],
    ],
  },
  {
    title: "Reference",
    sections: [
      ["endpoints", "Endpoints"],
      ["streaming", "Streaming"],
      ["billing", "Credits and billing"],
      ["errors", "Errors"],
      ["limits", "Limits"],
    ],
  },
  {
    title: "More",
    sections: [
      ["models", "Models"],
      ["tools", "Use it in your tools"],
    ],
  },
] as const;

export type SectionId = (typeof sectionGroups)[number]["sections"][number][0];
