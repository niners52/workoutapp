# workoutapp

Expo / React Native (TypeScript, strict) workout tracker with a Supabase backend
and Apple HealthKit integration. App code lives in `src/` (screens, components,
services, contexts, navigation); `@/*` maps to `src/*`. Database changes are SQL
files in `supabase/migrations/`. Native config is in `app.json`, `eas.json`, and
`plugins/`; the `ios/` and `android/` folders are generated and not committed.

- Type-check with `npx tsc --noEmit` after changes. There is no test suite or linter
  configured, so this is the check to run before committing.
- Commits use a `feat:` / `fix:` prefix followed by a short imperative summary.
- ⛔ EAS builds and App Store submits (`eas build`, `eas submit`) ship to real users
  and are not run from a session without being asked.

## Writing instructions for this session
- Say each rule once, plainly, with the reason beside it. No CRITICAL/NEVER/ALWAYS
  banners; a rule that needs shouting to be followed needs a check, not volume.
- Mark ⛔ only on actions this session must not take alone: external send, production
  write, deploy, shared config change, money reaching a customer.
- Rules and state live in different files. This file holds rules; today's state
  (what's live, pending restarts, open items) goes in a dated STATE file it points to.
- Prefer describing the outcome and how to verify it over step-by-step scripts,
  except where exactly one sequence is safe (deploys, auth, destructive commands).
- Numeric caps ("under 3 sentences", "at most 5 bullets") become qualitative
  ("answer only what was asked"); the number was tuned against an older model.
- Tool routing belongs in the tool's own description, not in this file.
- For API code: structured outputs / strict tools instead of JSON-only prompts and
  parse-retry loops; adaptive thinking + effort instead of budget_tokens; never force
  tool_choice on a Fable-family model (400).
