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

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Panel ETL (`/admin/etl`)

Operator view over the updater's run ledger (`etl_runs` / `etl_cursors`, see
[`docs/updater.md`](../docs/updater.md)): per-run status, duration, commit,
host and an expandable per-step breakdown with counters and errors.

Gated by a single shared password in `ETL_DASHBOARD_PASSWORD`:

- unset or empty → the panel is open (no login); the ledger holds only run
  timings, counters and error strings;
- a correct password sets an httpOnly `etl_session` cookie (30 days, scoped to
  `/admin`) holding an HMAC-SHA256 of a fixed subject keyed by the password —
  the password itself is never stored client-side, and rotating it invalidates
  every existing cookie.

Local run: `ETL_DASHBOARD_PASSWORD=... pnpm dev`, then open
<http://localhost:3000/admin/etl>. The page is `force-dynamic` and `noindex`,
and `/admin/` is disallowed in `robots.txt`.
