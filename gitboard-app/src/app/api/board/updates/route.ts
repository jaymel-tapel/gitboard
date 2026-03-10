import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { join, dirname, basename } from 'path';
import { existsSync, statSync, readFileSync } from 'fs';
import { execSync } from 'child_process';
import { DEFAULT_STATUSES } from '@/lib/schemas';

// Cache the data path
let cachedDataPath: string | null = null;

/**
 * Detect standalone data path (.gitboard/data/ structure)
 */
function detectStandaloneDataPath(): string | null {
    if (process.env.GITBOARD_DATA_PATH) {
        return process.env.GITBOARD_DATA_PATH;
    }

    const cwd = process.cwd();
    const parentDir = dirname(cwd);
    const parentName = basename(parentDir);
    const cwdName = basename(cwd);

    // Standalone mode: running from .gitboard/app/
    if (parentName === '.gitboard' && (cwdName === 'app' || cwdName === 'gitboard-app')) {
        const dataPath = join(parentDir, 'data');
        if (existsSync(dataPath)) {
            return dataPath;
        }
    }

    // Also check parent's parent for nested structures
    const grandparentDir = dirname(parentDir);
    const grandparentName = basename(grandparentDir);
    if (grandparentName === '.gitboard') {
        const dataPath = join(grandparentDir, 'data');
        if (existsSync(dataPath)) {
            return dataPath;
        }
    }

    return null;
}

/**
 * Get the data directory path (handles standalone mode)
 */
function getDataPath(): string {
    if (cachedDataPath) return cachedDataPath;

    // 1. Check for standalone mode
    const standalonePath = detectStandaloneDataPath();
    if (standalonePath) {
        cachedDataPath = standalonePath;
        return cachedDataPath;
    }

    // 2. Check environment variable
    if (process.env.GITBOARD_REPO_PATH) {
        cachedDataPath = join(process.env.GITBOARD_REPO_PATH, 'gitboard');
        return cachedDataPath;
    }

    // 3. Try to get git root
    try {
        const gitRoot = execSync('git rev-parse --show-toplevel', {
            encoding: 'utf-8',
            cwd: process.cwd(),
        }).trim();

        if (existsSync(join(gitRoot, 'gitboard'))) {
            cachedDataPath = join(gitRoot, 'gitboard');
            return cachedDataPath;
        }
    } catch {
        // Git command failed
    }

    // 4. Traverse up looking for gitboard/ or .gitboard/data/
    let current = process.cwd();
    for (let i = 0; i < 10; i++) {
        if (existsSync(join(current, 'gitboard'))) {
            cachedDataPath = join(current, 'gitboard');
            return cachedDataPath;
        }
        if (existsSync(join(current, '.gitboard', 'data'))) {
            cachedDataPath = join(current, '.gitboard', 'data');
            return cachedDataPath;
        }
        const parent = dirname(current);
        if (parent === current) break;
        current = parent;
    }

    // 5. Fallback
    cachedDataPath = join(process.cwd(), '..', 'gitboard');
    return cachedDataPath;
}

function getStatusIds(boardId: string): string[] {
    const dataPath = getDataPath();

    // Check board-specific statuses from board.json
    const boardMetaPath = join(dataPath, 'boards', boardId, 'board.json');
    try {
        if (existsSync(boardMetaPath)) {
            const boardContent = readFileSync(boardMetaPath, 'utf-8');
            const board = JSON.parse(boardContent);
            if (board.statuses && Array.isArray(board.statuses) && board.statuses.length > 0) {
                return board.statuses.map((s: { id: string }) => s.id);
            }
        }
    } catch {
        // Fall through to config
    }

    // Fall back to config statuses
    const configPath = join(dataPath, 'config.json');
    try {
        if (existsSync(configPath)) {
            const configContent = readFileSync(configPath, 'utf-8');
            const config = JSON.parse(configContent);
            if (config.statuses && Array.isArray(config.statuses) && config.statuses.length > 0) {
                return config.statuses.map((s: { id: string }) => s.id);
            }
        }
    } catch {
        // Config doesn't exist or is invalid, use defaults
    }

    return DEFAULT_STATUSES.map(s => s.id);
}

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const boardId = searchParams.get('boardId') || 'default';

        const dataPath = getDataPath();
        const ticketsPath = join(dataPath, 'boards', boardId, 'tickets');

        // Get statuses dynamically from config/board
        const statusIds = getStatusIds(boardId);

        // Get the latest modification time from all ticket directories
        let lastModified = 0;
        const stats: Record<string, number> = {};

        for (const status of statusIds) {
            stats[status] = 0;
            const statusPath = join(ticketsPath, status);
            if (existsSync(statusPath)) {
                try {
                    const dirStats = statSync(statusPath);
                    if (dirStats.mtimeMs > lastModified) {
                        lastModified = dirStats.mtimeMs;
                    }
                } catch {
                    // Ignore errors
                }
            }
        }

        // Also check board.json for changes
        const boardMetaPath = join(dataPath, 'boards', boardId, 'board.json');
        if (existsSync(boardMetaPath)) {
            try {
                const boardMetaStats = statSync(boardMetaPath);
                if (boardMetaStats.mtimeMs > lastModified) {
                    lastModified = boardMetaStats.mtimeMs;
                }
            } catch {
                // Ignore errors
            }
        }

        // Also check config.json for status changes
        const configPath = join(dataPath, 'config.json');
        if (existsSync(configPath)) {
            try {
                const configStats = statSync(configPath);
                if (configStats.mtimeMs > lastModified) {
                    lastModified = configStats.mtimeMs;
                }
            } catch {
                // Ignore errors
            }
        }

        return NextResponse.json({
            lastModified,
            stats: { ...stats, total: 0 },
            timestamp: Date.now(),
        });
    } catch (error) {
        console.error('Failed to check for updates:', error);
        return NextResponse.json({
            lastModified: 0,
            stats: { total: 0 },
            timestamp: Date.now(),
        });
    }
}
