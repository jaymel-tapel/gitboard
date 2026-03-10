---
name: Copy Environment Files
description: Copies .env files from the main repository to the current git worktree
license: MIT
version: 1.0.0
compatibility:
  agents:
    - claude-code
  providers:
    - anthropic
metadata:
  created_at: 2026-03-10T06:16:14.304Z
  updated_at: 2026-03-10T06:16:14.304Z
  created_by: GitBoard User
  updated_by: GitBoard User
---

# Copy Environment Files Skill

This skill copies .env files from the main repository to the current git worktree.

## When to Use

Invoke this skill when the user runs `/copy-env` or `/sync-env`, or asks to copy/sync environment files to a worktree.

## Usage

- `/copy-env` - Copy env files for all apps that have them
- `/copy-env mobile` - Copy env files only for the mobile app
- `/copy-env api` - Copy env files only for the api app

## Instructions

### Step 1: Detect Worktree Context

First, determine if you're in a worktree by checking if `.git` is a file (not a directory). Read the `.git` file to find the path to the main repository.

Run: `cat .git` in the current directory

If it contains `gitdir: /path/to/.worktrees/BRANCH/.git`, you're in a worktree.

### Step 2: Calculate Paths

From the worktree, calculate:
- **Current worktree path**: The directory containing the `.git` file (e.g., `/Users/jaymel/Desktop/btw-monorepo/.worktrees/BTW-0070`)
- **Main repo path**: Go up from `.worktrees` directory (e.g., `/Users/jaymel/Desktop/btw-monorepo`)

### Step 3: Find and Copy .env Files

If an app name is provided (e.g., `mobile`, `api`, `web`, `gitboard-app`):
1. Look for .env files in `[main-repo]/apps/[app-name]/`
2. Copy them to `[worktree]/apps/[app-name]/`

If no app name is provided, iterate through all apps directories.

### Step 4: File Selection Rules

**Include these patterns:**
- `.env`
- `.env.development`
- `.env.production`
- `.env.local`
- `.env.staging`
- Any `.env.*` file

**Exclude these patterns:**
- `.env.example`
- `.env.*.example`
- `.env.sample`
- `.env.template`

### Step 5: Execute the Copy

Use bash commands to copy the files. Example:

```bash
# For a specific app
cp /Users/jaymel/Desktop/btw-monorepo/apps/mobile/.env* /Users/jaymel/Desktop/btw-monorepo/.worktrees/BTW-0070/apps/mobile/ 2>/dev/null

# Then remove any .example files that got copied
rm -f /Users/jaymel/Desktop/btw-monorepo/.worktrees/BTW-0070/apps/mobile/.env.example 2>/dev/null
rm -f /Users/jaymel/Desktop/btw-monorepo/.worktrees/BTW-0070/apps/mobile/.env.*.example 2>/dev/null
```

### Step 6: Report Results

After copying, report:
- Which files were copied and to where
- If no .env files were found in a source directory, warn the user
- If not in a worktree, inform the user this skill only works in worktrees

## Example Output

```
Copied environment files from main repo to worktree:

apps/api:
  - .env.development
  - .env.production

apps/mobile:
  - .env
  - .env.development
  - .env.production

apps/web:
  - .env

apps/gitboard-app:
  - .env

Skipped: .env.example files (tracked in git)
```

## Error Handling

- If not in a worktree: "This command only works inside a git worktree. You appear to be in the main repository."
- If app not found: "App '[name]' not found. Available apps: api, gitboard-app, mobile, web, website"
- If no env files found: "No .env files found in [main-repo]/apps/[app-name]/"