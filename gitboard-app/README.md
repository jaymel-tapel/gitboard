# GitBoard App

A complete, standalone GitBoard web application with full AI integration. This is a fully ported version of the monorepo `packages/web` - copy to any project and run.

## What's Included

This standalone app includes all features from the original monorepo:

- **Kanban Board** - Drag-and-drop tickets across Todo, Doing, Blocked, Done columns
- **AI-Powered Ticket Generation** - Generate descriptions, implementation steps, and acceptance criteria using Claude CLI
- **Interactive AI Terminal** - Execute AI agents on tickets with real-time PTY terminal output
- **AI Agents** - Create and manage AI agents with customizable system prompts (CLI or API-based)
- **Team Management** - Human team members and AI agents
- **Docs Pages** - Markdown documentation with folder organization
- **Auto Git Commits** - All changes committed automatically

## Structure

```
gitboard-app/
├── setup-gitboard.sh    # Setup script (creates gitboard/ data folder)
├── server.cjs           # Custom server with Socket.IO + PTY support
├── package.json         # Dependencies
├── lib/                 # Core library (schemas, fs, git, ai)
├── src/                 # Next.js application
│   ├── app/             # Pages and API routes
│   └── components/      # React components
└── README.md
```

## Quick Start

### 1. Copy to Your Project

```bash
cp -r gitboard-app /path/to/your/project/
cd /path/to/your/project/gitboard-app
```

### 2. Run Setup Script

```bash
./setup-gitboard.sh
```

This creates the `gitboard/` data folder in your project root with:
- Ticket directories (todo, doing, blocked, done)
- Config files (config.json, team.json)
- Your custom ticket prefix (e.g., APP-0001)

### 3. Install Dependencies

```bash
npm install
```

### 4. Start the Web UI

```bash
npm run dev
```

Open **http://localhost:3456**

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server with Socket.IO (recommended) |
| `npm run dev:next` | Start plain Next.js dev server |
| `npm run build` | Build for production |
| `npm start` | Start production server |

## Features

### Ticket Management
- Create tickets with AI-generated content (description, steps, criteria)
- Edit tickets with implementation steps and acceptance criteria checklists
- Assign tickets to team members or AI agents
- Drag-and-drop between columns
- Priority levels and tags

### AI Integration
- **Generate Ticket Content** - Click "Generate with AI" when creating tickets
- **Execute AI on Tickets** - Click the AI button on any ticket to open an interactive terminal
- **AI Agents** - Create custom agents with system prompts (generate prompts with AI)
- **Multiple Execution Modes** - CLI-based (local Claude) or API-based

### Team Management
- Add human team members
- Add AI agent team members
- Assign tickets via dropdown with grouped options

### Docs
- Create and organize documentation
- Folder-based organization
- Markdown support with preview

## Setup Script Options

```bash
./setup-gitboard.sh                    # Interactive
./setup-gitboard.sh -n                 # Non-interactive (defaults)
./setup-gitboard.sh --project-code APP # Custom ticket prefix
./setup-gitboard.sh --dry-run          # Preview only
./setup-gitboard.sh --help             # All options
```

## Directory Structure After Setup

```
your-project/
├── your-code/           # Your existing code
├── gitboard/            # Data folder (created by setup)
│   ├── tickets/
│   │   ├── todo/
│   │   ├── doing/
│   │   ├── blocked/
│   │   └── done/
│   ├── docs/
│   ├── agents/          # AI agent configurations
│   ├── config.json
│   └── team.json
└── gitboard-app/        # This folder (web UI)
```

## Requirements

- Node.js 18+
- Git (for auto-commits)
- Claude CLI (optional, for AI features)

## Tech Stack

- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS
- Socket.IO (real-time communication)
- node-pty (terminal emulation)
- xterm.js (terminal UI)
- Zod (validation)
- simple-git

## Troubleshooting

### Port already in use

```bash
PORT=3000 npm run dev
```

### Can't find gitboard/ folder

Run the setup script first:
```bash
./setup-gitboard.sh
```

### AI features not working

Make sure Claude CLI is installed:
```bash
which claude
```

If not installed, visit: https://docs.anthropic.com/claude-code

---

Ported from `packages/web` monorepo - all features included.
