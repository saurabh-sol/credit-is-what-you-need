This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Run with Docker

Put `SESSION_SECRET` (32+ random characters, `openssl rand -hex 32`) and any
optional settings from `.env.example` in `.env.local`, then:

```bash
docker compose --env-file .env.local up -d --build
```

Open [http://localhost:4000](http://localhost:4000); set `KREDIT_PORT` to use
another port. Credits, API keys and display names live in the `kredit-data`
volume, so they survive rebuilds. `docker compose down -v` deletes them.

`NEXT_PUBLIC_*` values (the RPC URLs and the WalletConnect project ID) are baked
into the browser bundle, so changing them needs a rebuild (`--build`); every
other setting only needs a restart.

## Back up the ledger

Everything lives in Neon Postgres (`DATABASE_URL`), which keeps its own
point-in-time history. For a copy you hold yourself:

```bash
npm run backup                                          # data/backups/kredit-<time>.json
```

It is safe while the site is running, checks the file, and keeps the newest 14
(`BACKUP_KEEP`). Run it from cron and copy the folder off the server.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
