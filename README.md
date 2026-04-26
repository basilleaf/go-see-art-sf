Go See Art SF 

Auto-updating feed of current art exhibitions across select San Francisco museums"


- Aggregates current and upcoming art exhibitions across 9 San Francisco museums into a single browsable feed,
- Custom scrapers per museum using fetch + node-html-parser, handling varied site structures including WordPress, Wix, and custom CMSes,
- Weekly automated scraping via GitHub Actions cron; scrapers are idempotent and upsert by canonical exhibition URL,
- Card grid homepage ordered by closing date; detail pages include full image with credit, date range, description, and link to museum,
- Built with Next.js App Router, React, TypeScript, Tailwind CSS v4, Drizzle ORM, and Neon Postgres,

https://go-see-art-sf-11o7.vercel.app/

<img width="3420" height="2140" alt="image" src="https://github.com/user-attachments/assets/91c7711f-57ef-486c-899e-6f10a27d7631" />

detail page: 

<img width="3420" height="2132" alt="image" src="https://github.com/user-attachments/assets/0f361d6d-4adf-476c-8bdc-6eb407d6f49f" />


---- 
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
