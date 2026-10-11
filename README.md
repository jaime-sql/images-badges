Client-side pixel badge generator. The classic dither styles stay in the browser. Pixel portrait can call a Cloudflare Worker, which is the only place that talks to the image API.

## Portrait cost

Each generation is one 1024×1024 Images edit. The Worker defaults to `gpt-image-1-mini` at quality `low` (`OPENAI_IMAGE_MODEL` and `OPENAI_IMAGE_QUALITY` in `worker/wrangler.toml`). At 1024×1024, output is 272 tokens for low and 1056 tokens for medium (OpenAI pricing page and image guide, 2026-10-11).

Image and text input tokens are extra and depend on the photo. They are logged as `input_tokens` and `output_tokens` on each generation.

| Model | Output price | PRICE_PER_IMAGE_LOW | PRICE_PER_IMAGE_MEDIUM |
| --- | --- | --- | --- |
| gpt-image-1-mini (`OPENAI_IMAGE_MODEL` default) | $8 / 1M output tokens | $0.002 | $0.008 |
| gpt-image-1 | $40 / 1M output tokens | $0.011 | $0.042 |

Caps, counted in one Durable Object per UTC day: `PER_IP_DAILY_LIMIT` (default 5) per visitor IP hash, and `SITE_DAILY_LIMIT` (default 50) for the whole site. The object reserves a slot atomically before the image call, so parallel requests cannot share one read and slip past the cap. If the image call fails, that reservation is released and the slot can be used again. A successful image, including mock mode, keeps the slot. At 50 a day that is about 1,500 a month. The default mini model at low quality is about $3 a month in output tokens (1,500 × $0.002) before input tokens. Set `OPENAI_IMAGE_MODEL = "gpt-image-1"` and `OPENAI_IMAGE_QUALITY = "medium"` in `worker/wrangler.toml` to switch without a code change. gpt-image-1 at low quality is about $16 a month at the same cap.

The Worker calls OpenAI as soon as the API key secret exists. From the `worker/` directory:

```bash
npx wrangler secret put OPENAI_API_KEY
```

The key stays on the Worker. It is never sent to the browser. The site only reads `NEXT_PUBLIC_PORTRAIT_API_URL` (the full `https://<worker>/portrait` URL). There is no sign-in and no server-side image storage.

`MOCK_OPENAI` defaults to false and is not set in `worker/wrangler.toml`. For a free local check, put `MOCK_OPENAI=true` and `DEV=true` in `worker/.dev.vars`. Mock replies include `X-Portrait-Mock: 1`, and the downloaded badge burns a DEMO tag into the top-right of the portrait. `DEV=true` also allows `http://localhost:3000` in CORS. Production CORS is only `https://jaime-sql.github.io`.

The quota Durable Object is declared in `worker/wrangler.toml` (`PortraitQuota`, migration `v1`). `npm run check` inside `worker/` regenerates binding types and typechecks the Worker. The GitHub Action deploys the Worker on pushes to `main` that touch `worker/**`, and skips when `CLOUDFLARE_API_TOKEN` or `CLOUDFLARE_ACCOUNT_ID` is missing.

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

Tests (`npm test`) need Node.js 22 or newer.

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
