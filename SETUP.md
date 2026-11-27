# Getting started

## 1. Repo
- Create an empty GitHub repo, `cairn`, and clone it
- Unzip this kit into it, then commit and push

## 2. Accounts and keys
- Supabase: new project. Copy the Project URL, anon key and service role key
- Supabase Auth: turn on Email (magic link). Add `http://localhost:3000` and your Vercel URL to the redirect URLs
- Anthropic: your API key
- Create `.env.local` (never commit it):
  ```
  NEXT_PUBLIC_SUPABASE_URL=...
  NEXT_PUBLIC_SUPABASE_ANON_KEY=...
  SUPABASE_SERVICE_ROLE_KEY=...
  ANTHROPIC_API_KEY=...
  ADMIN_EMAIL=you@example.com
  ```

## 3. Claude Code
Open the repo folder in Claude Code and paste this as your first message:

> This app is called Cairn. Read CLAUDE.md, then look at prototype/index.html and the data/ folder. Build Phase 1. Start by proposing the Supabase schema (SQL migration with RLS) and the seed plan, and wait for my OK. Then scaffold the Next.js app, wire up Supabase auth, port the prototype UI and rules, add the /api/chat coach with tools, and import data/history.json for my user (ADMIN_EMAIL). Run it locally and tell me what to test.

## 4. Deploy
- Import the repo in Vercel and add the same env vars
- Add the Vercel URL to Supabase Auth redirect URLs
- On your phone: open the URL, Share > Add to Home Screen

## 5. Later
- Phase 2 (editing + chat-driven changes): ask Claude Code to "Build Phase 2 from CLAUDE.md"
- For chat-requested code changes, install the Claude Code GitHub Action on the repo (Claude Code can walk you through `/install-github-app`)
- Phase 3: Garmin export, then Garmin Connect sync
