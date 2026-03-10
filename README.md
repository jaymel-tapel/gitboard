# GitBoard

**Git-native project management for AI-assisted development.**

Your tickets, docs, and project state live in git - not in an external database.

## Why GitBoard?

Traditional PM tools (Jira, Linear, Asana) have a fundamental problem: **they're disconnected from your code**.

- Jira says the ticket is "In Progress"
- Git shows the PR was merged 3 days ago
- Reality: Nobody updated Jira

**GitBoard solves this** by making git the single source of truth. AI agents (like Claude Code) can read and update tickets directly, keeping project state in sync with code reality.

## Features

- **Git-native** - All project state lives in `.gitboard/data/`
- **Local-first** - Works offline, no external dependencies
- **AI-native** - Claude Code integration with real-time status updates
- **Kanban board** - Drag-and-drop ticket management
- **Documentation** - Markdown docs with image support
- **MCP integration** - Configure Model Context Protocol servers
- **Team management** - Track team members and AI agents
- **Zero infrastructure** - No servers, no databases to manage

## Installation

### Quick Install (Remote)

Install GitBoard directly from GitHub into your current directory:

```bash
curl -fsSL https://raw.githubusercontent.com/jaymel-tapel/gitboard/main/install.sh | bash
```

Or specify a target directory:

```bash
curl -fsSL https://raw.githubusercontent.com/jaymel-tapel/gitboard/main/install.sh | bash -s -- /path/to/project
```

With custom project name and ticket code:

```bash
curl -fsSL https://raw.githubusercontent.com/jaymel-tapel/gitboard/main/install.sh | bash -s -- --name "My Project" --code "PROJ"
```

### Update Existing Installation

Update GitBoard while preserving your data:

```bash
curl -fsSL https://raw.githubusercontent.com/jaymel-tapel/gitboard/main/install.sh | bash -s -- --update
```

### Local Installation (Development)

If you've cloned the repository:

```bash
cd gitboard/gitboard-app
./scripts/install.sh /path/to/your-project
```

### Installation Options

| Flag | Description |
|------|-------------|
| `--update` | Update app only, preserve existing data |
| `--name "Name"` | Project name (auto-detected from directory if not provided) |
| `--code CODE` | Ticket prefix, e.g., `PROJ` for PROJ-0001 (derived from name if not provided) |
| `--personal` | Add `.gitboard/` to `.gitignore` (not shared with team) |
| `--shared` | Track `.gitboard/` in git (default, shared with team) |

### Examples

```bash
# Install in current directory with defaults
curl -fsSL .../install.sh | bash

# Install with custom settings
curl -fsSL .../install.sh | bash -s -- --name "Acme Corp" --code "ACME" --personal

# Install to specific path
curl -fsSL .../install.sh | bash -s -- /path/to/project --name "My App" --code "APP"

# Update existing installation
curl -fsSL .../install.sh | bash -s -- --update

# Update specific project
curl -fsSL .../install.sh | bash -s -- /path/to/project --update
```

## Quick Start

After installation:

```bash
# Start GitBoard
cd /path/to/your-project/.gitboard/app
node server.cjs

# Open in browser
open http://localhost:4567
```

## Directory Structure

```
your-project/
├── .gitboard/
│   ├── app/                 # GitBoard application (Next.js standalone)
│   │   ├── server.cjs       # Server entry point
│   │   └── .next/           # Built Next.js app
│   ├── data/                # Your project data (tracked in git)
│   │   ├── boards/          # Kanban boards
│   │   │   └── default/
│   │   │       ├── board.json
│   │   │       ├── tickets/
│   │   │       │   ├── todo/
│   │   │       │   ├── doing/
│   │   │       │   └── done/
│   │   │       └── archive/
│   │   ├── docs/            # Documentation pages
│   │   ├── agents/          # AI agent configurations
│   │   ├── artifacts/       # Ticket artifacts (files, images)
│   │   ├── ticketchat/      # AI chat history per ticket
│   │   ├── mcp/             # MCP server configurations
│   │   ├── uploads/         # Uploaded files
│   │   ├── config.json      # Project configuration
│   │   └── team.json        # Team members
│   └── README.md
├── .claude/                 # Claude Code hooks (auto-configured)
│   ├── settings.json
│   └── hooks/
└── your-code/
```

## Web UI

GitBoard provides a full web interface at `http://localhost:4567`:

| Page | Description |
|------|-------------|
| `/board` | Kanban board with drag-and-drop |
| `/docs` | Documentation wiki |
| `/agents` | AI agent configurations |
| `/team` | Team member management |
| `/mcp` | MCP server configuration |
| `/skills` | Claude Code skills |

## Claude Code Integration

GitBoard automatically sets up Claude Code hooks during installation. When you launch Claude Code from a ticket, it:

1. Sets environment variables (`GITBOARD_TICKET_ID`, `GITBOARD_SERVER_URL`)
2. Sends real-time status updates (running, waiting, paused, error)
3. Shows Claude's activity in the ticket view

### Launching Claude Code

From any ticket in the UI, click "Launch Agent" to start a Claude Code session with full ticket context.

## Tickets

Tickets are JSON files organized by status:

```json
{
  "id": "PROJ-0001",
  "title": "Add authentication",
  "description": "Implement JWT-based auth",
  "owner": "alice",
  "priority": "high",
  "status": "doing",
  "tags": ["backend", "security"],
  "acceptance_criteria": [
    "User can login with email/password",
    "JWT tokens are generated"
  ],
  "metadata": {
    "created_at": "2026-01-14T10:00:00Z",
    "updated_at": "2026-01-14T15:30:00Z"
  }
}
```

Moving a ticket = moving the file:
```bash
# Status change via git
mv .gitboard/data/boards/default/tickets/todo/PROJ-0001.json \
   .gitboard/data/boards/default/tickets/doing/
git commit -m "[gitboard] Move PROJ-0001 to doing"
```

## Configuration

### config.json

```json
{
  "version": "1.0",
  "project": {
    "name": "My Project",
    "description": "Project description"
  },
  "settings": {
    "auto_commit": true,
    "commit_prefix": "[gitboard]",
    "ticket_prefix": "PROJ"
  },
  "statuses": [
    { "id": "todo", "name": "Todo", "order": 0, "color": "gray" },
    { "id": "doing", "name": "In Progress", "order": 1, "color": "blue" },
    { "id": "done", "name": "Done", "order": 2, "color": "green" }
  ],
  "ai": {
    "enabled": true,
    "provider": "anthropic",
    "model": "claude-sonnet-4-20250514"
  }
}
```

### Custom Statuses

Add custom columns by editing `config.json`:

```json
"statuses": [
  { "id": "backlog", "name": "Backlog", "order": 0, "color": "gray" },
  { "id": "todo", "name": "Todo", "order": 1, "color": "gray" },
  { "id": "doing", "name": "In Progress", "order": 2, "color": "blue" },
  { "id": "review", "name": "Code Review", "order": 3, "color": "yellow" },
  { "id": "done", "name": "Done", "order": 4, "color": "green" }
]
```

## Shared vs Personal Mode

- **Shared (default)**: `.gitboard/data/` is tracked in git, visible to team
- **Personal**: Add `.gitboard/` to `.gitignore` for private use

Switch modes:
```bash
# Make personal (add to .gitignore)
echo ".gitboard/" >> .gitignore

# Make shared (remove from .gitignore)
sed -i '' '/^\.gitboard\/$/d' .gitignore
```

## Comparison

| Feature | GitBoard | Jira | Linear | GitHub Projects |
|---------|----------|------|--------|-----------------|
| Git-native | Yes | No | No | Linked |
| Local-first | Yes | No | No | No |
| Works offline | Yes | No | No | No |
| Own your data | Yes | No | No | No |
| AI-native | Yes | Plugin | Plugin | No |
| Zero infrastructure | Yes | No | No | No |

## Use Cases

### Great For

- Developer-led teams
- AI-assisted development with Claude Code
- Open source projects
- Teams that live in git
- Privacy-conscious teams

### Not Ideal For

- Non-technical stakeholders
- Large enterprises needing audit trails
- Teams requiring real-time collaboration

## Roadmap

### In Progress

| Feature | Description |
|---------|-------------|
| **Ticket Comments** | Threaded discussions on tickets, synced via git |
| **Background Execution** | Run AI agents in background with progress tracking |
| **Team Chat** | Real-time team communication per board/ticket |

### Planned

| Feature | Description |
|---------|-------------|
| **GitHub/GitLab Sync** | Two-way sync with GitHub Issues and GitLab Issues |
| **PR Integration** | Auto-link tickets to pull requests, update status on merge |
| **Notifications** | Desktop/browser notifications for ticket updates |
| **Time Tracking** | Track time spent on tickets with start/stop timer |
| **Search & Filtering** | Full-text search across tickets, docs, and chat |
| **Ticket Templates** | Predefined templates for bugs, features, tasks |
| **Custom Fields** | User-defined fields per ticket type |
| **Automations** | Rule-based actions (e.g., auto-assign, auto-move) |
| **Webhooks** | HTTP callbacks for external integrations |
| **Reports & Analytics** | Velocity charts, burndown, cycle time metrics |

### Future

| Feature | Description |
|---------|-------------|
| **Mobile App** | iOS/Android companion app |
| **Multi-Project Dashboard** | Unified view across multiple GitBoard projects |
| **Offline Sync** | Conflict resolution for offline changes |
| **Plugin System** | Extensible architecture for custom integrations |
| **Voice Notes** | Audio attachments on tickets |
| **AI Summaries** | Auto-generated ticket and sprint summaries |
| **Calendar View** | Due date visualization and scheduling |
| **Dependency Tracking** | Ticket blocking/blocked-by relationships |
| **Recurring Tickets** | Auto-create tickets on schedule |
| **Guest Access** | Share read-only views without git access |

### Contributing

We welcome contributions! Check the issues for `good first issue` labels or propose new features.

## Development

```bash
# Clone repo
git clone https://github.com/jaymel-tapel/gitboard.git
cd gitboard/gitboard-app

# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm run build
```

## License

MIT

---

**Questions?** Open an issue at [github.com/jaymel-tapel/gitboard](https://github.com/jaymel-tapel/gitboard)
