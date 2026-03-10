/**
 * Directory Watcher Module
 *
 * Uses chokidar to monitor the gitboard/docs/ folder and automatically
 * trigger sync operations when files are added, changed, or deleted.
 */

import chokidar from 'chokidar';
import { readFileSync, existsSync } from 'fs';
import { join, relative, dirname } from 'path';
import { syncDocument, removeDocument } from './sync';
import { initializeVectorStore } from './index';

export interface WatcherStatus {
    isRunning: boolean;
    docsPath: string;
    watchedFiles: number;
}

// Store the watcher instance
let watcher: chokidar.FSWatcher | null = null;
let watchedFiles = new Set<string>();

/**
 * Get the path to the gitboard/docs folder
 * Works by finding the gitboard folder relative to the current working directory
 */
function getDocsPath(): string {
    // Try different possible paths
    const possiblePaths = [
        join(process.cwd(), '..', 'gitboard', 'docs'),
        join(process.cwd(), 'gitboard', 'docs'),
        join(dirname(process.cwd()), 'gitboard', 'docs'),
    ];

    for (const path of possiblePaths) {
        if (existsSync(path)) {
            return path;
        }
    }

    // Default to relative path from gitboard-app
    return join(process.cwd(), '..', 'gitboard', 'docs');
}

/**
 * Read and parse a doc JSON file
 */
function readDocContent(filePath: string): string | null {
    try {
        const content = readFileSync(filePath, 'utf-8');
        const doc = JSON.parse(content);
        // The doc JSON has a 'content' field with markdown
        return doc.content || '';
    } catch (error) {
        console.error(`[Watcher] Error reading doc file ${filePath}:`, error);
        return null;
    }
}

/**
 * Handle file add/change events
 */
async function handleFileChange(filePath: string, docsPath: string): Promise<void> {
    // Only process JSON files
    if (!filePath.endsWith('.json')) {
        return;
    }

    const relativePath = relative(docsPath, filePath);
    const content = readDocContent(filePath);

    if (content !== null) {
        console.log(`[Watcher] Syncing: ${relativePath}`);
        await syncDocument(relativePath, content);
        watchedFiles.add(filePath);
    }
}

/**
 * Handle file deletion events
 */
async function handleFileDelete(filePath: string, docsPath: string): Promise<void> {
    // Only process JSON files
    if (!filePath.endsWith('.json')) {
        return;
    }

    const relativePath = relative(docsPath, filePath);
    console.log(`[Watcher] Removing: ${relativePath}`);
    await removeDocument(relativePath);
    watchedFiles.delete(filePath);
}

/**
 * Start watching the docs folder
 */
export async function startDocsWatcher(): Promise<WatcherStatus> {
    if (watcher) {
        console.log('[Watcher] Watcher already running');
        return getWatcherStatus();
    }

    const docsPath = getDocsPath();
    console.log(`[Watcher] Starting watcher for: ${docsPath}`);

    // Initialize vector store before starting watcher
    await initializeVectorStore();

    // Create the watcher
    watcher = chokidar.watch(docsPath, {
        ignored: /(^|[\/\\])\../, // Ignore dotfiles
        persistent: true,
        ignoreInitial: false, // Process existing files on startup
        depth: 10, // Watch nested folders
    });

    // Set up event handlers
    watcher
        .on('add', async (path) => {
            await handleFileChange(path, docsPath);
        })
        .on('change', async (path) => {
            await handleFileChange(path, docsPath);
        })
        .on('unlink', async (path) => {
            await handleFileDelete(path, docsPath);
        })
        .on('error', (error) => {
            console.error('[Watcher] Error:', error);
        })
        .on('ready', () => {
            console.log(`[Watcher] Initial scan complete. Watching ${watchedFiles.size} files.`);
        });

    return getWatcherStatus();
}

/**
 * Stop the docs watcher
 */
export async function stopDocsWatcher(): Promise<void> {
    if (watcher) {
        await watcher.close();
        watcher = null;
        watchedFiles.clear();
        console.log('[Watcher] Stopped watching docs folder');
    }
}

/**
 * Get the current watcher status
 */
export function getWatcherStatus(): WatcherStatus {
    return {
        isRunning: watcher !== null,
        docsPath: getDocsPath(),
        watchedFiles: watchedFiles.size,
    };
}

/**
 * Manually trigger a sync of all docs
 */
export async function syncAllDocs(): Promise<{ synced: number; errors: number }> {
    const docsPath = getDocsPath();
    await initializeVectorStore();

    // Use glob to find all JSON files in the docs folder
    const { globSync } = await import('glob');
    const files = globSync('**/*.json', { cwd: docsPath, absolute: true });

    let synced = 0;
    let errors = 0;

    for (const filePath of files) {
        const relativePath = relative(docsPath, filePath);
        const content = readDocContent(filePath);

        if (content !== null) {
            const result = await syncDocument(relativePath, content);
            if (result.success) {
                synced++;
            } else {
                errors++;
            }
        } else {
            errors++;
        }
    }

    console.log(`[Watcher] Manual sync complete: ${synced} synced, ${errors} errors`);
    return { synced, errors };
}
