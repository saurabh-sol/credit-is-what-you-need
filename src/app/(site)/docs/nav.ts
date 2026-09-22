// The docs tree. The sidebar, the previous/next footer, search and the static
// route list all read this one structure, so a page exists exactly when it is here.

export type DocPage = { slug: string; title: string; description: string };
export type DocGroup = { title: string; pages: DocPage[] };

export const docGroups: DocGroup[] = [
  {
    title: "Getting started",
    pages: [
      { slug: "", title: "Introduction", description: "What Kredit is, who it is for and how the pieces fit." },
      { slug: "quickstart", title: "Quickstart", description: "From a wallet to a working API call in five minutes." },
      { slug: "how-it-works", title: "How it works", description: "Earn, claim, spend: the loop behind every credit." },
      { slug: "rules", title: "Rules at a glance", description: "Every number the platform runs on, on one page." },
    ],
  },
  {
    title: "Earn credits",
    pages: [
      { slug: "earn/record", title: "Your on-chain record", description: "What the scanner reads and how it turns transactions into a receipt." },
      { slug: "earn/scoring", title: "Tasks and milestones", description: "What each kind of transaction pays, the daily cap and one-time bonuses." },
      { slug: "earn/streaks", title: "Streaks", description: "Consecutive active days pay a growing daily bonus." },
      { slug: "earn/referrals", title: "Referrals", description: "Invite a wallet and earn a share of every claim it makes." },
      { slug: "earn/claims", title: "Claims and receipts", description: "How a claim is paid, and the on-chain receipt that proves it." },
      { slug: "earn/top-ups", title: "Buying credits", description: "Pay with the project token when you need more than you earned." },
    ],
  },
  {
    title: "API reference",
    pages: [
      { slug: "api/authentication", title: "Authentication", description: "API keys: format, creation, revocation and where to send them." },
      { slug: "api/chat-completions", title: "Chat Completions", description: "POST /v1/chat/completions, the OpenAI shape." },
      { slug: "api/responses", title: "Responses", description: "POST /v1/responses, for the newer OpenAI SDKs." },
      { slug: "api/messages", title: "Messages", description: "POST /v1/messages, the Anthropic shape." },
      { slug: "api/embeddings", title: "Embeddings", description: "POST /v1/embeddings." },
      { slug: "api/images", title: "Images", description: "POST /v1/images/generations." },
      { slug: "api/videos", title: "Videos", description: "POST /v1/videos/generations." },
      { slug: "api/models", title: "Models", description: "GET /v1/models: ids, types and prices." },
      { slug: "api/streaming", title: "Streaming", description: "Server-sent events and how streamed calls are billed." },
      { slug: "api/billing", title: "Pricing and billing", description: "What a call costs, how it is computed and the headers that report it." },
      { slug: "api/errors", title: "Errors", description: "Every status code and error code the gateway returns." },
      { slug: "api/limits", title: "Rate limits", description: "Requests per minute, keys per wallet, request sizes." },
      { slug: "api/account", title: "Account and usage", description: "GET /v1/account and GET /v1/usage." },
      { slug: "api/openapi", title: "OpenAPI", description: "The machine-readable description of the API." },
    ],
  },
  {
    title: "Integrations",
    pages: [
      { slug: "integrations", title: "SDKs and tools", description: "OpenAI and Anthropic SDKs, Claude Code, the AI SDK, Cursor and more." },
    ],
  },
  {
    title: "Platform",
    pages: [
      { slug: "platform/sign-in", title: "Wallets and sign-in", description: "Sign-In with Ethereum, sessions and smart wallets." },
      { slug: "platform/dashboard", title: "Dashboard", description: "Every signed-in page and what it does." },
      { slug: "platform/playground", title: "Playground", description: "Talk to any model in the browser, paid from your credits." },
      { slug: "platform/distribution", title: "Distribution board", description: "The public record of who earned what." },
      { slug: "platform/security", title: "Privacy and security", description: "What is stored, what is public, and how keys and sessions are protected." },
    ],
  },
  {
    title: "Self-hosting",
    pages: [
      { slug: "self-hosting/configuration", title: "Configuration", description: "Every environment variable, what it does and its default." },
      { slug: "self-hosting/docker", title: "Docker", description: "Build and run the image, keep the ledger on a volume." },
      { slug: "self-hosting/render", title: "Render", description: "One-click deployment from the repository blueprint." },
      { slug: "self-hosting/data", title: "Data and backups", description: "The SQLite ledger, what lives in it and how to back it up." },
      { slug: "self-hosting/testing", title: "Testing", description: "Unit tests, end-to-end scripts and the contract tests." },
    ],
  },
];

export const allPages = docGroups.flatMap((group) => group.pages.map((page) => ({ ...page, group: group.title })));

export const docHref = (slug: string) => (slug ? `/docs/${slug}` : "/docs");

export function findPage(slug: string) {
  const index = allPages.findIndex((page) => page.slug === slug);
  if (index === -1) return null;
  return { page: allPages[index], previous: allPages[index - 1] ?? null, next: allPages[index + 1] ?? null };
}
