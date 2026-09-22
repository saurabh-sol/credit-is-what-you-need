// Where the site lives. Shown in every snippet, invite link and example, so a
// person reading the docs on a preview or on localhost still copies the real
// address. Set NEXT_PUBLIC_SITE_URL to move it.
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://usekredit.space").replace(/\/$/, "");
