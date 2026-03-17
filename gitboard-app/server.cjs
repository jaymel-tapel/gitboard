const { createServer } = require('http');
const { parse } = require('url');
const { Server } = require('socket.io');
const pty = require('@homebridge/node-pty-prebuilt-multiarch');
const path = require('path');
const fs = require('fs');
const { execSync, exec } = require('child_process');

// Load .env file manually (before any env vars are used)
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
        const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
        if (match && !line.startsWith('#') && !process.env[match[1]]) {
            process.env[match[1]] = (match[2] || '').replace(/^['"]|['"]$/g, '');
        }
    });
    console.log('✅ Loaded .env file');
}

// Node v24 compatibility: Patch console.error to safely handle error objects
// Node v24's util.inspect crashes on certain error objects with undefined property descriptors
const originalConsoleError = console.error;
console.error = (...args) => {
    const safeArgs = args.map(arg => {
        if (arg instanceof Error) {
            return `${arg.name}: ${arg.message}\n${arg.stack || ''}`;
        }
        if (typeof arg === 'object' && arg !== null) {
            try {
                // Test if it can be inspected
                JSON.stringify(arg);
                return arg;
            } catch {
                return String(arg);
            }
        }
        return arg;
    });
    originalConsoleError.apply(console, safeArgs);
};

console.log('node-pty module:', Object.keys(pty));

// MIME types for static file serving
const MIME_TYPES = {
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.eot': 'application/vnd.ms-fontobject',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.ico': 'image/x-icon',
    '.json': 'application/json',
    '.map': 'application/json',
};

// Detect if running in standalone mode (.gitboard/app/ structure)
const isStandaloneMode = (() => {
    const cwd = process.cwd();
    const parentDir = path.dirname(cwd);
    const parentName = path.basename(parentDir);
    const cwdName = path.basename(cwd);

    // Check if we're in .gitboard/app/
    return cwdName === 'app' && parentName === '.gitboard';
})();

console.log(`🔧 Server mode: ${isStandaloneMode ? 'STANDALONE' : 'DEVELOPMENT'}`);

// Git helper functions for worktree management
const gitHelpers = {
    /**
     * Check if a branch exists
     */
    branchExists(repoPath, branchName) {
        try {
            execSync(`git branch --list ${branchName}`, { cwd: repoPath, encoding: 'utf-8' });
            const result = execSync(`git branch --list ${branchName}`, { cwd: repoPath, encoding: 'utf-8' });
            return result.trim().length > 0;
        } catch {
            return false;
        }
    },

    /**
     * Create a new branch from a base branch
     */
    createBranch(repoPath, branchName, baseBranch) {
        try {
            execSync(`git branch ${branchName} ${baseBranch}`, { cwd: repoPath, encoding: 'utf-8' });
            console.log(`✅ Created branch ${branchName} from ${baseBranch}`);
            return true;
        } catch (err) {
            console.error(`❌ Failed to create branch ${branchName}:`, err.message);
            return false;
        }
    },

    /**
     * Get worktree path for a ticket
     */
    getWorktreePath(repoPath, ticketId) {
        return path.join(repoPath, '.worktrees', ticketId);
    },

    /**
     * Check if a worktree exists at the given path
     */
    worktreeExists(repoPath, worktreePath) {
        try {
            if (!fs.existsSync(worktreePath)) {
                return false;
            }
            // Verify it's actually a git worktree
            const result = execSync('git worktree list --porcelain', { cwd: repoPath, encoding: 'utf-8' });
            return result.includes(`worktree ${worktreePath}`);
        } catch {
            return false;
        }
    },

    /**
     * Prune stale worktree references (needed when worktree folder was manually deleted)
     */
    pruneWorktrees(repoPath) {
        try {
            execSync('git worktree prune', { cwd: repoPath, encoding: 'utf-8' });
            console.log('🧹 Pruned stale worktree references');
        } catch (err) {
            console.warn('⚠️ Failed to prune worktrees:', err.message);
        }
    },

    /**
     * Create a worktree for a branch
     */
    createWorktree(repoPath, branchName, worktreePath) {
        try {
            // Prune stale worktree references first (handles manually deleted worktrees)
            this.pruneWorktrees(repoPath);

            // Ensure parent directory exists
            const parentDir = path.dirname(worktreePath);
            if (!fs.existsSync(parentDir)) {
                fs.mkdirSync(parentDir, { recursive: true });
            }

            execSync(`git worktree add ${worktreePath} ${branchName}`, { cwd: repoPath, encoding: 'utf-8' });
            console.log(`✅ Created worktree at ${worktreePath} for branch ${branchName}`);
            return true;
        } catch (err) {
            console.error(`❌ Failed to create worktree:`, err.message);
            return false;
        }
    },

    /**
     * Ensure .worktrees directory exists
     */
    ensureWorktreesDirectory(repoPath) {
        const worktreesDir = path.join(repoPath, '.worktrees');
        if (!fs.existsSync(worktreesDir)) {
            fs.mkdirSync(worktreesDir, { recursive: true });
            console.log(`📁 Created .worktrees directory`);
        }
    },

    /**
     * Setup worktree for a ticket - handles all three paths
     * Returns { success: boolean, worktreePath: string, error?: string }
     */
    setupWorktreeForTicket(repoPath, ticketId, baseBranch = 'main') {
        const branchName = ticketId;
        const worktreePath = this.getWorktreePath(repoPath, ticketId);

        // Ensure .worktrees directory exists
        this.ensureWorktreesDirectory(repoPath);

        const branchExists = this.branchExists(repoPath, branchName);
        const worktreeExists = this.worktreeExists(repoPath, worktreePath);

        console.log(`🔍 Worktree check for ${ticketId}: branch=${branchExists}, worktree=${worktreeExists}`);

        // Path 1: Both exist - just return the path
        if (branchExists && worktreeExists) {
            console.log(`✅ Branch and worktree exist for ${ticketId}`);
            return { success: true, worktreePath };
        }

        // Path 2: Branch exists but no worktree - create worktree
        if (branchExists && !worktreeExists) {
            console.log(`🔧 Creating worktree for existing branch ${ticketId}`);
            if (this.createWorktree(repoPath, branchName, worktreePath)) {
                return { success: true, worktreePath };
            }
            return { success: false, worktreePath: '', error: `Failed to create worktree for branch ${branchName}` };
        }

        // Path 3: No branch - create branch and worktree
        console.log(`🔧 Creating new branch ${ticketId} from ${baseBranch}`);
        if (!this.createBranch(repoPath, branchName, baseBranch)) {
            return { success: false, worktreePath: '', error: `Failed to create branch ${branchName} from ${baseBranch}` };
        }

        console.log(`🔧 Creating worktree for new branch ${ticketId}`);
        if (this.createWorktree(repoPath, branchName, worktreePath)) {
            return { success: true, worktreePath };
        }
        return { success: false, worktreePath: '', error: `Failed to create worktree for new branch ${branchName}` };
    }
};

// Track active sessions: ticketId -> { socketId, agentId, startTime }
const activeSessions = new Map();

// Track PTY processes: ticketId -> { ptyProcess, buffer }
const ptyProcesses = new Map();

// Track session status: ticketId -> 'running' | 'waiting'
// Updated by Claude Code hooks when permission prompts appear
const sessionStatus = new Map();

// Detect standalone mode: running from .gitboard/app/ structure
function detectStandaloneMode() {
    const cwd = process.cwd();
    const parentDir = path.dirname(cwd);
    const parentName = path.basename(parentDir);
    const cwdName = path.basename(cwd);

    // If current dir is 'app' and parent is '.gitboard', we're in standalone mode
    if (cwdName === 'app' && parentName === '.gitboard') {
        const projectRoot = path.dirname(parentDir);
        const dataPath = path.join(parentDir, 'data');
        return {
            isStandalone: true,
            projectRoot: projectRoot,
            dataPath: dataPath
        };
    }
    return { isStandalone: false };
}

const standaloneInfo = detectStandaloneMode();

// Set up paths based on mode
if (standaloneInfo.isStandalone) {
    console.log(`🚀 Running in standalone mode`);
    console.log(`📁 Project root: ${standaloneInfo.projectRoot}`);
    console.log(`📁 Data path: ${standaloneInfo.dataPath}`);
    process.env.GITBOARD_REPO_PATH = standaloneInfo.projectRoot;
    process.env.GITBOARD_DATA_PATH = standaloneInfo.dataPath;
} else if (!process.env.GITBOARD_REPO_PATH) {
    // Auto-detect GITBOARD_REPO_PATH if not set (development mode)
    console.log(`🔍 Auto-detecting GITBOARD_REPO_PATH from cwd: ${process.cwd()}`);

    // Start from current directory and walk up to find gitboard folder
    let currentDir = process.cwd();
    let found = false;

    // Check current directory first
    const checkDir = (dir) => {
        // Check for development mode: gitboard/ folder
        const gitboardPath = path.join(dir, 'gitboard');
        if (fs.existsSync(gitboardPath) && fs.statSync(gitboardPath).isDirectory()) {
            process.env.GITBOARD_REPO_PATH = dir;
            console.log(`📁 Auto-detected GITBOARD_REPO_PATH: ${dir}`);
            return true;
        }
        // Check for standalone mode: .gitboard/data/ folder
        const standaloneDataPath = path.join(dir, '.gitboard', 'data');
        if (fs.existsSync(standaloneDataPath) && fs.statSync(standaloneDataPath).isDirectory()) {
            process.env.GITBOARD_REPO_PATH = dir;
            process.env.GITBOARD_DATA_PATH = standaloneDataPath;
            console.log(`📁 Auto-detected standalone mode at: ${dir}`);
            return true;
        }
        return false;
    };

    // Check cwd itself
    if (checkDir(currentDir)) {
        found = true;
    } else {
        // Walk up parent directories
        while (currentDir !== '/' && !found) {
            currentDir = path.dirname(currentDir);
            if (checkDir(currentDir)) {
                found = true;
                break;
            }
        }

        // Check root directory as well
        if (!found && currentDir === '/') {
            if (checkDir('/')) {
                found = true;
            }
        }
    }

    // Fallback: check relative to __dirname (server.cjs location)
    if (!found) {
        console.log(`🔍 Checking __dirname fallback: ${__dirname}`);
        if (checkDir(__dirname)) {
            found = true;
        } else if (checkDir(path.dirname(__dirname))) {
            found = true;
        }
    }

    if (!found) {
        console.warn('⚠️  Could not auto-detect GITBOARD_REPO_PATH. Set it manually if needed.');
    }
}

// Detect standalone data path (same logic as file-system.ts)
const detectStandaloneDataPath = () => {
    // Check if GITBOARD_DATA_PATH is explicitly set
    if (process.env.GITBOARD_DATA_PATH) {
        return process.env.GITBOARD_DATA_PATH;
    }

    // Check if we're in .gitboard/app/ structure
    const cwd = process.cwd();
    const parentDir = path.dirname(cwd);
    const parentName = path.basename(parentDir);
    const cwdName = path.basename(cwd);

    // Standalone mode: running from .gitboard/app/ (or gitboard-app within .gitboard)
    if (parentName === '.gitboard' && (cwdName === 'app' || cwdName === 'gitboard-app')) {
        const dataPath = path.join(parentDir, 'data');
        if (fs.existsSync(dataPath)) {
            return dataPath;
        }
    }

    // Also check parent's parent for nested structures
    const grandparentDir = path.dirname(parentDir);
    const grandparentName = path.basename(grandparentDir);
    if (grandparentName === '.gitboard') {
        const dataPath = path.join(grandparentDir, 'data');
        if (fs.existsSync(dataPath)) {
            return dataPath;
        }
    }

    return null;
};

// Determine the data directory path
const getDataDir = () => {
    // First check for standalone mode
    const standaloneDataPath = detectStandaloneDataPath();
    if (standaloneDataPath) {
        return standaloneDataPath;
    }

    // Fall back to environment variable or default
    if (process.env.GITBOARD_REPO_PATH) {
        return path.join(process.env.GITBOARD_REPO_PATH, 'gitboard');
    }

    return path.join(process.cwd(), 'gitboard');
};

// Startup validation: verify gitboard structure exists
if (process.env.GITBOARD_REPO_PATH) {
    const gitboardDir = getDataDir();
    const boardsDir = path.join(gitboardDir, 'boards');
    const configPath = path.join(gitboardDir, 'config.json');

    console.log(`✅ GITBOARD_REPO_PATH set to: ${process.env.GITBOARD_REPO_PATH}`);
    if (process.env.GITBOARD_DATA_PATH) {
        console.log(`✅ GITBOARD_DATA_PATH set to: ${process.env.GITBOARD_DATA_PATH}`);
    }

    if (fs.existsSync(boardsDir)) {
        try {
            const boards = fs.readdirSync(boardsDir, { withFileTypes: true })
                .filter(d => d.isDirectory())
                .map(d => d.name);
            console.log(`📋 Available boards: ${boards.join(', ')}`);
        } catch (err) {
            console.warn(`⚠️  Failed to read boards directory: ${err.message}`);
        }
    } else {
        console.warn(`⚠️  Boards directory not found at: ${boardsDir}`);
    }

    if (fs.existsSync(configPath)) {
        try {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
            if (config.statuses && Array.isArray(config.statuses)) {
                const statusIds = config.statuses.map(s => s.id);
                console.log(`📊 Config statuses: ${statusIds.join(', ')}`);
            }
        } catch (err) {
            console.warn(`⚠️  Failed to parse config.json: ${err.message}`);
        }
    } else {
        console.warn(`⚠️  config.json not found at: ${configPath}`);
    }
}

const dev = process.env.NODE_ENV !== 'production' && !isStandaloneMode;
const hostname = 'localhost';
const port = parseInt(process.env.PORT || '4567', 10);

// Initialize Next.js differently based on mode
let app, handle;

if (isStandaloneMode) {
    // Standalone mode: use the pre-compiled Next.js server
    // Read the config from required-server-files.json
    let nextConfig = {};
    const requiredServerFilesPath = path.join(__dirname, '.next', 'required-server-files.json');

    if (fs.existsSync(requiredServerFilesPath)) {
        try {
            const requiredServerFiles = JSON.parse(fs.readFileSync(requiredServerFilesPath, 'utf-8'));
            nextConfig = requiredServerFiles.config || {};
            console.log('📄 Loaded Next.js config from required-server-files.json');
        } catch (err) {
            console.warn('⚠️ Failed to parse required-server-files.json:', err.message);
        }
    } else if (process.env.__NEXT_PRIVATE_STANDALONE_CONFIG) {
        nextConfig = JSON.parse(process.env.__NEXT_PRIVATE_STANDALONE_CONFIG);
    }

    // Use NextNodeServer for handling requests in standalone mode
    const NextServer = require('next/dist/server/next-server').default;

    app = new NextServer({
        hostname,
        port,
        dir: __dirname,
        dev: false,
        conf: {
            ...nextConfig,
            distDir: '.next',
        },
    });
    handle = app.getRequestHandler();

    // For standalone, prepare is a no-op but we make it compatible
    app.prepare = () => Promise.resolve();
} else {
    // Development mode: use normal Next.js initialization
    const next = require('next');
    app = next({ dev, hostname, port });
    handle = app.getRequestHandler();
}

/**
 * Find a ticket file across all boards.
 * Searches: gitboard/boards/{boardId}/tickets/{status}/{ticketId}.json
 * Falls back to legacy: gitboard/tickets/{status}/{ticketId}.json
 *
 * @param {string} basePath - The repo root or worktree path to search in
 * @param {string} ticketId - The ticket ID to find
 * @returns {{ filePath: string, status: string } | null}
 */
function findTicketFile(basePath, ticketId) {
    console.log(`[findTicketFile] Searching for ticket ${ticketId} in basePath: ${basePath}`);

    // Check for standalone mode (.gitboard/data/) first, then fall back to gitboard/
    const standaloneDataPath = path.join(basePath, '.gitboard', 'data');
    const devModePath = path.join(basePath, 'gitboard');
    const gitboardPath = fs.existsSync(standaloneDataPath) ? standaloneDataPath : devModePath;
    console.log(`[findTicketFile] gitboardPath: ${gitboardPath} (standalone: ${gitboardPath === standaloneDataPath})`);

    // Get dynamic statuses from config or use defaults
    let statuses;
    try {
        const configPath = path.join(gitboardPath, 'config.json');
        if (fs.existsSync(configPath)) {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
            if (config.statuses && Array.isArray(config.statuses) && config.statuses.length > 0) {
                statuses = config.statuses.map(s => s.id);
                console.log(`[findTicketFile] Loaded statuses from config.json: ${statuses.join(', ')}`);
            }
        } else {
            console.log(`[findTicketFile] config.json not found at: ${configPath}`);
        }
    } catch (err) {
        console.warn(`[findTicketFile] Failed to parse config.json: ${err.message}`);
    }
    if (!statuses) {
        statuses = ['todo', 'doing', 'blocked', 'done'];
        console.log(`[findTicketFile] Using default statuses: ${statuses.join(', ')}`);
    }

    // Search in boards: gitboard/boards/*/tickets/{status}/{ticketId}.json
    const boardsDir = path.join(gitboardPath, 'boards');
    console.log(`[findTicketFile] Checking boards directory: ${boardsDir}`);

    if (fs.existsSync(boardsDir)) {
        console.log(`[findTicketFile] boards/ directory exists`);
        try {
            const boardDirs = fs.readdirSync(boardsDir, { withFileTypes: true })
                .filter(d => d.isDirectory())
                .map(d => d.name);
            console.log(`[findTicketFile] Found board directories: ${boardDirs.join(', ')}`);

            for (const boardId of boardDirs) {
                console.log(`[findTicketFile] Checking board: ${boardId}`);

                // Check board-specific statuses
                let boardStatuses = statuses;
                try {
                    const boardMetaPath = path.join(boardsDir, boardId, 'board.json');
                    if (fs.existsSync(boardMetaPath)) {
                        const boardMeta = JSON.parse(fs.readFileSync(boardMetaPath, 'utf-8'));
                        if (boardMeta.statuses && Array.isArray(boardMeta.statuses) && boardMeta.statuses.length > 0) {
                            boardStatuses = boardMeta.statuses.map(s => s.id);
                            console.log(`[findTicketFile] Board ${boardId} has custom statuses: ${boardStatuses.join(', ')}`);
                        } else {
                            console.log(`[findTicketFile] Board ${boardId} board.json has no statuses array, using config statuses`);
                        }
                    } else {
                        console.log(`[findTicketFile] Board ${boardId} has no board.json, using config statuses`);
                    }
                } catch (err) {
                    console.warn(`[findTicketFile] Failed to parse board.json for board ${boardId}: ${err.message}`);
                }

                for (const status of boardStatuses) {
                    const filePath = path.join(boardsDir, boardId, 'tickets', status, `${ticketId}.json`);
                    const exists = fs.existsSync(filePath);
                    console.log(`[findTicketFile] Checking ${filePath}: ${exists ? 'FOUND' : 'not found'}`);
                    if (exists) {
                        console.log(`[findTicketFile] ✅ Found ticket at: ${filePath}`);
                        return { filePath, status, boardId };
                    }
                }
            }
        } catch (err) {
            console.warn(`[findTicketFile] Failed to read boards directory: ${err.message}`);
        }
    } else {
        console.log(`[findTicketFile] boards/ directory does not exist`);
    }

    // Fallback: legacy path gitboard/tickets/{status}/{ticketId}.json
    console.log(`[findTicketFile] Checking legacy paths...`);
    for (const status of statuses) {
        const filePath = path.join(gitboardPath, 'tickets', status, `${ticketId}.json`);
        const exists = fs.existsSync(filePath);
        console.log(`[findTicketFile] Checking legacy ${filePath}: ${exists ? 'FOUND' : 'not found'}`);
        if (exists) {
            console.log(`[findTicketFile] ✅ Found ticket at legacy path: ${filePath}`);
            return { filePath, status, boardId: null };
        }
    }

    console.log(`[findTicketFile] ❌ Ticket ${ticketId} not found in any location`);
    return null;
}

// Helper function to read ticket content
function readTicket(ticketId, basePath = null) {
    try {
        const searchPath = basePath || process.env.GITBOARD_REPO_PATH;
        console.log(`[readTicket] Reading ticket ${ticketId} from basePath: ${searchPath}`);
        const result = findTicketFile(searchPath, ticketId);
        if (result) {
            const data = JSON.parse(fs.readFileSync(result.filePath, 'utf-8'));
            console.log(`[readTicket] ✅ Successfully read ticket ${ticketId}`);
            return {
                id: data.id,
                title: data.title,
                description: data.description,
                status: result.status,
                links: data.links,
            };
        } else {
            console.log(`[readTicket] ❌ Ticket ${ticketId} not found`);
        }
    } catch (err) {
        console.error(`[readTicket] Failed to read ticket ${ticketId}:`, err.message);
    }
    return null;
}

app.prepare().then(() => {
    const server = createServer(async (req, res) => {
        try {
            const parsedUrl = parse(req.url, true);

            // In standalone mode, serve static files directly
            if (isStandaloneMode && parsedUrl.pathname.startsWith('/_next/static/')) {
                // Decode URL-encoded paths (e.g., %5B...path%5D -> [...path])
                const staticPath = decodeURIComponent(parsedUrl.pathname.replace('/_next/static/', ''));
                const filePath = path.join(__dirname, '.next', 'static', staticPath);

                if (fs.existsSync(filePath)) {
                    const ext = path.extname(filePath);
                    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

                    res.setHeader('Content-Type', contentType);
                    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

                    const stream = fs.createReadStream(filePath);
                    stream.pipe(res);
                    return;
                }
            }

            await handle(req, res, parsedUrl);
        } catch (err) {
            console.error('Error occurred handling', req.url, err);
            res.statusCode = 500;
            res.end('internal server error');
        }
    });

    // Add endpoint to get active sessions
    const originalListener = server.listeners('request')[0];
    server.removeAllListeners('request');
    server.on('request', (req, res) => {
        if (req.url === '/api/active-sessions-internal') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            // Use ptyProcesses as source of truth - this persists across browser refresh
            // while activeSessions is cleared when socket disconnects
            const sessions = Array.from(ptyProcesses.keys()).map((ticketId) => ({
                ticketId,
                // Include session status (running/waiting) from hooks
                status: sessionStatus.get(ticketId) || 'running',
                // Include session metadata from activeSessions if available
                ...(activeSessions.get(ticketId) || {})
            }));
            res.end(JSON.stringify({ activeSessions: sessions }));
        } else if (req.url === '/api/session-status-internal' && req.method === 'POST') {
            // Endpoint for Claude Code hooks to update session status
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', () => {
                console.log(`[session-status-internal] Received request - Raw body: ${body}`);
                try {
                    const { ticketId, status } = JSON.parse(body);
                    console.log(`[session-status-internal] Parsed - ticketId: ${ticketId}, status: ${status}`);
                    if (ticketId && (status === 'running' || status === 'waiting' || status === 'paused' || status === 'error')) {
                        sessionStatus.set(ticketId, status);
                        console.log(`📊 [session-status-internal] SUCCESS: Session status for ${ticketId} updated to: ${status}`);
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: true, ticketId, status }));
                    } else {
                        console.log(`[session-status-internal] ERROR: Invalid ticketId (${ticketId}) or status (${status})`);
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: false, error: 'Invalid ticketId or status' }));
                    }
                } catch (err) {
                    console.log(`[session-status-internal] ERROR: Failed to parse JSON - ${err.message}`);
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: 'Invalid JSON' }));
                }
            });
        } else if (req.url?.startsWith('/api/kill-pty-internal?') && req.method === 'POST') {
            // Extract ticketId from query string
            const url = new URL(req.url, `http://${req.headers.host}`);
            const ticketId = url.searchParams.get('ticketId');

            if (ticketId && ptyProcesses.has(ticketId)) {
                const processData = ptyProcesses.get(ticketId);
                processData.ptyProcess.kill();
                ptyProcesses.delete(ticketId);
                activeSessions.delete(ticketId);
                sessionStatus.delete(ticketId);

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, ticketId }));
                console.log(`🛑 Killed PTY for ${ticketId}`);
            } else {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: 'PTY not found' }));
            }
        } else {
            originalListener(req, res);
        }
    });

    // Initialize Socket.io
    const io = new Server(server, {
        cors: {
            origin: '*',
        },
    });

    io.on('connection', (socket) => {
        console.log('🔌 Client connected:', socket.id);

        // Get ticket and agent info
        const ticketId = socket.handshake.query.ticketId;
        const agentId = socket.handshake.query.agentId;

        // Parse execution options from query
        const skipPermissions = socket.handshake.query.skipPermissions === 'true';
        const executionMode = socket.handshake.query.executionMode || 'normal';
        const executeImmediately = socket.handshake.query.executeImmediately !== 'false'; // default true
        const includeRelatedTickets = socket.handshake.query.includeRelatedTickets === 'true';
        const baseBranch = socket.handshake.query.baseBranch || 'main';
        const mergeBranch = socket.handshake.query.mergeBranch || baseBranch;

        const includeDocsPages = socket.handshake.query.includeDocsPages || '';
        const includeRepoFiles = socket.handshake.query.includeRepoFiles || '';
        const includeUrls = socket.handshake.query.includeUrls || '';
        const includeSkills = socket.handshake.query.includeSkills || '';
        const includeMCPs = socket.handshake.query.includeMCPs || '';
        const includeArtifacts = socket.handshake.query.includeArtifacts || '';
        const createNewBranch = socket.handshake.query.createNewBranch === 'true';
        const autoUpdateTicket = socket.handshake.query.autoUpdateTicket === 'true';
        const autoMoveTicket = socket.handshake.query.autoMoveTicket === 'true';
        const targetColumn = socket.handshake.query.targetColumn || 'done';

        console.log('📋 Execution options:', {
            skipPermissions,
            executionMode,
            executeImmediately,
            includeRelatedTickets,
            includeDocsPages,
            includeRepoFiles,
            includeUrls,
            includeSkills,
            includeMCPs,
            includeArtifacts,
            baseBranch,
            mergeBranch,
            createNewBranch,
            autoUpdateTicket,
            autoMoveTicket,
            targetColumn,
        });
        console.log(`🌿 Worktree mode: ${createNewBranch ? 'ENABLED (will create branch/worktree)' : 'DISABLED (using main repo)'}`);

        // Setup worktree for this ticket (only if createNewBranch is enabled)
        let repoPath = process.env.GITBOARD_REPO_PATH || process.cwd();

        // Validate that data directory exists (gitboard/ or .gitboard/data/)
        const dataDir = getDataDir();
        if (!fs.existsSync(dataDir)) {
            console.warn(`⚠️  Data directory not found at ${dataDir}, attempting parent directory`);
            const parentPath = path.resolve(repoPath, '..');
            const parentGitboardPath = path.join(parentPath, 'gitboard');
            const parentStandalonePath = path.join(parentPath, '.gitboard', 'data');
            if (fs.existsSync(parentGitboardPath)) {
                repoPath = parentPath;
                console.log(`✅ Found gitboard/ at parent: ${repoPath}`);
            } else if (fs.existsSync(parentStandalonePath)) {
                repoPath = parentPath;
                process.env.GITBOARD_DATA_PATH = parentStandalonePath;
                console.log(`✅ Found .gitboard/data/ at parent: ${repoPath}`);
            } else {
                console.error(`❌ Could not find valid gitboard directory at ${repoPath} or ${parentPath}`);
            }
        }

        let worktreePath = '';
        let workingDirectory = repoPath; // Default to main repo

        if (createNewBranch) {
            const worktreeResult = gitHelpers.setupWorktreeForTicket(repoPath, ticketId, baseBranch);

            if (!worktreeResult.success) {
                console.error(`❌ Failed to setup worktree for ${ticketId}:`, worktreeResult.error);
                socket.emit('output', `\r\n\x1b[31mError: ${worktreeResult.error}\x1b[0m\r\n`);
                socket.emit('output', `\r\n\x1b[33mPlease check that the base branch '${baseBranch}' exists and try again.\x1b[0m\r\n`);
                socket.disconnect();
                return;
            }

            worktreePath = worktreeResult.worktreePath;
            workingDirectory = worktreePath;
            console.log(`📁 Using worktree at: ${worktreePath}`);
        } else {
            console.log(`📁 Using main repo at: ${repoPath} (no worktree mode)`);
        }

        // Track active session
        activeSessions.set(ticketId, {
            socketId: socket.id,
            agentId: agentId,
            startTime: new Date().toISOString(),
            executionOptions: {
                skipPermissions,
                executionMode,
                executeImmediately,
                includeRelatedTickets,
                includeDocsPages,
            }
        });
        console.log(`📊 Active sessions: ${activeSessions.size}`);

        // Spawn shell with PTY - exact example from node-pty docs
        const os = require('os');
        const { execSync } = require('child_process');

        // Find Claude CLI
        let claudePath = 'claude';
        try {
            const whichResult = execSync('which claude', { encoding: 'utf-8' });
            claudePath = whichResult.trim();
            console.log(`✅ Found Claude CLI:`, claudePath);
        } catch (err) {
            console.error(`❌ Claude CLI not found in PATH!`);
        }

        console.log(`📡 Spawning Claude CLI for ${socket.id}`);

        // Load agent system prompt, terminal instructions, and artifact template
        let systemPrompt = '';
        let terminalInstructions = undefined;
        let artifactTemplate = undefined;

        if (agentId) {
            try {
                const agentPath = path.join(getDataDir(), 'agents', `${agentId}.json`);
                const agentData = fs.readFileSync(agentPath, 'utf-8');
                const agent = JSON.parse(agentData);
                systemPrompt = agent.systemPrompt || '';
                terminalInstructions = agent.terminalInstructions;
                artifactTemplate = agent.artifactTemplate;
                console.log(`📋 Loaded agent system prompt: ${systemPrompt.substring(0, 50)}...`);
                console.log(`📋 Loaded agent terminal instructions: ${terminalInstructions ? terminalInstructions.substring(0, 50) + '...' : '(none)'}`);
                console.log(`📋 Loaded agent artifact template: ${artifactTemplate ? 'yes' : '(none)'}`);
            } catch (err) {
                console.error('Failed to load agent:', err);
            }
        }

        const resumeSession = socket.handshake.query.resume === 'true';

        // ============================================
        // RESUME FLOW - Completely separate, minimal
        // ============================================
        if (resumeSession) {
            console.log(`🔄 RESUME FLOW for ticket ${ticketId}`);

            // Resume session directly by ticket ID (sessions are renamed to ticket ID)
            // Note: Don't add executionMode flags here - the resumed session keeps its original settings
            const resumeArgs = ['-r', ticketId];
            if (skipPermissions) {
                resumeArgs.push('--dangerously-skip-permissions');
            }

            try {
                // Check if PTY already exists
                if (ptyProcesses.has(ticketId)) {
                    const processData = ptyProcesses.get(ticketId);
                    const buffer = processData.buffer || '';
                    if (buffer) socket.emit('output', buffer);
                    if (!processData.sockets) processData.sockets = [];
                    processData.sockets.push(socket);

                    // Setup input/resize handlers
                    socket.on('input', (data) => processData.ptyProcess.write(data));
                    socket.on('resize', ({ cols, rows }) => processData.ptyProcess.resize(cols, rows));

                    // Handle manual paste instructions for reconnect
                    socket.on('paste-instructions', () => {
                        console.log('📋 Manual paste instructions requested (reconnect)');
                        console.log(`📋 Searching in repoPath: ${repoPath}`);
                        let ticketResult = findTicketFile(repoPath, ticketId);
                        if (!ticketResult && createNewBranch) {
                            console.log(`📋 Not found in repoPath, searching in worktreePath: ${worktreePath}`);
                            ticketResult = findTicketFile(worktreePath, ticketId);
                        }
                        if (ticketResult) {
                            console.log(`📋 ✅ Found ticket for paste: ${ticketResult.filePath}`);
                        } else {
                            console.warn(`📋 ❌ Ticket not found for paste`);
                        }

                        let context = '';
                        if (ticketResult) {
                            // ARCHITECTURAL DECISION: Always use root repo path for ticket files.
                            // Worktrees are for code changes only; ticket files live in the root repo.
                            const ticketFilePath = ticketResult.filePath;

                            if (createNewBranch) {
                                context = `You are working on ticket ${ticketId}.\n\nTicket file: ${ticketFilePath}\n\nYou are working in an isolated git worktree on branch '${ticketId}'.\nAll changes you make will be on this feature branch, not on main.\n\nInstructions:\n1. Read the ticket file to understand the task\n2. Complete the work described in the ticket\n3. Commit your changes to this feature branch\n\nWorking directory: ${workingDirectory}\nBranch: ${ticketId}\n\nPlease start working on this task.`;
                            } else {
                                context = `You are working on ticket ${ticketId}.\n\nTicket file: ${ticketFilePath}\n\nYou are working in the main repository on the current branch.\nNo isolated branch was created for this ticket.\n\nInstructions:\n1. Read the ticket file to understand the task\n2. Complete the work described in the ticket\n3. Commit your changes when ready\n\nWorking directory: ${workingDirectory}\n\nPlease start working on this task.`;
                            }
                        }

                        if (context) {
                            processData.ptyProcess.write(context);
                            setTimeout(() => {
                                processData.ptyProcess.write('\r');
                                console.log('✅ Manually pasted ticket context (reconnect)');
                            }, 100);
                        } else {
                            socket.emit('output', '\r\n\x1b[33m[No ticket context available]\x1b[0m\r\n');
                        }
                    });

                    socket.on('disconnect', () => {
                        processData.sockets = processData.sockets.filter(s => s !== socket);
                        activeSessions.delete(ticketId);
                    });
                    return;
                }

                // Create new PTY for resume - simple, no context injection
                // Always use repoPath so sessions are stored consistently at project root
                const envTicketId = ticketId;
                const envServerUrl = `http://localhost:${port}`;
                console.log(`[server.cjs:resume-spawn] Setting Claude hook environment variables:`);
                console.log(`[server.cjs:resume-spawn]   GITBOARD_TICKET_ID=${envTicketId}`);
                console.log(`[server.cjs:resume-spawn]   GITBOARD_SERVER_URL=${envServerUrl}`);

                const ptyProcess = pty.spawn(claudePath, resumeArgs, {
                    name: 'xterm-color',
                    cols: 80,
                    rows: 30,
                    cwd: repoPath,
                    env: {
                        ...process.env,
                        GITBOARD_TICKET_ID: envTicketId,
                        GITBOARD_SERVER_URL: envServerUrl
                    }
                });

                const processData = { ptyProcess, buffer: '', sockets: [socket] };
                ptyProcesses.set(ticketId, processData);

                ptyProcess.onData((data) => {
                    processData.buffer += data;
                    if (processData.buffer.length > 100000) {
                        processData.buffer = processData.buffer.slice(-100000);
                    }
                    processData.sockets.forEach(s => s.connected && s.emit('output', data));
                });

                ptyProcess.onExit(({ exitCode }) => {
                    console.log(`PTY for ${ticketId} exited with code ${exitCode}`);
                    processData.sockets.forEach(s => {
                        s.emit('output', `\r\n\x1b[33m[Session exited with code ${exitCode}]\x1b[0m\r\n`);
                        s.disconnect();
                    });
                    ptyProcesses.delete(ticketId);
                    activeSessions.delete(ticketId);
                });

                socket.on('input', (data) => ptyProcess.write(data));
                socket.on('resize', ({ cols, rows }) => ptyProcess.resize(cols, rows));

                // Handle manual paste instructions for resume flow too
                socket.on('paste-instructions', () => {
                    console.log('📋 Manual paste instructions requested (resume flow)');
                    console.log(`📋 Searching in repoPath: ${repoPath}`);
                    let ticketResult = findTicketFile(repoPath, ticketId);
                    if (!ticketResult && createNewBranch) {
                        console.log(`📋 Not found in repoPath, searching in worktreePath: ${worktreePath}`);
                        ticketResult = findTicketFile(worktreePath, ticketId);
                    }
                    if (ticketResult) {
                        console.log(`📋 ✅ Found ticket for paste: ${ticketResult.filePath}`);
                    } else {
                        console.warn(`📋 ❌ Ticket not found for paste`);
                    }

                    let context = '';
                    if (ticketResult) {
                        // ARCHITECTURAL DECISION: Always use root repo path for ticket files.
                        // Worktrees are for code changes only; ticket files live in the root repo.
                        const ticketFilePath = ticketResult.filePath;

                        if (createNewBranch) {
                            context = `You are working on ticket ${ticketId}.\n\nTicket file: ${ticketFilePath}\n\nYou are working in an isolated git worktree on branch '${ticketId}'.\nAll changes you make will be on this feature branch, not on main.\n\nInstructions:\n1. Read the ticket file to understand the task\n2. Complete the work described in the ticket\n3. Commit your changes to this feature branch\n\nWorking directory: ${workingDirectory}\nBranch: ${ticketId}\n\nPlease start working on this task.`;
                        } else {
                            context = `You are working on ticket ${ticketId}.\n\nTicket file: ${ticketFilePath}\n\nYou are working in the main repository on the current branch.\nNo isolated branch was created for this ticket.\n\nInstructions:\n1. Read the ticket file to understand the task\n2. Complete the work described in the ticket\n3. Commit your changes when ready\n\nWorking directory: ${workingDirectory}\n\nPlease start working on this task.`;
                        }
                    }

                    if (context) {
                        ptyProcess.write(context);
                        setTimeout(() => {
                            ptyProcess.write('\r');
                            console.log('✅ Manually pasted ticket context (resume flow)');
                        }, 100);
                    } else {
                        console.log('⚠️ No ticket context available to paste');
                        socket.emit('output', '\r\n\x1b[33m[No ticket context available]\x1b[0m\r\n');
                    }
                });

                socket.on('disconnect', () => {
                    processData.sockets = processData.sockets.filter(s => s !== socket);
                    activeSessions.delete(ticketId);
                });

                console.log(`✅ Resume PTY created for ${ticketId}`);
                return; // Exit early - resume flow complete

            } catch (err) {
                console.error('Resume failed:', err);
                socket.emit('output', `\r\n\x1b[31mFailed to resume session: ${err.message}\x1b[0m\r\n`);
                socket.disconnect();
                return;
            }
        }

        // ============================================
        // START FLOW - Full setup with ticket context
        // ============================================
        console.log(`🆕 START FLOW for ticket ${ticketId}`);

        // Build Claude CLI arguments
        const claudeArgs = [];
        if (skipPermissions) {
            claudeArgs.push('--dangerously-skip-permissions');
        }
        if (executionMode === 'plan-only') {
            claudeArgs.push('--permission-mode', 'plan');
            console.log('📋 Using Claude Code plan mode');
        }
        if (systemPrompt) {
            claudeArgs.push('--system-prompt', systemPrompt);
        }

        // Write .mcp.json file with selected MCP server configurations
        // Claude Code reads this file from the project root to load MCP servers
        if (includeMCPs) {
            const mcpIds = includeMCPs.split(',').filter(Boolean);
            if (mcpIds.length > 0) {
                const mcpJsonPath = path.join(repoPath, '.mcp.json');

                // Read existing .mcp.json if it exists (to preserve non-gitboard MCPs)
                let existingMcpJson = { mcpServers: {} };
                try {
                    if (fs.existsSync(mcpJsonPath)) {
                        existingMcpJson = JSON.parse(fs.readFileSync(mcpJsonPath, 'utf-8'));
                        if (!existingMcpJson.mcpServers) {
                            existingMcpJson.mcpServers = {};
                        }
                    }
                } catch (err) {
                    console.warn('Failed to read existing .mcp.json:', err.message);
                }

                // Build mcpServers object from selected GitBoard MCPs
                const gitboardMcpServers = {};
                const dataDir = getDataDir();
                for (const mcpId of mcpIds) {
                    const mcpConfigPath = path.join(dataDir, 'mcp', mcpId, 'config.json');
                    try {
                        if (fs.existsSync(mcpConfigPath)) {
                            const mcpConfig = JSON.parse(fs.readFileSync(mcpConfigPath, 'utf-8'));
                            if (mcpConfig.enabled !== false && mcpConfig.command) {
                                // Build MCP server config in Claude Code format
                                const serverConfig = {
                                    command: mcpConfig.command,
                                    args: mcpConfig.args || [],
                                };

                                // Add env vars if present
                                if (mcpConfig.env && Object.keys(mcpConfig.env).length > 0) {
                                    serverConfig.env = mcpConfig.env;
                                }

                                // Use a prefixed name to identify custom MCPs
                                const serverName = `custom-${mcpId}`;
                                gitboardMcpServers[serverName] = serverConfig;
                                console.log(`🔌 Added MCP server: ${mcpConfig.name} (${serverName})`);
                            }
                        }
                    } catch (err) {
                        console.error(`Failed to load MCP config ${mcpId}:`, err);
                    }
                }

                // Merge gitboard MCPs with existing ones (gitboard MCPs take precedence)
                const mergedMcpJson = {
                    ...existingMcpJson,
                    mcpServers: {
                        ...existingMcpJson.mcpServers,
                        ...gitboardMcpServers,
                    },
                };

                // Write the merged .mcp.json file
                try {
                    fs.writeFileSync(mcpJsonPath, JSON.stringify(mergedMcpJson, null, 2));
                    console.log(`📝 Wrote .mcp.json with ${Object.keys(gitboardMcpServers).length} GitBoard MCP server(s)`);
                } catch (err) {
                    console.error('Failed to write .mcp.json:', err);
                }
            }
        }

        // ============================================
        // BUILD TICKET CONTEXT BEFORE SPAWNING PTY
        // This ensures ticketContext is ready when onData fires
        // ============================================
        let ticketContext = '';
        let ticketFilePath = '';

        if (ticketId) {
            try {
                console.log(`📋 Building ticket context for ${ticketId}`);
                console.log(`📋 repoPath: ${repoPath}`);
                console.log(`📋 worktreePath: ${worktreePath || '(none)'}`);

                // ARCHITECTURAL DECISION: Ticket files are ALWAYS resolved from the root repository (repoPath).
                // The .gitboard/data/ directory in the root repo is the canonical source of truth for all ticket data.
                // Worktrees are ephemeral workspaces for isolated code changes on feature branches, and should NOT
                // be used for ticket file resolution. This ensures that:
                // 1. Brand new tickets work on first agent launch attempt (no retry needed)
                // 2. Ticket updates are always written to the root repo, visible across all worktrees
                // 3. Clear separation of concerns: ticket metadata (root repo) vs code workspace (worktree)
                const ticketResult = findTicketFile(repoPath, ticketId);

                if (ticketResult) {
                    console.log(`📋 ✅ Ticket found: filePath=${ticketResult.filePath}, status=${ticketResult.status}, boardId=${ticketResult.boardId || '(legacy)'}`);
                } else {
                    console.warn(`📋 ❌ Ticket ${ticketId} not found in root repository (${repoPath})`);
                }

                if (ticketResult) {
                    ticketFilePath = ticketResult.filePath;
                    const ticketData = JSON.parse(fs.readFileSync(ticketResult.filePath, 'utf-8'));

                    // Build context parts
                    let contextParts = [];

                    contextParts.push(`You are working on ticket ${ticketId}.`);
                    contextParts.push('');
                    contextParts.push(`Ticket file: ${ticketFilePath}`);
                    contextParts.push('');

                    if (createNewBranch) {
                        // Worktree mode - isolated branch
                        contextParts.push(`You are working in an isolated git worktree on branch '${ticketId}'.`);
                        contextParts.push('All changes you make will be on this feature branch, not on main.');
                        contextParts.push('');
                        contextParts.push(`Branch created from: ${baseBranch}`);
                        contextParts.push(`Merge target: ${mergeBranch}`);
                        if (baseBranch !== mergeBranch) {
                            contextParts.push(`Note: This follows a git flow where work branches from '${baseBranch}' but merges to '${mergeBranch}'.`);
                        }
                    } else {
                        // Main repo mode - working on current branch
                        contextParts.push(`You are working in the main repository on the current branch.`);
                        contextParts.push('No isolated branch was created for this ticket.');
                    }
                    contextParts.push('');

                    // Add docs pages context if selected
                    if (includeDocsPages) {
                        contextParts.push('## Additional Context - Docs');
                        contextParts.push(`Read these docs files for context: ${includeDocsPages}`);
                        contextParts.push('');
                    }

                    // Add repo files context if selected
                    if (includeRepoFiles) {
                        contextParts.push('## Additional Context - Repo Files');
                        contextParts.push(`Read these repo files for context: ${includeRepoFiles}`);
                        contextParts.push('');
                    }

                    // Add URL links context if selected
                    if (includeUrls) {
                        contextParts.push('## Additional Context - URL Links');
                        contextParts.push(`Fetch and read these URLs for context using your WebFetch tool: ${includeUrls}`);
                        contextParts.push('');
                    }

                    // Add skills context if selected
                    if (includeSkills) {
                        const skillIds = includeSkills.split(',').filter(Boolean);
                        if (skillIds.length > 0) {
                            contextParts.push('## Skills Context');
                            contextParts.push('Apply the following skills when working on this task:');
                            contextParts.push('');
                            const skillsDataDir = getDataDir();
                            for (const skillId of skillIds) {
                                const skillPath = path.join(skillsDataDir, 'skills', `${skillId}.md`);
                                try {
                                    if (fs.existsSync(skillPath)) {
                                        const skillContent = fs.readFileSync(skillPath, 'utf-8');
                                        // Parse YAML frontmatter to get skill name
                                        const frontmatterMatch = skillContent.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
                                        if (frontmatterMatch) {
                                            const nameMatch = frontmatterMatch[1].match(/name:\s*(.+)/);
                                            const skillName = nameMatch ? nameMatch[1].trim() : skillId;
                                            const instructions = frontmatterMatch[2].trim();
                                            contextParts.push(`### Skill: ${skillName}`);
                                            contextParts.push(instructions);
                                            contextParts.push('');
                                        } else {
                                            // No frontmatter, use the entire content
                                            contextParts.push(`### Skill: ${skillId}`);
                                            contextParts.push(skillContent);
                                            contextParts.push('');
                                        }
                                    }
                                } catch (skillErr) {
                                    console.error(`Failed to load skill ${skillId}:`, skillErr);
                                }
                            }
                        }
                    }

                    // Add related tickets context if enabled
                    if (includeRelatedTickets && ticketData.links) {
                        const relatedIds = [
                            ...(ticketData.links.blocked_by || []),
                            ...(ticketData.links.blocks || []),
                            ...(ticketData.links.related_tickets || []),
                        ];

                        if (relatedIds.length > 0) {
                            contextParts.push('## Related Tickets');
                            contextParts.push('');

                            for (const relatedId of relatedIds) {
                                const relatedTicket = readTicket(relatedId, repoPath);
                                if (relatedTicket) {
                                    contextParts.push(`### ${relatedTicket.id}: ${relatedTicket.title}`);
                                    contextParts.push(`Status: ${relatedTicket.status}`);
                                    if (relatedTicket.description) {
                                        const desc = relatedTicket.description;
                                        if (desc.length > 500) {
                                            contextParts.push(desc.substring(0, 500) + '...');
                                        } else {
                                            contextParts.push(desc);
                                        }
                                    }
                                    contextParts.push('');
                                }
                            }
                        }
                    }

                    // Add pipeline artifacts context if selected (as file references, not pasted content)
                    if (includeArtifacts) {
                        const artifactIds = includeArtifacts.split(',').filter(Boolean);
                        if (artifactIds.length > 0) {
                            const artifactsDataDir = getDataDir();
                            const artifactPaths = [];

                            for (const artifactId of artifactIds) {
                                const artifactPath = path.join(artifactsDataDir, 'artifacts', ticketId, `${artifactId}.json`);
                                if (fs.existsSync(artifactPath)) {
                                    artifactPaths.push(artifactPath);
                                }
                            }

                            if (artifactPaths.length > 0) {
                                contextParts.push('## Additional Context - Pipeline Artifacts');
                                contextParts.push(`Read these artifact files for context from previous pipeline stages: ${artifactPaths.join(', ')}`);
                                contextParts.push('');
                            }
                        }
                    }

                    // Add artifact template context if configured
                    if (artifactTemplate && artifactTemplate.trim()) {
                        contextParts.push('## Artifact Template');
                        contextParts.push('When generating artifacts, follow this template:');
                        contextParts.push('');
                        contextParts.push(artifactTemplate.trim());
                        contextParts.push('');
                    }

                    // Only add instructions section if agent has terminalInstructions configured
                    if (terminalInstructions && terminalInstructions.trim()) {
                        contextParts.push('Instructions:');
                        contextParts.push(terminalInstructions.trim());
                        contextParts.push('');
                    }

                    contextParts.push(`Working directory: ${workingDirectory}`);
                    if (createNewBranch) {
                        contextParts.push(`Branch: ${ticketId}`);
                        contextParts.push('');
                        contextParts.push(`Main branch (you will usually use this for PRs): ${mergeBranch}`);
                    }

                    // Add ticket automation settings info
                    if (autoUpdateTicket || autoMoveTicket) {
                        contextParts.push('');
                        contextParts.push('Ticket Automation Settings:');
                        if (autoUpdateTicket) {
                            contextParts.push('- Auto Update Ticket: ENABLED - Acceptance criteria and implementation steps will be automatically marked as completed upon successful task completion.');
                        }
                        if (autoMoveTicket) {
                            contextParts.push(`- Auto Move Ticket: ENABLED - Ticket will be automatically moved to "${targetColumn}" column upon successful completion.`);
                        }
                    }

                    // Only auto-start if executeImmediately is true
                    if (executeImmediately) {
                        contextParts.push('');
                        contextParts.push('Please start working on this task.');
                    } else {
                        contextParts.push('');
                        contextParts.push('Awaiting your instruction to start.');
                    }

                    ticketContext = contextParts.join('\n');

                    console.log(`📋 Loaded ticket context for ${ticketId} at ${ticketFilePath}`);
                    console.log(`📋 Context includes: docs pages: ${includeDocsPages ? 'yes' : 'no'}, repo files: ${includeRepoFiles ? 'yes' : 'no'}, urls: ${includeUrls ? 'yes' : 'no'}, skills: ${includeSkills ? 'yes' : 'no'}, mcps: ${includeMCPs ? 'yes' : 'no'}, artifacts: ${includeArtifacts ? 'yes' : 'no'}, related tickets: ${includeRelatedTickets}, artifact template: ${artifactTemplate ? 'yes' : 'no'}`);
                }
            } catch (err) {
                console.error('Failed to load ticket:', err);
            }
        }

        try {
            // Check if PTY already exists for this ticket
            let ptyProcess;
            let isReconnecting = false;

            if (ptyProcesses.has(ticketId)) {
                // Reuse existing PTY process
                const processData = ptyProcesses.get(ticketId);
                ptyProcess = processData.ptyProcess;
                isReconnecting = true;
                console.log(`🔄 Reconnecting to existing PTY for ${ticketId}`);

                // Send buffered output to new client
                const buffer = processData.buffer || '';
                if (buffer) {
                    socket.emit('output', buffer);
                }

                // Add this socket to the list of connected sockets
                if (!processData.sockets) {
                    processData.sockets = [];
                }
                processData.sockets.push(socket);

            } else {
                // Create new PTY process - always use repoPath so sessions are stored at project root
                // The instructions tell Claude the actual working directory to use
                const envTicketId = ticketId;
                const envServerUrl = `http://localhost:${port}`;
                console.log(`[server.cjs:new-spawn] Setting Claude hook environment variables:`);
                console.log(`[server.cjs:new-spawn]   GITBOARD_TICKET_ID=${envTicketId}`);
                console.log(`[server.cjs:new-spawn]   GITBOARD_SERVER_URL=${envServerUrl}`);

                ptyProcess = pty.spawn(claudePath, claudeArgs, {
                    name: 'xterm-color',
                    cols: 80,
                    rows: 30,
                    cwd: repoPath, // Sessions stored at project root for consistency
                    env: {
                        ...process.env,
                        GITBOARD_TICKET_ID: envTicketId,
                        GITBOARD_SERVER_URL: envServerUrl
                    }
                });
                console.log(`📁 PTY launched from: ${repoPath} (sessions stored here)`);
                console.log(`📁 Claude instructed to work in: ${workingDirectory}`);

                // Store PTY process with socket list
                const processData = {
                    ptyProcess: ptyProcess,
                    buffer: '',
                    sockets: [socket]
                };
                ptyProcesses.set(ticketId, processData);

                console.log(`✅ Created new PTY for ${ticketId}`);

                // Set up PTY event listeners (ONLY ONCE when created)
                let claudeReady = false;
                // Buffer for detecting ready signals that may be split across data chunks
                let readyDetectionBuffer = '';

                ptyProcess.onData((data) => {
                    // Broadcast to all connected sockets
                    const pd = ptyProcesses.get(ticketId);
                    if (pd) {
                        pd.buffer += data;
                        // Keep only last 100KB
                        if (pd.buffer.length > 100000) {
                            pd.buffer = pd.buffer.slice(-100000);
                        }

                        // Send to all connected sockets
                        pd.sockets.forEach(s => {
                            if (s.connected) {
                                s.emit('output', data);
                            }
                        });
                    }

                    // Accumulate output for ready signal detection (keep only last ~500 chars for efficiency)
                    readyDetectionBuffer += data;
                    if (readyDetectionBuffer.length > 500) {
                        readyDetectionBuffer = readyDetectionBuffer.slice(-500);
                    }

                    // Detect when Claude is ready and send ticket context (only for NEW sessions, not resume)
                    // Check the buffer instead of just current data chunk to handle fragmented output
                    if (!claudeReady && !resumeSession && ticketContext && (readyDetectionBuffer.includes('Try "') || readyDetectionBuffer.includes('❯'))) {
                        claudeReady = true;
                        console.log('🤖 Claude is ready!');

                        // Send ticket context first
                        setTimeout(() => {
                            ptyProcess.write(ticketContext);

                            // Only send enter and rename if executeImmediately is true
                            // Note: /rename only works AFTER the session has started processing
                            if (executeImmediately) {
                                setTimeout(() => {
                                    ptyProcess.write('\r');
                                    console.log('✅ Sent ticket context and triggered execution');

                                    // Rename session AFTER execution starts (1s delay to let it initialize)
                                    setTimeout(() => {
                                        ptyProcess.write(`/rename ${ticketId}`);
                                        setTimeout(() => {
                                            ptyProcess.write('\r');
                                            console.log(`📝 Renamed session to ${ticketId}`);
                                        }, 100);
                                    }, 1000);
                                }, 100);
                            } else {
                                // Can't rename until user starts - they'll have to rename manually if needed
                                console.log('✅ Sent ticket context (awaiting user to press Enter)');
                            }
                        }, 500);
                    } else if (!claudeReady && resumeSession && (readyDetectionBuffer.includes('Try "') || readyDetectionBuffer.includes('❯'))) {
                        claudeReady = true;
                        console.log('🔄 Claude resumed - skipping ticket context injection');
                    }
                });

                // Handle PTY exit
                ptyProcess.onExit(({ exitCode }) => {
                    console.log(`PTY for ${ticketId} exited with code ${exitCode}`);
                    const pd = ptyProcesses.get(ticketId);
                    if (pd) {
                        pd.sockets.forEach(s => {
                            s.emit('output', `\r\n\x1b[33m[Shell exited with code ${exitCode}]\x1b[0m\r\n`);
                            s.disconnect();
                        });
                    }
                    ptyProcesses.delete(ticketId);
                });
            }

            console.log('✅ Claude CLI spawned successfully');

            // Socket.io input -> PTY
            socket.on('input', (data) => {
                ptyProcess.write(data);
            });

            // Handle manual paste instructions request
            socket.on('paste-instructions', () => {
                console.log('📋 Manual paste instructions requested (start flow)');
                console.log(`📋 ticketContext length: ${ticketContext ? ticketContext.length : 0}`);
                if (ticketContext) {
                    ptyProcess.write(ticketContext);
                    setTimeout(() => {
                        ptyProcess.write('\r');
                        console.log('✅ Manually pasted ticket context (start flow)');
                    }, 100);
                } else {
                    console.log('⚠️ No ticket context available to paste - rebuilding...');
                    console.log(`📋 Searching in repoPath: ${repoPath}`);
                    let ticketResult = findTicketFile(repoPath, ticketId);
                    if (!ticketResult && createNewBranch) {
                        console.log(`📋 Not found in repoPath, searching in worktreePath: ${worktreePath}`);
                        ticketResult = findTicketFile(worktreePath, ticketId);
                    }
                    if (ticketResult) {
                        console.log(`📋 ✅ Found ticket for paste: ${ticketResult.filePath}`);
                    } else {
                        console.warn(`📋 ❌ Ticket not found for paste`);
                    }

                    let context = '';
                    if (ticketResult) {
                        // ARCHITECTURAL DECISION: Always use root repo path for ticket files.
                        // Worktrees are for code changes only; ticket files live in the root repo.
                        const ticketFilePath = ticketResult.filePath;

                        if (createNewBranch) {
                            context = `You are working on ticket ${ticketId}.\n\nTicket file: ${ticketFilePath}\n\nYou are working in an isolated git worktree on branch '${ticketId}'.\nAll changes you make will be on this feature branch, not on main.\n\nInstructions:\n1. Read the ticket file to understand the task\n2. Complete the work described in the ticket\n3. Commit your changes to this feature branch\n\nWorking directory: ${workingDirectory}\nBranch: ${ticketId}\n\nPlease start working on this task.`;
                        } else {
                            context = `You are working on ticket ${ticketId}.\n\nTicket file: ${ticketFilePath}\n\nYou are working in the main repository on the current branch.\nNo isolated branch was created for this ticket.\n\nInstructions:\n1. Read the ticket file to understand the task\n2. Complete the work described in the ticket\n3. Commit your changes when ready\n\nWorking directory: ${workingDirectory}\n\nPlease start working on this task.`;
                        }
                    }

                    if (context) {
                        ptyProcess.write(context);
                        setTimeout(() => {
                            ptyProcess.write('\r');
                            console.log('✅ Manually pasted rebuilt ticket context');
                        }, 100);
                    } else {
                        socket.emit('output', '\r\n\x1b[33m[No ticket file found]\x1b[0m\r\n');
                    }
                }
            });

            // Handle resize
            socket.on('resize', ({ cols, rows }) => {
                ptyProcess.resize(cols, rows);
            });

            // Handle PTY exit
            ptyProcess.onExit(({ exitCode }) => {
                console.log(`Shell exited with code ${exitCode}`);
                socket.emit('output', `\r\n\x1b[33m[Shell exited with code ${exitCode}]\x1b[0m\r\n`);
                socket.disconnect();
            });

            // Handle socket disconnect
            socket.on('disconnect', () => {
                console.log('👋 Client disconnected:', socket.id);
                activeSessions.delete(ticketId);

                // Remove this socket from PTY's socket list
                const processData = ptyProcesses.get(ticketId);
                if (processData) {
                    processData.sockets = processData.sockets.filter(s => s.id !== socket.id);
                    console.log(`📊 PTY for ${ticketId} has ${processData.sockets.length} connected clients`);
                }
            });
        } catch (error) {
            console.error('❌ Failed to spawn PTY:', error);
            socket.emit('output', `\r\n\x1b[31mError: Failed to start terminal\x1b[0m\r\n`);
            socket.disconnect();
        }
    });

    // Ticket Generation namespace
    const generateNs = io.of('/generate-ticket');
    generateNs.on('connection', (socket) => {
        console.log('🎯 Ticket generation client connected:', socket.id);

        socket.on('generate', async ({ title, description, systemPrompt, userPrompt, currentTicket, isEditMode }) => {
            try {
                // Use claude from PATH
                const claudePath = 'claude';

                // Define JSON schema for structured output
                // Extended schema for edit mode includes notes, tags, and priority
                const baseSchemaProperties = {
                    description: {
                        type: "string",
                        description: "Detailed 3-5 paragraph description of the ticket"
                    },
                    implementation_steps: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                text: { type: "string" },
                                completed: { type: "boolean" }
                            },
                            required: ["text", "completed"]
                        },
                        description: "Ordered list of implementation steps"
                    },
                    acceptance_criteria: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                text: { type: "string" },
                                completed: { type: "boolean" }
                            },
                            required: ["text", "completed"]
                        },
                        description: "List of testable acceptance criteria"
                    }
                };

                // Add edit-mode-specific fields
                const editModeProperties = isEditMode ? {
                    notes: {
                        type: "string",
                        description: "Optional notes or comments about the ticket"
                    },
                    tags: {
                        type: "array",
                        items: { type: "string" },
                        description: "Array of tags/labels for categorization"
                    },
                    priority: {
                        type: "string",
                        enum: ["low", "medium", "high", "critical"],
                        description: "Priority level of the ticket"
                    }
                } : {};

                const jsonSchema = JSON.stringify({
                    type: "object",
                    properties: {
                        ...baseSchemaProperties,
                        ...editModeProperties
                    },
                    required: ["description", "implementation_steps", "acceptance_criteria"]
                });

                // Build command with JSON output
                const command = `${claudePath} --print "${userPrompt.replace(/"/g, '\\"').replace(/\n/g, ' ')}" --output-format json --json-schema '${jsonSchema}' --system-prompt "${systemPrompt.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`;

                // Send command log
                console.log('📋 Command to execute:');
                console.log(`claude --print "${userPrompt}" --output-format json --json-schema '${jsonSchema}' --system-prompt "${systemPrompt}"`);
                console.log('');

                socket.emit('log', `$ claude --print "${userPrompt}" ...\n\n`);
                socket.emit('log', `Executing Claude...\n\n`);

                // Spawn claude directly with arguments
                const { spawn } = require('child_process');
                const args = [
                    '--print',
                    userPrompt,
                    '--output-format', 'json',
                    '--json-schema', jsonSchema,
                    '--system-prompt', systemPrompt
                ];

                const claude = spawn(claudePath, args, {
                    env: process.env,
                    stdio: ['pipe', 'pipe', 'pipe'] // stdin, stdout, stderr
                });

                console.log('✅ Spawned Claude process, PID:', claude.pid);

                // Close stdin immediately since we're not sending any input
                claude.stdin.end();

                let output = '';

                claude.stdout.on('data', (data) => {
                    const text = data.toString();
                    output += text;
                    console.log('📤 stdout chunk:', text.length, 'bytes');
                });

                claude.stderr.on('data', (data) => {
                    const text = data.toString();
                    console.log('📤 stderr chunk:', text.length, 'bytes');
                });

                claude.on('close', (code) => {
                    console.log('🏁 Claude process closed, code:', code, 'output length:', output.length);

                    if (code !== 0) {
                        socket.emit('error', `Process exited with code ${code}`);
                        return;
                    }

                    const trimmedOutput = output.trim();
                    if (!trimmedOutput) {
                        socket.emit('error', 'Claude returned empty response');
                        return;
                    }

                    // Parse JSON response - Claude wraps it in a result object
                    try {
                        const result = JSON.parse(trimmedOutput);

                        // Extract structured_output from the wrapper
                        const data = result.structured_output;

                        if (!data || !data.description || !data.implementation_steps || !data.acceptance_criteria) {
                            console.error('Invalid structure:', data);
                            throw new Error('Invalid response structure from Claude');
                        }

                        console.log('✅ Successfully parsed ticket data');
                        const response = {
                            description: data.description,
                            implementationSteps: data.implementation_steps,
                            acceptanceCriteria: data.acceptance_criteria
                        };

                        // Include edit-mode fields if present
                        if (data.notes !== undefined) {
                            response.notes = data.notes;
                        }
                        if (data.tags !== undefined) {
                            response.tags = data.tags;
                        }
                        if (data.priority !== undefined) {
                            response.priority = data.priority;
                        }

                        socket.emit('complete', response);
                    } catch (parseError) {
                        console.error('Failed to parse JSON response:', parseError);
                        console.error('Raw output:', trimmedOutput.substring(0, 500));
                        socket.emit('error', `Failed to parse response: ${parseError.message}`);
                    }
                });

                claude.on('error', (error) => {
                    console.error('❌ Claude process error:', error);
                    socket.emit('error', error.message);
                });
            } catch (error) {
                console.error('Error generating ticket:', error);
                socket.emit('error', error.message);
            }
        });

        socket.on('disconnect', () => {
            console.log('👋 Ticket generation client disconnected:', socket.id);
        });
    });

    // Conversational Ticket Generation namespace
    const conversationNs = io.of('/generate-ticket-conversation');
    conversationNs.on('connection', (socket) => {
        console.log('💬 Conversation client connected:', socket.id);

        socket.on('chat', async ({ messages, contextRepoFiles, contextDocsPages, contextUrls }) => {
            try {
                const claudePath = 'claude';

                // Build system prompt for conversational ticket generation
                const repoPathForConversation = process.env.GITBOARD_REPO_PATH || process.cwd();

                // Build context section if files/docs/urls are provided
                let additionalContext = '';
                if (contextDocsPages) {
                    additionalContext += `\n\nADDITIONAL CONTEXT - Docs:\nRead these docs files for context: ${contextDocsPages}`;
                }
                if (contextRepoFiles) {
                    additionalContext += `\n\nADDITIONAL CONTEXT - Repo Files:\nRead these repo files for context: ${contextRepoFiles}`;
                }
                if (contextUrls) {
                    additionalContext += `\n\nADDITIONAL CONTEXT - URL Links:\nFetch and read these URLs for context using your WebFetch tool: ${contextUrls}`;
                }

                const systemPrompt = `You are a helpful technical project manager assistant. Your job is to help users clarify their requirements for a ticket through conversation.

IMPORTANT: Do NOT use markdown formatting in your responses. Write in plain text only - no bold, italics, bullet points, headers, or code blocks. Keep responses conversational and natural.

REPOSITORY CONTEXT:
You have access to the codebase at: ${repoPathForConversation}
You have tools available to search and read the codebase: Glob (find files by pattern), Grep (search file contents), and Read (read file contents).${additionalContext}

When the user describes something they want to build or fix:

1. FIRST, proactively search the codebase to gather context before asking questions:
   - Use Glob to find relevant files (e.g., components, services, utilities, configs) related to what the user mentioned
   - Use Grep to search for relevant code patterns, function names, variable names, and implementations
   - Use Read to examine specific files and understand existing patterns, naming conventions, and code structure
   - Look for similar existing features or implementations that could inform the new work

2. Share relevant findings from your codebase search with the user - this helps them understand what context you have and builds confidence in your understanding

3. Only ask clarifying questions for information that CANNOT be determined from the codebase:
   - Business logic decisions or preferences
   - Desired behavior that isn't clear from existing patterns
   - Priority or scope decisions
   - User experience preferences
   - Keep questions focused and ask 1-2 at a time

4. Once you have enough information (usually after 2-4 exchanges), summarize the requirements

When you have gathered enough information, respond with a brief confirmation message and include a special JSON block at the end in this exact format:

---REQUIREMENTS_READY---
{
  "title": "Clear, concise ticket title",
  "context": "A detailed summary of all the requirements gathered from the conversation. Include: what needs to be built/fixed, the scope, any technical details mentioned, acceptance criteria discussed, and any constraints or preferences the user mentioned. Also include relevant codebase context you discovered (file locations, existing patterns, naming conventions) that will help with implementation."
}
---END_REQUIREMENTS_READY---

Only include the requirements block when you have enough information. Until then, search the codebase and respond conversationally to gather requirements.`;

                // Format conversation for Claude
                const conversationText = messages.map(m =>
                    `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`
                ).join('\n\n');

                const userPrompt = `Here is our conversation so far:\n\n${conversationText}\n\nPlease continue the conversation. If you now have enough information to create a complete ticket, include the ticket data in your response using the format specified. Otherwise, ask clarifying questions.`;

                console.log('💬 Processing conversation with', messages.length, 'messages');

                // Spawn claude
                const { spawn } = require('child_process');
                const args = [
                    '--print',
                    userPrompt,
                    '--system-prompt',
                    systemPrompt,
                    '--allowedTools',
                    'Glob,Grep,Read'
                ];

                const claude = spawn(claudePath, args, {
                    env: process.env,
                    stdio: ['pipe', 'pipe', 'pipe']
                });

                claude.stdin.end();

                let output = '';
                let streamBuffer = '';

                claude.stdout.on('data', (data) => {
                    const text = data.toString();
                    output += text;
                    streamBuffer += text;

                    // Stream content to client (but not the ticket data block)
                    if (!streamBuffer.includes('---TICKET_DATA---')) {
                        socket.emit('stream', { content: text });
                    }
                });

                claude.stderr.on('data', (data) => {
                    console.log('💬 stderr:', data.toString());
                });

                claude.on('close', (code) => {
                    console.log('💬 Claude conversation closed, code:', code);

                    if (code !== 0) {
                        socket.emit('error', `Process exited with code ${code}`);
                        return;
                    }

                    // Parse the response to extract requirements if present
                    let responseContent = output.trim();
                    let requirements = null;

                    const requirementsMatch = responseContent.match(/---REQUIREMENTS_READY---\s*([\s\S]*?)\s*---END_REQUIREMENTS_READY---/);
                    if (requirementsMatch) {
                        try {
                            requirements = JSON.parse(requirementsMatch[1]);
                            // Remove requirements block from the displayed message
                            responseContent = responseContent.replace(/---REQUIREMENTS_READY---[\s\S]*?---END_REQUIREMENTS_READY---/, '').trim();
                            console.log('✅ Requirements ready:', requirements.title);
                        } catch (parseError) {
                            console.error('Failed to parse requirements:', parseError);
                        }
                    }

                    socket.emit('complete', {
                        content: responseContent,
                        requirements: requirements,
                        isReady: !!requirements
                    });
                });

                claude.on('error', (error) => {
                    console.error('❌ Claude conversation error:', error);
                    socket.emit('error', error.message);
                });
            } catch (error) {
                console.error('Error in conversation:', error);
                socket.emit('error', error.message);
            }
        });

        socket.on('disconnect', () => {
            console.log('👋 Conversation client disconnected:', socket.id);
        });
    });

    // Docs Agent Chat namespace
    const docsAgentNs = io.of('/docs-agent-chat');

    // Lazy-initialized vector store for docs agent
    let docsVectorStore = null;
    const DOCS_INDEX_NAME = 'docs_embeddings';

    async function initDocsVectorStore() {
        if (docsVectorStore) return docsVectorStore;
        try {
            const { LibSQLVector } = await import('@mastra/libsql');
            docsVectorStore = new LibSQLVector({
                id: 'docs-vector-store',
                url: 'file:local_memory.db',
            });
            return docsVectorStore;
        } catch (error) {
            console.error('📚 Failed to init vector store:', error.message);
            return null;
        }
    }

    async function generateQueryEmbedding(text) {
        const baseURL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';

        // Try new /api/embed endpoint first (Ollama 0.4+)
        let response = await fetch(`${baseURL}/api/embed`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'nomic-embed-text', input: text }),
        });

        if (response.ok) {
            const data = await response.json();
            return data.embeddings[0];
        }

        // Fallback to older /api/embeddings endpoint
        response = await fetch(`${baseURL}/api/embeddings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'nomic-embed-text', prompt: text }),
        });

        if (!response.ok) {
            throw new Error(`Ollama embed failed: ${response.statusText}`);
        }

        const data = await response.json();
        return data.embedding;
    }

    // Simple keyword search fallback when Ollama is not available
    function keywordSearchDocs(query, dataDir) {
        const results = [];
        const docsDir = path.join(dataDir, 'docs');

        if (!fs.existsSync(docsDir)) {
            return results;
        }

        // Extract keywords (lowercase, filter short words)
        const keywords = query.toLowerCase()
            .split(/\s+/)
            .filter(w => w.length > 2)
            .map(w => w.replace(/[^a-z0-9]/g, ''));

        if (keywords.length === 0) {
            return results;
        }

        // Recursively search docs
        function searchDir(dir, folder = '') {
            const entries = fs.readdirSync(dir, { withFileTypes: true });

            for (const entry of entries) {
                if (entry.isDirectory()) {
                    searchDir(path.join(dir, entry.name), entry.name);
                } else if (entry.name.endsWith('.json')) {
                    try {
                        const docPath = path.join(dir, entry.name);
                        const doc = JSON.parse(fs.readFileSync(docPath, 'utf-8'));
                        const searchText = `${doc.title || ''} ${doc.content || ''}`.toLowerCase();

                        // Count keyword matches
                        let score = 0;
                        for (const kw of keywords) {
                            const matches = (searchText.match(new RegExp(kw, 'g')) || []).length;
                            score += matches;
                            // Boost title matches
                            if ((doc.title || '').toLowerCase().includes(kw)) {
                                score += 3;
                            }
                        }

                        if (score > 0) {
                            results.push({
                                fileName: folder ? `${folder}/${entry.name}` : entry.name,
                                title: doc.title,
                                content: doc.content,
                                score
                            });
                        }
                    } catch (e) {
                        // Skip invalid docs
                    }
                }
            }
        }

        searchDir(docsDir);

        // Sort by score and return top 5
        return results
            .sort((a, b) => b.score - a.score)
            .slice(0, 5);
    }

    // Track active docs agent PTY processes
    const docsAgentPtyProcesses = new Map();

    docsAgentNs.on('connection', (socket) => {
        console.log('📚 Docs agent client connected:', socket.id);

        // Handle stop request
        socket.on('stop', () => {
            const ptyProcess = docsAgentPtyProcesses.get(socket.id);
            if (ptyProcess) {
                console.log('📚 Stopping docs agent PTY process');
                ptyProcess.write('\x03'); // Send Ctrl+C
            }
        });

        socket.on('chat', async ({ message, history, agenticMode = false, boards = [], docContext = null }) => {
            try {
                const repoPath = process.env.GITBOARD_REPO_PATH || process.cwd();
                const dataDir = getDataDir();
                const serverUrl = `http://localhost:${port}`;

                // Find Claude CLI
                let claudePath = 'claude';
                try {
                    const whichResult = execSync('which claude', { encoding: 'utf-8' });
                    claudePath = whichResult.trim();
                } catch (err) {
                    console.error('📚 Claude CLI not found');
                    socket.emit('error', 'Claude CLI not found');
                    return;
                }

                console.log('📚 Docs agent query:', message.substring(0, 100) + '...');
                console.log('📚 Agentic mode:', agenticMode);
                console.log('📚 Doc context:', docContext);

                // Load active document content if docContext is provided
                let activeDocContent = '';
                let docImagePaths = [];
                if (docContext && docContext.slug) {
                    try {
                        const docPath = docContext.folder
                            ? path.join(dataDir, 'docs', docContext.folder, `${docContext.slug}.json`)
                            : path.join(dataDir, 'docs', `${docContext.slug}.json`);

                        if (fs.existsSync(docPath)) {
                            const docData = JSON.parse(fs.readFileSync(docPath, 'utf-8'));

                            // Load attached images for this document
                            const docId = docContext.folder ? `${docContext.folder}/${docContext.slug}` : docContext.slug;
                            const filesMetadataDir = path.join(dataDir, 'files', 'docs', docId);
                            let imagesList = '';

                            if (fs.existsSync(filesMetadataDir)) {
                                const fileEntries = fs.readdirSync(filesMetadataDir).filter(f => f.endsWith('.json'));
                                for (const fileEntry of fileEntries) {
                                    try {
                                        const fileMeta = JSON.parse(fs.readFileSync(path.join(filesMetadataDir, fileEntry), 'utf-8'));
                                        if (fileMeta.mime_type && fileMeta.mime_type.startsWith('image/')) {
                                            // Construct the full path to the image file using storage_path
                                            const imagePath = path.join(dataDir, 'uploads', fileMeta.storage_path);
                                            if (fs.existsSync(imagePath)) {
                                                docImagePaths.push({
                                                    filename: fileMeta.original_filename,
                                                    path: imagePath,
                                                    mimeType: fileMeta.mime_type
                                                });
                                            }
                                        }
                                    } catch (e) {
                                        // Skip invalid file metadata
                                    }
                                }

                                if (docImagePaths.length > 0) {
                                    imagesList = `\n\n### Attached Images (${docImagePaths.length}):\nYou can view these images using the Read tool to understand their content:\n${docImagePaths.map(img => `- ${img.filename}: ${img.path}`).join('\n')}`;
                                    console.log(`📚 Found ${docImagePaths.length} attached images for document`);
                                }
                            }

                            activeDocContent = `
## ACTIVE DOCUMENT: ${docData.title || docContext.title}
${docContext.folder ? `Folder: ${docContext.folder}` : ''}
Slug: ${docContext.slug}

### Document Content:
${docData.content || '(No content)'}${imagesList}

---
`;
                            console.log(`📚 Loaded active document: ${docContext.title || docContext.slug}`);
                        }
                    } catch (docErr) {
                        console.error('📚 Failed to load active document:', docErr.message);
                    }
                }

                // Build documentation context from RAG (with keyword fallback)
                let docsContext = 'No relevant documentation found.';
                let sources = [];
                let usingFallback = false;

                try {
                    const vs = await initDocsVectorStore();
                    if (vs) {
                        const queryEmbedding = await generateQueryEmbedding(message);
                        const results = await vs.query({
                            indexName: DOCS_INDEX_NAME,
                            queryVector: queryEmbedding,
                            topK: 5,
                            minScore: 0.25,
                            includeVector: false,
                        });

                        if (results.length > 0) {
                            sources = [...new Set(results.map(r => r.metadata?.fileName).filter(Boolean))];
                            docsContext = results.map(r => `[Source: ${r.metadata?.fileName}]\n${r.metadata?.text}`).join('\n\n---\n\n');
                            console.log(`📚 Found ${results.length} relevant chunks from ${sources.length} sources`);
                            socket.emit('sources', { sources });
                        }
                    } else {
                        throw new Error('Vector store not available');
                    }
                } catch (searchError) {
                    console.error('📚 RAG search error, falling back to keyword search:', searchError.message);
                    usingFallback = true;

                    // Fallback to simple keyword search
                    const keywordResults = keywordSearchDocs(message, dataDir);
                    if (keywordResults.length > 0) {
                        sources = keywordResults.map(r => r.fileName);
                        docsContext = keywordResults.map(r => {
                            // Truncate content to ~500 chars for context
                            const truncatedContent = r.content && r.content.length > 500
                                ? r.content.substring(0, 500) + '...'
                                : r.content || '';
                            return `[Source: ${r.fileName}]\n# ${r.title}\n${truncatedContent}`;
                        }).join('\n\n---\n\n');
                        console.log(`📚 Keyword fallback found ${keywordResults.length} docs`);
                        socket.emit('sources', { sources });
                    }

                    // Notify client about fallback mode
                    socket.emit('fallback', {
                        message: 'Semantic search unavailable. Using keyword search instead. For better results, ensure Ollama is running with nomic-embed-text model.'
                    });
                }

                // Build system prompt
                const systemPrompt = `You are a helpful documentation assistant for GitBoard, a git-native project management tool.
${activeDocContent ? `
${activeDocContent}
` : ''}
RELATED DOCUMENTATION (${usingFallback ? 'keyword search' : 'semantic search'}):
${docsContext}

CAPABILITIES:
1. Answer questions based on the documentation context above
2. Search the codebase using Glob, Grep, and Read tools
3. View attached images using the Read tool (images are listed above if present)
4. Create tasks/tickets using the API

TASK CREATION:
${boards.length > 1 ? `Available boards: ${boards.map(b => `"${b.name}" (id: ${b.id})`).join(', ')}

When users ask you to create tasks, tickets, or work items:
1. FIRST, ask the user which board they want to add the tasks to (list the available boards above)
2. Wait for their response before creating any tasks
3. Once you know the board, analyze the request and identify all items that need tasks
4. For EACH item, create a ticket by making an HTTP POST request to the API:` : `When users ask you to create tasks, tickets, or work items:
1. First, analyze the request and identify all items that need tasks
2. For EACH item, create a ticket by making an HTTP POST request to the API:`}

   curl -X POST ${serverUrl}/api/tickets \\
     -H "Content-Type: application/json" \\
     -d '{"title": "Task title", "description": "Description", "priority": "medium", "boardId": "${boards.length === 1 ? boards[0].id : 'BOARD_ID_FROM_USER'}"}'

${boards.length > 1 ? '5.' : '3.'} You can create multiple tickets by calling the API multiple times
${boards.length > 1 ? '6.' : '4.'} After creating tickets, confirm what was created

For batch creation, you can also POST an array:
   curl -X POST ${serverUrl}/api/tickets \\
     -H "Content-Type: application/json" \\
     -d '{"boardId": "${boards.length === 1 ? boards[0].id : 'BOARD_ID_FROM_USER'}", "tickets": [{"title": "Task 1", "description": "..."}, {"title": "Task 2", "description": "..."}]}'

GUIDELINES:
- Keep responses concise and focused
- Reference documentation sources when relevant
- When creating tasks, analyze the full context before deciding what tasks to create
- Create separate, well-defined tickets for each distinct item or requirement`;

                // Format conversation history for context
                const conversationContext = history && history.length > 0
                    ? history.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n\n')
                    : '';

                const fullPrompt = conversationContext
                    ? `${conversationContext}\n\nUser: ${message}`
                    : message;

                if (agenticMode) {
                    // ============================================
                    // AGENTIC MODE - Full PTY with all tools
                    // ============================================
                    console.log('📚 Starting agentic docs agent with PTY');

                    const claudeArgs = [
                        '--dangerously-skip-permissions',
                        '--system-prompt', systemPrompt,
                        '-p', fullPrompt
                    ];

                    const ptyProcess = pty.spawn(claudePath, claudeArgs, {
                        name: 'xterm-color',
                        cols: 100,
                        rows: 30,
                        cwd: repoPath,
                        env: process.env
                    });

                    docsAgentPtyProcesses.set(socket.id, ptyProcess);

                    let buffer = '';

                    ptyProcess.onData((data) => {
                        buffer += data;
                        socket.emit('stream', { content: data });
                    });

                    ptyProcess.onExit(({ exitCode }) => {
                        console.log('📚 Docs agent PTY exited, code:', exitCode);
                        docsAgentPtyProcesses.delete(socket.id);
                        socket.emit('complete', {
                            content: buffer,
                            sources: sources
                        });
                    });

                } else {
                    // ============================================
                    // SIMPLE MODE - Single response with limited tools
                    // ============================================
                    console.log('📚 Starting simple docs agent');

                    const { spawn } = require('child_process');
                    const args = [
                        '--print',
                        fullPrompt,
                        '--system-prompt',
                        systemPrompt,
                        '--allowedTools',
                        'Glob,Grep,Read'
                    ];

                    const claude = spawn(claudePath, args, {
                        cwd: repoPath,
                        env: process.env,
                        stdio: ['pipe', 'pipe', 'pipe']
                    });

                    claude.stdin.end();

                    let output = '';

                    claude.stdout.on('data', (data) => {
                        const text = data.toString();
                        output += text;
                        socket.emit('stream', { content: text });
                    });

                    claude.stderr.on('data', (data) => {
                        console.log('📚 stderr:', data.toString());
                    });

                    claude.on('close', (code) => {
                        console.log('📚 Docs agent response closed, code:', code);

                        if (code !== 0) {
                            socket.emit('error', `Process exited with code ${code}`);
                            return;
                        }

                        socket.emit('complete', {
                            content: output.trim(),
                            sources: sources
                        });
                    });

                    claude.on('error', (error) => {
                        console.error('📚 Docs agent error:', error);
                        socket.emit('error', error.message);
                    });
                }
            } catch (error) {
                console.error('Error in docs agent chat:', error);
                socket.emit('error', error.message);
            }
        });

        socket.on('disconnect', () => {
            console.log('👋 Docs agent client disconnected:', socket.id);
            // Clean up PTY process if exists
            const ptyProcess = docsAgentPtyProcesses.get(socket.id);
            if (ptyProcess) {
                ptyProcess.kill();
                docsAgentPtyProcesses.delete(socket.id);
            }
        });
    });

    // Skill Creator namespace for conversational skill creation
    const skillCreatorNs = io.of('/skill-creator');

    skillCreatorNs.on('connection', (socket) => {
        console.log('🔧 Skill creator client connected:', socket.id);

        socket.on('create-skill', async ({ message, history, currentSkill }) => {
            try {
                // Find Claude CLI
                const { execSync } = require('child_process');
                let claudePath = 'claude';
                try {
                    const whichResult = execSync('which claude', { encoding: 'utf-8' });
                    claudePath = whichResult.trim();
                    console.log('🔧 Found Claude CLI:', claudePath);
                } catch (err) {
                    console.error('🔧 Claude CLI not found in PATH');
                    socket.emit('error', 'Claude CLI not found. Please install Claude CLI to use this feature.');
                    return;
                }

                console.log('🔧 Skill creator query:', message.substring(0, 100) + '...');
                if (currentSkill) {
                    console.log('🔧 Editing existing skill:', currentSkill.name);
                }

                // Get repository path for codebase access
                const repoPath = process.env.GITBOARD_REPO_PATH || process.cwd();
                console.log('🔧 Repository path for skill creator:', repoPath);

                // Search skills.sh for existing skills (only on first message)
                let onlineSkillsContext = '';
                if (!history || history.length === 0) {
                    try {
                        console.log('🔧 Searching skills.sh for:', message.substring(0, 50));
                        const searchQuery = encodeURIComponent(message.substring(0, 100));
                        const response = await fetch(`https://skills.sh/?q=${searchQuery}`, {
                            headers: {
                                'User-Agent': 'GitBoard/1.0',
                                'Accept': 'text/html',
                            },
                        });

                        if (response.ok) {
                            const html = await response.text();
                            // Extract skill links from the page
                            const skillMatches = html.match(/href="(\/skill\/[^"]+)"[^>]*>([^<]+)</gi) || [];
                            const skills = [];
                            for (const match of skillMatches.slice(0, 5)) {
                                const parts = match.match(/href="(\/skill\/[^"]+)"[^>]*>([^<]+)</i);
                                if (parts) {
                                    const skillPath = parts[1];
                                    const skillName = parts[2].trim();
                                    // Extract repo and skill name from path like /skill/anthropics/skills/frontend-design
                                    const pathParts = skillPath.split('/').filter(Boolean);
                                    // pathParts: ['skill', 'owner', 'repo', 'skill-name']
                                    if (pathParts.length >= 4) {
                                        const owner = pathParts[1];
                                        const repo = pathParts[2];
                                        const skillId = pathParts[3];
                                        skills.push({
                                            url: `https://skills.sh${skillPath}`,
                                            name: skillName,
                                            installCmd: `npx skills add https://github.com/${owner}/${repo} --skill ${skillId}`
                                        });
                                    } else {
                                        skills.push({
                                            url: `https://skills.sh${skillPath}`,
                                            name: skillName,
                                            installCmd: null
                                        });
                                    }
                                }
                            }

                            if (skills.length > 0) {
                                const skillsList = skills.map(s => {
                                    if (s.installCmd) {
                                        return `- ${s.name}
  Browse: ${s.url}
  Install: \`${s.installCmd}\``;
                                    }
                                    return `- ${s.name}: ${s.url}`;
                                }).join('\n');

                                onlineSkillsContext = `\n\nONLINE SKILLS FOUND on skills.sh:
${skillsList}

When responding, FIRST present these existing skills with their install commands. Ask if the user wants to install one of these (they can run the npx command) or if they'd prefer to create a custom skill.`;
                                console.log('🔧 Found', skills.length, 'online skills');
                            }
                        }
                    } catch (searchErr) {
                        console.log('🔧 Could not search skills.sh:', searchErr.message);
                    }
                }

                // Build system prompt for skill creation
                const systemPrompt = `You are an AI assistant helping users find or create reusable skills for AI agents following the agentskills.io specification.

FORMATTING RULES - CRITICAL:
Respond in PLAIN TEXT ONLY. The chat interface does NOT render markdown, so all markdown symbols appear as raw text.
Do NOT use any markdown formatting including:
- Asterisks (*) for bold or italic
- Hash symbols (#) for headers
- Backticks (\`) for code or code blocks
- Dashes or asterisks at line start for bullet points (use plain numbers like 1. 2. 3. instead)
- Any other markdown syntax
When showing commands, write them as plain text inline, like: Run this command: npx skills add <url>

REPOSITORY CONTEXT:
You have access to the user's codebase at: ${repoPath}

You have the following tools available to understand the project:
- Glob: Find files by pattern (e.g., "**/*.tsx" for all TypeScript React files, "src/components/**" for component files)
- Grep: Search file contents for patterns (e.g., function definitions, imports, specific code patterns)
- Read: Read full file contents to examine implementations, understand patterns, and see code structure
- WebFetch: Fetch content from URLs when you need external documentation or examples

PROACTIVE CODEBASE EXPLORATION:
Before and while helping create skills, you should:
1. SEARCH THE CODEBASE FIRST to understand existing patterns, conventions, and similar implementations
   - Use Glob to find relevant files related to the skill the user wants to create
   - Use Grep to search for specific patterns, function names, or implementations
   - Use Read to examine files and understand coding conventions, structure, and patterns
2. SHARE RELEVANT FINDINGS with the user - explain what you found and how it informs the skill design
3. USE CODEBASE CONTEXT to make skills more relevant and useful for the specific project
4. ONLY ASK CLARIFYING QUESTIONS for information that cannot be determined from the code

Your role is to:
1. FIRST, check if there are existing skills from skills.sh that might match what the user wants (if provided in context)
2. If online skills are found, present them with their INSTALL COMMANDS so the user can easily add them
3. If user wants a custom skill instead, EXPLORE THE CODEBASE to understand the project context
4. Ask clarifying questions about the skill's purpose and use cases (informed by what you found in the code)
5. Help define when the skill should be triggered
6. Guide the user through creating effective instructions that are tailored to their project

INSTALLING EXISTING SKILLS:
When you find matching skills on skills.sh, provide the install command as plain text like this:

Run this command: npx skills add <github-repo-url> --skill <skill-name>

For example, if you find a "code-review" skill from anthropics/skills repo:

Run this command: npx skills add https://github.com/anthropics/skills --skill code-review

This installs the skill to the user's .claude/skills/ folder where Claude Code can use it.

CREATING CUSTOM SKILLS:
When you have gathered enough information to create a complete custom skill, output the skill definition in this exact format at the end of your response:

---SKILL_READY---
{
  "name": "Skill Name",
  "description": "Brief description of what this skill does",
  "license": "MIT",
  "version": "1.0.0",
  "compatibility": {
    "agents": [],
    "providers": []
  },
  "instructions": "Full markdown instructions for the skill"
}
---END_SKILL_READY---

IMPORTANT:
- If online skills are provided, ALWAYS present them first with install commands
- Ask if user wants to install an existing skill OR create a custom one
- Only proceed to custom skill creation if user explicitly wants custom
- Ask at least 2-3 clarifying questions before generating the final skill
- Make the instructions detailed and actionable
- Include examples in the instructions when helpful
- Do NOT output the SKILL_READY block until you have enough information
- Keep your conversational responses friendly and helpful${onlineSkillsContext}${currentSkill ? `

CURRENT SKILL BEING EDITED:
You are helping the user modify an existing skill. Here is the current skill configuration:

Name: ${currentSkill.name}
Description: ${currentSkill.description || '(none)'}
Version: ${currentSkill.version || '1.0.0'}
License: ${currentSkill.license || 'MIT'}
Compatible Agents: ${currentSkill.compatibility?.agents?.join(', ') || '(any)'}
Compatible Providers: ${currentSkill.compatibility?.providers?.join(', ') || '(any)'}
Instructions:
${currentSkill.instructions || '(none)'}

The user wants to modify this skill. Listen to their requested changes and when ready, output the updated skill definition using the SKILL_READY format. Preserve any fields the user doesn't explicitly want to change.` : ''}`;

                // Format conversation history
                const conversationText = history && history.length > 0
                    ? history.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n\n')
                    : '';

                const userPrompt = conversationText
                    ? `${conversationText}\n\nUser: ${message}`
                    : `User: ${message}`;

                // Spawn claude for the response with codebase access
                const { spawn } = require('child_process');
                const args = [
                    '--print',
                    userPrompt,
                    '--system-prompt',
                    systemPrompt,
                    '--allowedTools',
                    'Glob,Grep,Read,WebFetch'
                ];

                const claude = spawn(claudePath, args, {
                    cwd: repoPath,
                    env: process.env,
                    stdio: ['pipe', 'pipe', 'pipe']
                });

                claude.stdin.end();

                let output = '';

                claude.stdout.on('data', (data) => {
                    const text = data.toString();
                    output += text;
                    socket.emit('stream', { content: text });
                });

                claude.stderr.on('data', (data) => {
                    console.log('🔧 stderr:', data.toString());
                });

                claude.on('close', (code) => {
                    console.log('🔧 Skill creator response closed, code:', code);

                    if (code !== 0) {
                        socket.emit('error', `Process exited with code ${code}`);
                        return;
                    }

                    // Parse the response to extract skill if present
                    let responseContent = output.trim();
                    let skill = null;

                    const skillMatch = responseContent.match(/---SKILL_READY---\s*([\s\S]*?)\s*---END_SKILL_READY---/);
                    if (skillMatch) {
                        try {
                            skill = JSON.parse(skillMatch[1]);
                            // Remove skill block from the displayed message
                            responseContent = responseContent.replace(/---SKILL_READY---[\s\S]*?---END_SKILL_READY---/, '').trim();
                            console.log('✅ Skill ready:', skill.name);
                            socket.emit('skill-generated', { skill });
                        } catch (parseError) {
                            console.error('Failed to parse skill:', parseError);
                        }
                    }

                    socket.emit('complete', {
                        content: responseContent
                    });
                });

                claude.on('error', (error) => {
                    console.error('🔧 Skill creator error:', error);
                    socket.emit('error', error.message);
                });
            } catch (error) {
                console.error('Error in skill creator:', error);
                socket.emit('error', error.message);
            }
        });

        socket.on('disconnect', () => {
            console.log('👋 Skill creator client disconnected:', socket.id);
        });
    });

    // Agent Creator namespace for conversational AI agent creation
    const agentCreatorNs = io.of('/agent-creator');

    agentCreatorNs.on('connection', (socket) => {
        console.log('🤖 Agent creator client connected:', socket.id);

        socket.on('create-agent', async ({ message, history, currentAgent }) => {
            try {
                // Find Claude CLI
                const { execSync } = require('child_process');
                let claudePath = 'claude';
                try {
                    const whichResult = execSync('which claude', { encoding: 'utf-8' });
                    claudePath = whichResult.trim();
                    console.log('🤖 Found Claude CLI:', claudePath);
                } catch (err) {
                    console.error('🤖 Claude CLI not found in PATH');
                    socket.emit('error', 'Claude CLI not found. Please install Claude CLI to use this feature.');
                    return;
                }

                console.log('🤖 Agent creator query:', message.substring(0, 100) + '...');

                // Get repository path for codebase access
                const repoPath = process.env.GITBOARD_REPO_PATH || process.cwd();
                console.log('🤖 Repository path for agent creator:', repoPath);

                // Build context about current agent being edited (if any)
                let editModeContext = '';
                if (currentAgent) {
                    editModeContext = `

CURRENT AGENT BEING EDITED:
The user is editing an existing agent with these settings:
- Name: ${currentAgent.name || 'Not set'}
- Description: ${currentAgent.description || 'Not set'}
- Execution Type: ${currentAgent.executionType || 'cli'}
- Provider: ${currentAgent.provider || 'anthropic'}
- Model: ${currentAgent.model || 'Not set'}
- System Prompt: ${currentAgent.systemPrompt ? currentAgent.systemPrompt.substring(0, 200) + '...' : 'Not set'}
- Terminal Instructions: ${currentAgent.terminalInstructions ? currentAgent.terminalInstructions.substring(0, 200) + '...' : 'Not set'}
- Artifact Template: ${currentAgent.artifactTemplate ? 'Configured' : 'Not configured'}

Help them modify or improve this agent based on their request.`;
                }

                // Build system prompt for agent creation
                const systemPrompt = `You are an AI assistant helping users create and configure AI agents for their development workflow.

FORMATTING RULES - CRITICAL:
Respond in PLAIN TEXT ONLY. The chat interface does NOT render markdown, so all markdown symbols appear as raw text.
Do NOT use any markdown formatting including:
- Asterisks (*) for bold or italic
- Hash symbols (#) for headers
- Backticks (\`) for code or code blocks
- Dashes or asterisks at line start for bullet points (use plain numbers like 1. 2. 3. instead)
- Any other markdown syntax

REPOSITORY CONTEXT:
You have access to the user's codebase at: ${repoPath}

You have the following tools available to understand the project:
- Glob: Find files by pattern (e.g., "**/*.tsx" for TypeScript React files)
- Grep: Search file contents for patterns
- Read: Read full file contents to examine implementations
- WebFetch: Fetch content from URLs when needed

AGENT CONFIGURATION OPTIONS:
1. Execution Type:
   - CLI: Uses local Claude CLI (recommended for most cases). No API key needed.
   - API: Uses direct API calls. Requires model selection and API key.

2. Providers (for API execution):
   - anthropic: Claude models (claude-3-5-sonnet-20241022, claude-3-opus-20240229, claude-3-sonnet-20240229, claude-3-haiku-20240307)
   - openai: GPT models (gpt-4-turbo-preview, gpt-4, gpt-3.5-turbo)

3. System Prompt: Custom instructions that define the agent's behavior and expertise.

4. Terminal Instructions: Instructions displayed when launching an agent session. These appear in the terminal to guide users on what to do. Leave empty for no instructions. Example: "1. Read the ticket file 2. Complete the work 3. Commit your changes"

5. Artifact Template (optional): Free-form text instructions that define how the agent should format its generated artifacts (reports, documentation, reviews, etc.). This is a simple text field - just describe the structure and format you want the agent to follow when generating outputs.

YOUR ROLE:
1. Help users define their agent's purpose and capabilities
2. Ask clarifying questions about:
   - What tasks the agent should perform
   - What expertise or personality it should have
   - Whether they need CLI (local) or API execution
   - Any specific constraints or focus areas
3. EXPLORE THE CODEBASE to understand the project and tailor the agent accordingly
4. Generate a comprehensive system prompt based on the user's needs and codebase context
5. Suggest appropriate configuration settings

When you have gathered enough information to create a complete agent configuration, output it in this exact format at the end of your response:

---AGENT_READY---
{
  "name": "Agent Name",
  "description": "Brief description of what this agent does",
  "executionType": "cli",
  "provider": "anthropic",
  "model": "",
  "systemPrompt": "Detailed system prompt with instructions for the agent...",
  "terminalInstructions": "1. Read the ticket file to understand the task\\n2. Complete the work described in the ticket\\n3. Commit your changes to this feature branch",
  "artifactTemplate": "When generating reports, use this structure:\\n1. Summary - Brief overview\\n2. Details - In-depth analysis\\n3. Recommendations - Next steps"
}
---END_AGENT_READY---

Note: The artifactTemplate field is optional. Only include it for agents that generate formatted outputs (reports, documentation, reviews). Omit it for task-oriented agents.

IMPORTANT:
- Ask at least 1-2 clarifying questions before generating the final agent configuration
- If the user's requirements are clear from the start, you can generate the agent sooner
- For CLI execution, leave model empty (the local CLI determines the model)
- For API execution, suggest an appropriate model
- Make the system prompt detailed, specific, and actionable
- Include examples and guidelines in the system prompt when helpful
- For terminalInstructions, suggest appropriate guidance based on the agent's purpose
- For artifactTemplate, provide simple text instructions describing the format. Omit entirely for task-oriented agents.
- Do NOT output the AGENT_READY block until you have enough information
- Keep responses friendly and helpful${editModeContext}`;

                // Format conversation history
                const conversationText = history && history.length > 0
                    ? history.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n\n')
                    : '';

                const userPrompt = conversationText
                    ? `${conversationText}\n\nUser: ${message}`
                    : `User: ${message}`;

                // Spawn claude for the response with codebase access
                const { spawn } = require('child_process');
                const args = [
                    '--print',
                    userPrompt,
                    '--system-prompt',
                    systemPrompt,
                    '--allowedTools',
                    'Glob,Grep,Read,WebFetch'
                ];

                const claude = spawn(claudePath, args, {
                    cwd: repoPath,
                    env: process.env,
                    stdio: ['pipe', 'pipe', 'pipe']
                });

                claude.stdin.end();

                let output = '';

                claude.stdout.on('data', (data) => {
                    const text = data.toString();
                    output += text;
                    socket.emit('stream', { content: text });
                });

                claude.stderr.on('data', (data) => {
                    console.log('🤖 stderr:', data.toString());
                });

                claude.on('close', (code) => {
                    console.log('🤖 Agent creator response closed, code:', code);

                    if (code !== 0) {
                        socket.emit('error', `Process exited with code ${code}`);
                        return;
                    }

                    // Parse the response to extract agent if present
                    let responseContent = output.trim();
                    let agent = null;

                    const agentMatch = responseContent.match(/---AGENT_READY---\s*([\s\S]*?)\s*---END_AGENT_READY---/);
                    if (agentMatch) {
                        try {
                            agent = JSON.parse(agentMatch[1]);
                            // Remove agent block from the displayed message
                            responseContent = responseContent.replace(/---AGENT_READY---[\s\S]*?---END_AGENT_READY---/, '').trim();
                            console.log('✅ Agent ready:', agent.name);
                            socket.emit('agent-generated', { agent });
                        } catch (parseError) {
                            console.error('Failed to parse agent:', parseError);
                        }
                    }

                    socket.emit('complete', {
                        content: responseContent
                    });
                });

                claude.on('error', (error) => {
                    console.error('🤖 Agent creator error:', error);
                    socket.emit('error', error.message);
                });
            } catch (error) {
                console.error('Error in agent creator:', error);
                socket.emit('error', error.message);
            }
        });

        socket.on('disconnect', () => {
            console.log('👋 Agent creator client disconnected:', socket.id);
        });
    });

    // MCP Creator namespace for conversational MCP configuration
    const mcpCreatorNs = io.of('/mcp-creator');

    mcpCreatorNs.on('connection', (socket) => {
        console.log('🔌 MCP creator client connected:', socket.id);

        socket.on('create-mcp', async ({ message, history, currentMCP }) => {
            try {
                // Find Claude CLI
                const { execSync } = require('child_process');
                let claudePath = 'claude';
                try {
                    const whichResult = execSync('which claude', { encoding: 'utf-8' });
                    claudePath = whichResult.trim();
                    console.log('🔌 Found Claude CLI:', claudePath);
                } catch (err) {
                    console.error('🔌 Claude CLI not found in PATH');
                    socket.emit('error', 'Claude CLI not found. Please install Claude CLI to use this feature.');
                    return;
                }

                console.log('🔌 MCP creator query:', message.substring(0, 100) + '...');

                // Get repository path
                const repoPath = process.env.GITBOARD_REPO_PATH || process.cwd();
                console.log('🔌 Repository path for MCP creator:', repoPath);

                // Build context about current MCP being edited (if any)
                let editModeContext = '';
                if (currentMCP && currentMCP.name) {
                    editModeContext = `

CURRENT MCP BEING EDITED:
The user is editing an existing MCP server configuration with these settings:
- Name: ${currentMCP.name || 'Not set'}
- Description: ${currentMCP.description || 'Not set'}
- Command: ${currentMCP.command || 'Not set'}
- Arguments: ${currentMCP.args ? currentMCP.args.join(' ') : 'None'}
- Environment Variables: ${currentMCP.env ? Object.keys(currentMCP.env).join(', ') : 'None'}

Help them modify or improve this MCP configuration based on their request.`;
                }

                // Build system prompt for MCP configuration
                const systemPrompt = `You are an AI assistant helping users configure MCP (Model Context Protocol) servers for their AI agents.

FORMATTING RULES - CRITICAL:
Respond in PLAIN TEXT ONLY. The chat interface does NOT render markdown, so all markdown symbols appear as raw text.
Do NOT use any markdown formatting including:
- Asterisks (*) for bold or italic
- Hash symbols (#) for headers
- Backticks (\`) for code or code blocks
- Dashes or asterisks at line start for bullet points (use plain numbers like 1. 2. 3. instead)
- Any other markdown syntax

WHAT IS MCP:
MCP (Model Context Protocol) allows AI agents to connect to external tools and data sources through standardized server implementations. Common MCP servers include:

1. Filesystem MCP - Read/write files on the local system
   Command: npx
   Args: -y, @modelcontextprotocol/server-filesystem, /path/to/allowed/directory

2. GitHub MCP - Interact with GitHub repositories
   Command: npx
   Args: -y, @modelcontextprotocol/server-github
   Env: GITHUB_PERSONAL_ACCESS_TOKEN

3. Slack MCP - Send/receive Slack messages
   Command: npx
   Args: -y, @modelcontextprotocol/server-slack
   Env: SLACK_BOT_TOKEN, SLACK_TEAM_ID

4. PostgreSQL MCP - Query PostgreSQL databases
   Command: npx
   Args: -y, @modelcontextprotocol/server-postgres, postgresql://user:pass@host/db

5. Memory MCP - Persistent key-value storage
   Command: npx
   Args: -y, @modelcontextprotocol/server-memory

6. Brave Search MCP - Web search capabilities
   Command: npx
   Args: -y, @modelcontextprotocol/server-brave-search
   Env: BRAVE_API_KEY

7. Puppeteer MCP - Browser automation
   Command: npx
   Args: -y, @modelcontextprotocol/server-puppeteer

8. Google Drive MCP - Access Google Drive files
   Command: npx
   Args: -y, @anthropics/mcp-server-gdrive
   Env: (requires OAuth setup)

YOUR ROLE:
1. Help users understand what MCP servers are available
2. Ask clarifying questions about:
   - What capabilities they need (filesystem, database, API access, etc.)
   - What paths or credentials they'll need to configure
   - Security considerations for their use case
3. Generate the correct command, arguments, and environment variables
4. Explain any security implications of the configuration

CONFIGURATION FORMAT:
When you have enough information to configure an MCP server, output it in this exact format:

---MCP_READY---
{
  "name": "Descriptive Name",
  "description": "Brief description of what this MCP server provides",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-xxx", "additional-args"],
  "env": {
    "API_KEY": "placeholder_value"
  }
}
---END_MCP_READY---

IMPORTANT:
- Ask clarifying questions if the user's requirements are unclear
- For environment variables with secrets, use placeholder values and explain they need to be filled in
- Validate that required arguments and environment variables are included
- For filesystem MCP, always ask which directory should be accessible
- For database MCPs, explain the connection string format
- Warn about security implications of broad access permissions
- Keep responses friendly and helpful${editModeContext}`;

                // Format conversation history
                const conversationText = history && history.length > 0
                    ? history.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n\n')
                    : '';

                const userPrompt = conversationText
                    ? `${conversationText}\n\nUser: ${message}`
                    : `User: ${message}`;

                // Spawn claude for the response
                const { spawn } = require('child_process');
                const args = [
                    '--print',
                    userPrompt,
                    '--system-prompt',
                    systemPrompt,
                    '--allowedTools',
                    'WebFetch,WebSearch'
                ];

                const claude = spawn(claudePath, args, {
                    cwd: repoPath,
                    env: process.env,
                    stdio: ['pipe', 'pipe', 'pipe']
                });

                claude.stdin.end();

                let output = '';

                claude.stdout.on('data', (data) => {
                    const text = data.toString();
                    output += text;
                    socket.emit('stream', { content: text });
                });

                claude.stderr.on('data', (data) => {
                    console.log('🔌 stderr:', data.toString());
                });

                claude.on('close', (code) => {
                    console.log('🔌 MCP creator response closed, code:', code);

                    if (code !== 0) {
                        socket.emit('error', `Process exited with code ${code}`);
                        return;
                    }

                    // Parse the response to extract MCP config if present
                    let responseContent = output.trim();
                    let mcp = null;

                    const mcpMatch = responseContent.match(/---MCP_READY---\s*([\s\S]*?)\s*---END_MCP_READY---/);
                    if (mcpMatch) {
                        try {
                            mcp = JSON.parse(mcpMatch[1]);
                            // Remove MCP block from the displayed message
                            responseContent = responseContent.replace(/---MCP_READY---[\s\S]*?---END_MCP_READY---/, '').trim();
                            console.log('✅ MCP ready:', mcp.name);
                            socket.emit('mcp-generated', { mcp });
                        } catch (parseError) {
                            console.error('Failed to parse MCP config:', parseError);
                        }
                    }

                    socket.emit('complete', {
                        content: responseContent
                    });
                });

                claude.on('error', (error) => {
                    console.error('🔌 MCP creator error:', error);
                    socket.emit('error', error.message);
                });
            } catch (error) {
                console.error('Error in MCP creator:', error);
                socket.emit('error', error.message);
            }
        });

        socket.on('disconnect', () => {
            console.log('👋 MCP creator client disconnected:', socket.id);
        });
    });

    server.listen(port, () => {
        console.log(`> Ready on http://${hostname}:${port}`);
    });
});
