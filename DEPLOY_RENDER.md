# Deploy a live demo — Render + Supabase (free, no credit card)

For a clickable demo URL without GCP billing. The app runs as a Docker web
service on **Render** (free), backed by **Supabase** Postgres (free).

> This is the **live demo**. The cloud IaC deliverable is the GCP Terraform in
> [`infra/`](infra/) / [`infra/gce-free/`](infra/gce-free/) — that's what satisfies
> "deployable to AWS/Azure/GCP". Render/Supabase are used only because they're
> free with no card.
>
> **Free-tier caveat:** the Render free web service **sleeps after ~15 min idle**
> (first request then cold-starts in ~30–60s). While asleep the per-minute
> valuation tick pauses — valuations advance whenever the app is awake, which is
> fine for a live walkthrough.

## 1. Postgres on Supabase

1. Create a project at https://supabase.com (free, no card). Pick a region near you; set a DB password.
2. When it's provisioned: **Project Settings → Database → Connection string**.
3. Copy the **Session pooler** URI (it's IPv4 — Render egress is IPv4; the
   direct connection is IPv6-only on the free tier and won't work from Render).
   It looks like:

   ```
   postgresql://postgres.<ref>:<PASSWORD>@aws-0-<region>.pooler.supabase.com:5432/postgres
   ```

   Substitute your real password. (TLS is required — the app enables it
   automatically for non-local hosts; no `?sslmode` needed.)

## 2. App on Render

1. Push this repo to GitHub (already done) and sign in to https://render.com with GitHub (free, no card).
2. **New → Blueprint**, pick this repo. Render reads [`render.yaml`](render.yaml) and
   proposes the `pets-trading` Docker web service.
3. When prompted, set the **`DATABASE_URL`** env var to the Supabase pooler URI from step 1.
4. **Apply** / **Create**. Render builds the Docker image and deploys (first build ~3–5 min).
5. On boot the app runs migrations + seed against Supabase, then serves. Open the
   `https://pets-trading-XXXX.onrender.com` URL Render gives you.

## Verify

- Visit `/healthz` → `{"status":"ok"}`.
- Open `/` → the 3-trader dashboard. Buy a pet, list it, bid from another trader.
- Render dashboard → **Logs** shows the structured JSON request logs + `[migrate]`/`[seed]`/`[engine]` boot lines.

## Redeploy

`autoDeploy: true` is set — every push to `main` rebuilds and redeploys. Or click
**Manual Deploy** in the Render dashboard.

## Notes

- The app connects with `prepare: false` + `ssl: require` for non-local hosts (see
  [src/db/pool.ts](src/db/pool.ts)) so it works through Supabase's pooler.
- To avoid sleep entirely you'd need a paid Render plan or a keep-warm pinger
  (e.g. a free cron at https://cron-job.org hitting `/healthz` every 10 min) —
  optional, and not needed for a live demo.
