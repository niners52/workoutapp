# workoutapp MCP server

Read-only [Model Context Protocol](https://modelcontextprotocol.io) server that exposes the
workout data this app stores in Supabase, so it can be added to claude.ai as a custom
connector. Node 20+, TypeScript, `@modelcontextprotocol/sdk` streamable HTTP transport,
Express, plain `supabase-js`. Every query is a SELECT; there are no mutation tools.

## How access works

- The MCP endpoint is served at `https://<host>/<MCP_SECRET_PATH>`. Every other path
  (except `/health`) returns 404, so the long random path is the credential.
- Requests are rate limited per client IP (default 60/min, `RATE_LIMIT_PER_MINUTE`).
- The server uses the Supabase **service role key**, which bypasses row-level security.
  Set `SUPABASE_USER_ID` so only your rows are served if anyone else (an accountability
  partner) has an account in the same project.
- This is the pragmatic single-user setup. `src/auth.ts` isolates the auth strategy: to
  move to OAuth, swap the no-op middleware for the SDK's `requireBearerAuth` plus an
  OAuth provider router. `index.ts` and the tools don't change.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `SUPABASE_URL` | yes | Project URL, e.g. `https://xxxx.supabase.co` (Dashboard → Settings → API) |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Service role key (Settings → API). Server-side only. |
| `MCP_SECRET_PATH` | yes | ≥32 URL-safe chars. The endpoint lives at `/<this>`. |
| `SUPABASE_USER_ID` | recommended | Your `auth.users` id; scopes every query to you. |
| `TIMEZONE` | optional | IANA zone for week boundaries (default `UTC`). Match your phone, e.g. `America/Denver`. |
| `RATE_LIMIT_PER_MINUTE` | optional | Default 60. |
| `PORT` | optional | Railway sets this. Default 3000. |

Generate the secret path:

```sh
openssl rand -hex 32
```

Find your user id: Supabase Dashboard → Authentication → Users, or run
`select id, email from auth.users;` in the SQL editor.

## Run locally

```sh
cd mcp-server
npm install
cp .env.example .env        # fill in the values
npm run build
node --env-file=.env dist/index.js
```

Then:

```sh
curl -s localhost:3000/health
# {"status":"ok","uptime_s":3}
```

### Test with the MCP Inspector

```sh
npx @modelcontextprotocol/inspector
```

In the Inspector UI choose transport **Streamable HTTP**, set the URL to
`http://localhost:3000/<MCP_SECRET_PATH>`, click **Connect**, then **List Tools** and
run any tool from the form.

### Unit tests

```sh
npm test
```

Runs the tool logic and the MCP wiring against an in-memory fake of the supabase-js
query builder (`src/fakeSupabase.ts`). No network or credentials needed.

## Deploy to Railway, step by step

You need four values before you start. Collect them into a scratch text file.

### 1. Gather the values

1. **Secret path.** In a terminal (Git Bash, PowerShell, or macOS Terminal) run either:
   ```sh
   openssl rand -hex 32
   ```
   or, if `openssl` is not installed:
   ```sh
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
   You get 64 hex characters. Save it as `MCP_SECRET_PATH`.
2. **Supabase URL.** It is the same URL the app uses in `src/services/supabase.ts`
   (`https://<project-ref>.supabase.co`). Save it as `SUPABASE_URL`.
3. **Service role key.** Supabase dashboard → your project → **Settings** (gear icon,
   bottom left) → **API Keys**. Use a **secret key** (starts with `sb_secret_`); create one
   if none exists. If your project still shows the **Legacy API keys** tab, the
   `service_role` key there works too. Copy it and save it as
   `SUPABASE_SERVICE_ROLE_KEY`. This key bypasses all row security, so it only ever goes
   into Railway, never into the app.
4. **Your user id.** Supabase dashboard → **Authentication** → **Users** → click your
   account → copy the **UUID** at the top. Save it as `SUPABASE_USER_ID`.
5. **Time zone.** The IANA name for where you train, e.g. `America/Denver`,
   `America/Los_Angeles`, `America/Chicago`, `America/New_York`. Save it as `TIMEZONE`.

### 2. Get the code onto the branch Railway will build

Railway deploys one git branch. The server was added on the branch
`claude/new-session-ktpdoz`. Either merge that branch into `master` on GitHub (open a
pull request and merge it), or in step 3 below tell Railway to deploy that branch
directly. Merging is simpler long term.

### 3. Create the Railway service

1. Go to https://railway.com and sign in with GitHub.
2. Click **New Project** → **Deploy from GitHub repo**. If `niners52/workoutapp` is not
   listed, click **Configure GitHub App**, grant Railway access to that repository, and
   come back.
3. Click the repository. Railway creates a service and immediately starts a build. That
   first build **fails**, because it tries to build the Expo app at the repository root.
   That is expected; fix it next.
4. Click the service card to open it. Open the **Settings** tab.
5. Under **Source**:
   - **Root Directory**: type `mcp-server` and click the check mark to save.
   - **Branch**: make sure it is `master` (or `claude/new-session-ktpdoz` if you did not
     merge).
6. Railway has deprecated its config-as-code file, so `railway.json` may be ignored on
   new services. Set the same three things in the UI, further down the Settings page:
   - **Build** → **Custom Build Command**: `npm run build` (Nixpacks already runs `npm ci`; running it again fails on the mounted cache)
   - **Deploy** → **Custom Start Command**: `npm start`
   - **Deploy** → **Healthcheck Path**: `/health`
7. Still in Settings, under **Networking** → **Public Networking**, click
   **Generate Domain**. Railway guesses a port (often `8081`); click the domain's edit
   control, set **Target port** to `3000`, and click **Update**. You get a URL like
   `https://workoutapp-production-xxxx.up.railway.app`. Save it.

### 4. Add the environment variables

1. Open the **Variables** tab of the service.
2. Click **Raw Editor** (top right of the variables list) and paste, with your values:
   ```
   SUPABASE_URL=https://xxxxxxxx.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=sb_secret_...
   MCP_SECRET_PATH=<64 hex characters from step 1>
   SUPABASE_USER_ID=<your uuid>
   TIMEZONE=America/Denver
   PORT=3000
   ```
3. Click **Update Variables**. Railway redeploys automatically.

### 5. Confirm it is running

1. Open the **Deployments** tab and wait for the newest deployment to show **Active**.
   If it shows **Failed**, click it and read **Build Logs** (a missing root directory is
   the usual cause) or **Deploy Logs**. A healthy start prints
   `workoutapp MCP server listening on :3000`.
2. In a browser open `https://<your-domain>/health`. You should see
   `{"status":"ok","uptime_s":…}`.
3. Open `https://<your-domain>/`. You should see `{"error":"not found"}`. That is
   correct: only the secret path is served.

### 6. Add it to claude.ai

Custom connectors need a Pro, Max, Team, or Enterprise plan.

1. In claude.ai click your initials (bottom left) → **Settings** → **Connectors**.
2. Scroll to the bottom and click **Add custom connector**.
3. **Name**: `Workouts` (anything you like).
4. **Remote MCP server URL**: your Railway domain followed by a slash and the secret
   path, no trailing slash:
   `https://workoutapp-production-xxxx.up.railway.app/9f2c…e41a`
5. Leave the OAuth client ID and secret fields empty. Click **Add**.
6. Start a new chat, click the **+** (or tools) button in the message box, and switch
   **Workouts** on. Ask something like "What did I train this week?" Approve the tool
   call when prompted.

Treat that URL like a password. To rotate it, change `MCP_SECRET_PATH` in Railway's
Variables tab and edit the connector URL in claude.ai.

### If something goes wrong

| Symptom | Likely cause |
| --- | --- |
| Build fails on the first deploy | Root Directory not set to `mcp-server` yet |
| Deploy logs say `Missing required environment variable` | A variable name is misspelled or empty |
| `/health` gives a Railway 502 page | `PORT` variable missing or domain pointed at a different port |
| claude.ai says it cannot connect | URL missing the secret path, has a trailing slash, or the secret differs from the variable |
| Tools answer `Database query failed` | Wrong `SUPABASE_URL` or key; check Deploy Logs for the exact message |
| Tools work but show no workouts | `SUPABASE_USER_ID` is not your UUID |

## Tools

All tools are annotated read-only and return compact JSON with ISO-8601 timestamps.
Weights are in pounds, as stored by the app.

| Tool | Arguments | Returns |
| --- | --- | --- |
| `get_recent_workouts` | `limit` 1-50 (10) | Sessions newest first: start/end, `duration_min`, gym, deload flag, per-exercise set count and top set |
| `get_exercise_history` | `exercise_name`, `limit` 1-200 (30) | Fuzzy-resolved exercise, recent sets, all-time heaviest set, best Epley e1RM (with the app's Brzycki value), other candidate names |
| `search_exercises` | `query`, `limit` 1-25 (10) | Ranked canonical names with muscle groups, favorite flag, `last_logged_at`. Pass a result's `name` to other tools. |
| `get_weekly_volume` | `weeks_back` 1-26 (4) | Sets per muscle group per week plus the six-category roll-up and weekly targets |
| `get_prs` | `limit` 1-300 (100) | Per exercise: heaviest set and best Epley e1RM, sorted by e1RM |
| `get_body_weight_log` | `limit` 1-365 (30) | Body weight entries (lbs) with body-fat % and source, newest first |
| `get_favorite_exercises` | none | Exercises starred in the app |

Example calls (as the model would issue them):

```json
{ "name": "search_exercises", "arguments": { "query": "leg press pf" } }
{ "name": "get_exercise_history", "arguments": { "exercise_name": "Machine Leg press machine pf", "limit": 20 } }
{ "name": "get_weekly_volume", "arguments": { "weeks_back": 6 } }
{ "name": "get_recent_workouts", "arguments": { "limit": 5 } }
{ "name": "get_prs", "arguments": {} }
{ "name": "get_body_weight_log", "arguments": { "limit": 60 } }
```

### Weekly volume rules

`get_weekly_volume` reproduces the app's Weekly Volume panel
(`src/services/analytics.ts` → `calculateVolumeForDateRange`):

- Only **primary** muscle groups earn credit; each primary group on an exercise gets a full
  set. Secondary groups are returned on the exercise but never counted.
- Unilateral exercises count 0.5 per set.
- Sets from deload workouts are excluded (reported as `skipped_deload_sets`).
- Sets are bucketed by `logged_at` in `TIMEZONE`, using `week_start_day` from your settings
  (Sunday if unset). The current week is always included.
- `total_sets` / `target_sets` sum only muscle groups with a target, as the app does.

### Estimated 1RM

`best_e1rm_epley` uses Epley, `weight × (1 + reps/30)`. The app's own PR screen uses
Brzycki (`weight × 36 / (37 − reps)`), so that value is included as
`e1rm_brzycki_app_lbs` for cross-checking.

## Schema this server reads

Discovered from `src/services/syncService.ts` and `supabase/migrations/`:

| Table | Columns used |
| --- | --- |
| `exercises` | `id, user_id, name, base_name, primary_muscle_groups[], secondary_muscle_groups[], equipment, is_favorite, is_unilateral?` |
| `workouts` | `id, user_id, started_at, completed_at, location_id, is_deload` |
| `workout_sets` | `id, user_id, workout_id, exercise_id, weight, reps, logged_at` |
| `body_measurements` | `id, user_id, date, weight, body_fat_percentage, source` (rows with `weight` null are girth measurements and are skipped) |
| `user_settings` | `user_id, week_start_day, units, muscle_group_targets` |
| `workout_locations` | `id, user_id, name` |

`is_unilateral` is optional in the schema; it is read when present.
