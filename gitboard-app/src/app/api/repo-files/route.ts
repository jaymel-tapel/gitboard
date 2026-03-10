import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import { join, relative } from 'path';
import { getProjectRoot } from '@/lib/get-project-root';

// Directories to exclude from file tree (large/irrelevant folders)
const EXCLUDED_DIRECTORIES = new Set([
    'node_modules',
    '.worktrees',
    '.git',
    '.next',
    'dist',
    'build',
    '.turbo',
    '.cache',
    'coverage',
    '.gitboard', // Exclude gitboard folder from file tree
]);

// File tree node structure
export interface RepoFileNode {
    name: string;
    path: string;
    type: 'file' | 'directory';
    children?: RepoFileNode[];
}

/**
 * Recursively builds a file tree structure from a directory
 */
async function buildFileTree(dirPath: string, basePath: string): Promise<RepoFileNode[]> {
    try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        const nodes: RepoFileNode[] = [];

        for (const entry of entries) {
            // Skip excluded directories
            if (entry.isDirectory() && EXCLUDED_DIRECTORIES.has(entry.name)) {
                continue;
            }

            const fullPath = join(dirPath, entry.name);
            const relativePath = relative(basePath, fullPath);

            if (entry.isDirectory()) {
                const children = await buildFileTree(fullPath, basePath);
                nodes.push({
                    name: entry.name,
                    path: relativePath,
                    type: 'directory',
                    children,
                });
            } else {
                nodes.push({
                    name: entry.name,
                    path: relativePath,
                    type: 'file',
                });
            }
        }

        // Sort: directories first, then alphabetically by name
        return nodes.sort((a, b) => {
            if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
            return a.name.localeCompare(b.name);
        });
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return [];
        }
        throw error;
    }
}

export async function GET() {
    try {
        const repoPath = getProjectRoot();
        const tree = await buildFileTree(repoPath, repoPath);

        return NextResponse.json({
            tree,
            repoPath,
        });
    } catch (error) {
        console.error('Failed to fetch repo files:', error);
        return NextResponse.json(
            { tree: [], repoPath: '', error: 'Failed to fetch repo files' },
            { status: 500 }
        );
    }
}
