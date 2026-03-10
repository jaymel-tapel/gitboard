#!/usr/bin/env node
/**
 * GitBoard Data Initialization Script
 *
 * Creates the default data structure for a new GitBoard installation.
 *
 * Usage: node scripts/init-data.js /path/to/.gitboard/data
 */

const fs = require('fs');
const path = require('path');

// Get arguments
const targetDir = process.argv[2];
const projectName = process.argv[3] || 'My Project';
const ticketPrefix = process.argv[4] || 'TASK';

if (!targetDir) {
    console.error('Error: Target directory is required');
    console.error('Usage: node init-data.js /path/to/.gitboard/data [project-name] [ticket-prefix]');
    process.exit(1);
}

// Resolve to absolute path
const dataDir = path.resolve(targetDir);

console.log(`Initializing GitBoard data at: ${dataDir}`);
console.log(`  Project: ${projectName}`);
console.log(`  Ticket prefix: ${ticketPrefix}`);

// Default configuration
const defaultConfig = {
    version: "1.0",
    project: {
        name: projectName,
        description: "Project managed with GitBoard"
    },
    settings: {
        auto_commit: true,
        commit_prefix: "[gitboard]",
        ticket_prefix: ticketPrefix,
        next_ticket_id: 1,
        next_initiative_id: 1
    },
    statuses: [
        { id: "todo", name: "Todo", order: 0, color: "gray" },
        { id: "doing", name: "In Progress", order: 1, color: "blue" },
        { id: "done", name: "Done", order: 2, color: "green" }
    ],
    ai: {
        enabled: true,
        provider: "anthropic",
        model: "claude-sonnet-4-20250514"
    }
};

// Default team structure
const defaultTeam = {
    team: [],
    roles: {
        definitions: [
            {
                title: "Developer",
                levels: ["junior", "mid", "senior", "staff", "principal"],
                default_areas: ["backend", "frontend", "fullstack"]
            },
            {
                title: "AI Development Assistant",
                levels: ["assistant"],
                default_areas: ["code-generation", "documentation", "architecture"]
            }
        ]
    }
};

// Default board
const defaultBoard = {
    id: "default",
    name: `${projectName} Board`,
    ticket_prefix: ticketPrefix,
    next_ticket_id: 1,
    statuses: [
        { id: "todo", name: "Todo", order: 0, color: "gray", autoExecute: false },
        { id: "doing", name: "In Progress", order: 1, color: "blue", autoExecute: false },
        { id: "review", name: "Review", order: 2, color: "yellow", autoExecute: false },
        { id: "done", name: "Done", order: 3, color: "green", autoExecute: false }
    ],
    created_at: new Date().toISOString(),
    pinned: true
};

// Default Claude Code agent
const defaultAgent = {
    id: "claude-code",
    name: "Claude Code",
    description: "General-purpose AI development assistant powered by Claude",
    systemPrompt: "You are an AI development assistant helping with coding tasks. Focus on writing clean, maintainable code and following best practices.",
    enabled: true
};

// Locks file
const defaultLocks = { locks: {} };

// Create directory structure
const directories = [
    '',
    'boards',
    'boards/default',
    'boards/default/tickets',
    'boards/default/tickets/todo',
    'boards/default/tickets/doing',
    'boards/default/tickets/review',
    'boards/default/tickets/done',
    'agents',
    'docs',
    'artifacts',
    'ticketchat',
    'uploads',
    'mcp',
    'initiatives',
    'reports',
    '.metadata'
];

// Create directories
for (const dir of directories) {
    const fullPath = path.join(dataDir, dir);
    if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
        console.log(`  Created: ${dir || '/'}`);
    }
}

// Default next IDs for ticket generation
const defaultNextIds = { next_ticket_id: 1, next_initiative_id: 1 };

// Create files
const files = [
    { path: 'config.json', content: defaultConfig },
    { path: 'team.json', content: defaultTeam },
    { path: 'boards/default/board.json', content: defaultBoard },
    { path: 'agents/claude-code.json', content: defaultAgent },
    { path: '.locks.json', content: defaultLocks },
    { path: '.metadata/next-ids.json', content: defaultNextIds }
];

for (const file of files) {
    const fullPath = path.join(dataDir, file.path);
    if (!fs.existsSync(fullPath)) {
        fs.writeFileSync(fullPath, JSON.stringify(file.content, null, 2));
        console.log(`  Created: ${file.path}`);
    } else {
        console.log(`  Skipped: ${file.path} (already exists)`);
    }
}

// Create a welcome doc
const welcomeDoc = `# Welcome to GitBoard

GitBoard is a git-native project management system designed for AI-assisted teams.

## Getting Started

1. **Create a ticket**: Go to the Board page and click "New Ticket"
2. **Configure agents**: Go to Agents page to set up AI assistants
3. **Add team members**: Go to Team page to manage your team

## Key Concepts

- **Boards**: Kanban-style boards for organizing work
- **Tickets**: Tasks that live as JSON files in your git repository
- **Agents**: AI assistants that can help with development tasks
- **Docs**: Documentation pages stored alongside your code

## Learn More

Visit the GitBoard documentation for more information.
`;

const welcomeDocPath = path.join(dataDir, 'docs', 'welcome.md');
if (!fs.existsSync(welcomeDocPath)) {
    fs.writeFileSync(welcomeDocPath, welcomeDoc);
    console.log('  Created: docs/welcome.md');
}

console.log('');
console.log('Data initialization complete!');
