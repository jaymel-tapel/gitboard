import { existsSync } from 'fs';
import { dirname, basename, join } from 'path';

/**
 * Detect the project root directory.
 *
 * In standalone mode (running from .gitboard/app/), returns the parent of .gitboard/
 * In development mode, returns GITBOARD_REPO_PATH or process.cwd()
 *
 * This is used by API routes that need to access the host project's files.
 */
export function getProjectRoot(): string {
    // Check for explicit env var first
    if (process.env.GITBOARD_REPO_PATH) {
        return process.env.GITBOARD_REPO_PATH;
    }

    const cwd = process.cwd();
    const parentDir = dirname(cwd);
    const parentName = basename(parentDir);
    const cwdName = basename(cwd);

    // Detect standalone mode: running from .gitboard/app/
    if (cwdName === 'app' && parentName === '.gitboard') {
        // Return the project root (parent of .gitboard/)
        return dirname(parentDir);
    }

    // Default to cwd (dev mode)
    return cwd;
}

/**
 * Check if running in standalone mode (.gitboard/app/)
 */
export function isStandaloneMode(): boolean {
    const cwd = process.cwd();
    const parentDir = dirname(cwd);
    const parentName = basename(parentDir);
    const cwdName = basename(cwd);

    return cwdName === 'app' && parentName === '.gitboard';
}

/**
 * Get the data directory path.
 *
 * In standalone mode: .gitboard/data/
 * In dev mode: gitboard/
 */
export function getDataDir(): string {
    if (process.env.GITBOARD_DATA_PATH) {
        return process.env.GITBOARD_DATA_PATH;
    }

    const cwd = process.cwd();
    const parentDir = dirname(cwd);
    const parentName = basename(parentDir);
    const cwdName = basename(cwd);

    // Detect standalone mode: running from .gitboard/app/
    if (cwdName === 'app' && parentName === '.gitboard') {
        const dataPath = join(parentDir, 'data');
        if (existsSync(dataPath)) {
            return dataPath;
        }
    }

    // Default to gitboard/ in project root (dev mode)
    const projectRoot = process.env.GITBOARD_REPO_PATH || cwd;
    return join(projectRoot, 'gitboard');
}
