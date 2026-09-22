// Where the site lives. Shown in every snippet, invite link and example, so a
// person reading the docs on a preview or on localhost still copies the real
// address. Set NEXT_PUBLIC_SITE_URL to move it.
const DEFAULT_SITE_URL = "https://usekredit.space";

// Hosts the site used to live on. A deploy that still carries one of these in
// NEXT_PUBLIC_SITE_URL is treated as unset, so snippets keep pointing at the
// current address.
const RETIRED_HOSTS = ["fuel-credits.onrender.com"];

const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
const usable =
  configured && !RETIRED_HOSTS.some((host) => configured.includes(host)) ? configured : DEFAULT_SITE_URL;

export const SITE_URL = usable.replace(/\/$/, "");
