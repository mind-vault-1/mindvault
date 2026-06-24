# Supabase Setup Walkthrough

This guide walks you through configuring a Supabase project for MindVault local development — from project creation to running your first migration. By the end, you will have a working Postgres database and a Storage bucket ready for the MindVault server.

---

## Prerequisites

- A free [Supabase](https://supabase.com) account
- The MindVault repository cloned and dependencies installed (`pnpm install`)
- Node.js 20+ and pnpm available on your PATH

---

## 1. Create a Supabase Project

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) and click **New project**.
2. Choose your organization (or create one).
3. Fill in the project details:
   - **Name**: e.g. `mindvault-dev`
   - **Database password**: choose a strong password — you'll need it for the connection string
   - **Region**: pick the region closest to you for lowest latency
4. Click **Create new project** and wait for provisioning (~30 seconds).

---

## 2. Collect Your Credentials

Once the project is ready, you need three values from the Supabase dashboard. Navigate to **Settings → API** (or **Project Settings → API**):

### Database URL (connection string)

Go to **Settings → Database → Connection string** and select **URI** mode. Copy the connection string. It looks like:

```
postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
```

> [!IMPORTANT]
> Use the **Transaction (port 6543)** pooler URL, not the direct connection (port 5432). The transaction pooler is recommended for serverless and short-lived connections like MindVault's Express server.

Replace `[password]` with the database password you chose during project creation.

### Supabase URL

From the **API** settings page, copy the **Project URL**. It looks like:

```
https://abcdefghijklmnop.supabase.co
```

### Service Role Key

From the same **API** settings page, expand **Project API keys** and copy the **`service_role`** key (not the `anon` key). It starts with `eyJ...`.

> [!CAUTION]
> **The service role key bypasses all Row Level Security (RLS) policies.** It has full read/write access to your entire database and storage. Follow these rules:
>
> - **Never commit it** to version control — it belongs only in `server/.env`
> - **Never expose it** in client-side code, browser bundles, or public logs
> - **Never share it** in Slack, Discord, or GitHub issues
> - **Rotate it** immediately if you suspect it has been leaked (Settings → API → Regenerate)
>
> MindVault uses the service role key server-side only — in `supabaseStorage.ts` for file uploads/downloads and implicitly via `DATABASE_URL` for Drizzle ORM queries.

---

## 3. Configure Environment Variables

Copy the example env file and fill in your credentials:

```bash
cp server/.env.example server/.env
```

Open `server/.env` and set these three values:

```env
# Supabase
DATABASE_URL=postgresql://postgres.abcdefg:YOUR_PASSWORD@aws-0-us-east-1.pooler.supabase.com:6543/postgres
SUPABASE_URL=https://abcdefghijklmnop.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIs...
SUPABASE_STORAGE_BUCKET=resources
```

| Variable                 | Where to find it                          | Required |
|--------------------------|-------------------------------------------|:--------:|
| `DATABASE_URL`           | Settings → Database → Connection string   | ✅       |
| `SUPABASE_URL`           | Settings → API → Project URL              | ✅       |
| `SUPABASE_SERVICE_KEY`   | Settings → API → `service_role` key       | ✅       |
| `SUPABASE_STORAGE_BUCKET`| Defaults to `resources` — no action needed | Optional |

> [!NOTE]
> The `SUPABASE_STORAGE_BUCKET` variable defaults to `resources` if omitted. You only need to set it if you want a different bucket name.

---

## 4. Create the Storage Bucket

MindVault stores uploaded file resources (PDFs, datasets, etc.) in Supabase Storage. You need to create the bucket manually:

1. In the Supabase dashboard, go to **Storage** (left sidebar).
2. Click **New bucket**.
3. Set the bucket name to **`resources`** (must match `SUPABASE_STORAGE_BUCKET` in your `.env`).
4. Leave **Public bucket** toggled **off** — MindVault serves files through its own paywalled API, not via public Supabase URLs.
5. Optionally set a file size limit (the server defaults to 50 MB via `MAX_FILE_SIZE_MB`).
6. Click **Create bucket**.

### Verify the bucket

You can verify the bucket exists by checking the Storage page — it should appear in the sidebar. No additional bucket policies are needed because the server uses the service role key, which bypasses RLS.

---

## 5. Run Drizzle Migrations

With your `DATABASE_URL` configured, generate and apply the database schema:

```bash
# From the repo root — generates migration SQL from the Drizzle schema
pnpm db:generate

# Applies pending migrations to your Supabase Postgres database
pnpm db:migrate
```

This creates the following tables in your Supabase database:

| Table           | Purpose                                              |
|-----------------|------------------------------------------------------|
| `publishers`    | Registered creators/agents with API key hashes       |
| `resources`     | Digital assets (files/links) with pricing and status |
| `verifications` | AI originality check results                         |
| `payments`      | x402 payment records tracking buyer → creator flows  |

### Verify the tables

Open the **Table Editor** in your Supabase dashboard. You should see all four tables listed. You can also use Drizzle Studio for a local view:

```bash
pnpm --filter @mindvault/server db:studio
```

This opens a browser-based UI at `https://local.drizzle.studio` showing your tables and data.

---

## 6. Seed Sample Data (Optional)

To populate the database with sample resources for local development:

```bash
pnpm seed
```

This inserts a demo publisher and several sample resources so the catalog is not empty when you start the web app.

---

## 7. Verify Everything Works

Start the server and confirm it connects to Supabase successfully:

```bash
pnpm dev:server
```

You should see:

```
MindVault server started { port: 4021, network: "stellar:testnet" }
```

Test the database connection by hitting the health endpoint:

```bash
curl http://localhost:4021/health
```

If Supabase is configured correctly, the server starts without errors. If `DATABASE_URL` or `SUPABASE_SERVICE_KEY` is wrong, the server will fail fast with a clear validation error listing the problematic variable.

---

## Troubleshooting

### "Connection terminated unexpectedly" or timeout errors

- **Check the connection string port**: use `6543` (transaction pooler), not `5432` (direct).
- **Check the password**: special characters in the password may need URL-encoding (e.g., `@` → `%40`).
- **Check region**: if you're far from the Supabase region, consider a closer one for dev.

### "Bucket not found" on file upload

- Verify the bucket name in your Supabase dashboard matches `SUPABASE_STORAGE_BUCKET` (default: `resources`).
- The bucket must be created manually — Drizzle migrations only handle the database, not Storage.

### "Invalid API key" or 401 errors

- Ensure you copied the **service role** key, not the **anon** key.
- The service role key starts with `eyJ` and is significantly longer than the anon key.
- If recently regenerated, restart the server to pick up the new key.

### Migrations fail with "relation already exists"

This happens if you ran migrations before and the schema already exists. Drizzle tracks applied migrations in a `__drizzle_migrations` table. If you need a clean slate:

1. Drop all tables in the Supabase SQL editor (or delete and recreate the project)
2. Re-run `pnpm db:migrate`

---

## Security Checklist

Before going beyond local development, verify:

- [ ] `server/.env` is listed in `.gitignore` (it is by default)
- [ ] The service role key is **not** in any committed file, CI log, or browser bundle
- [ ] Row Level Security (RLS) is enabled on all tables if you ever expose the `anon` key (not required for MindVault's server-side architecture)
- [ ] The storage bucket is **private** (not public) — MindVault controls access via x402 paywalls

---

## Further Reading

- [Local Setup Guide](local-setup.md) — full end-to-end setup including Stellar wallets
- [Server Environment Variables](server-env.md) — complete reference for all env vars
- [Supabase Docs: Database](https://supabase.com/docs/guides/database) — official Postgres guide
- [Supabase Docs: Storage](https://supabase.com/docs/guides/storage) — official Storage guide
- [Drizzle ORM Docs](https://orm.drizzle.team/docs/overview) — schema and migration reference
