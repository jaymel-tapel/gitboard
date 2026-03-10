import { NextResponse } from 'next/server';
import { GitManager } from '@/lib/git-manager';

export const dynamic = 'force-dynamic';

function getRepoPath(): string {
    let repoPath = process.env.GITBOARD_REPO_PATH;

    // Auto-detect GITBOARD_REPO_PATH if not set (same logic as server.cjs)
    if (!repoPath) {
        const path = require('path');
        const fs = require('fs');
        let currentDir = process.cwd();

        while (currentDir !== '/') {
            const gitboardPath = path.join(currentDir, 'gitboard');
            if (fs.existsSync(gitboardPath) && fs.statSync(gitboardPath).isDirectory()) {
                repoPath = currentDir;
                break;
            }
            currentDir = path.dirname(currentDir);
        }

        // Fallback to current directory if not found
        if (!repoPath) {
            repoPath = process.cwd();
        }
    }

    return repoPath;
}

// GET /api/branches - List all branches with default branch info
export async function GET() {
    try {
        const repoPath = getRepoPath();
        const gitManager = new GitManager(repoPath);

        const { branches, defaultBranch } = await gitManager.listBranches();
        const currentBranch = await gitManager.getCurrentBranch();

        return NextResponse.json({
            branches,
            defaultBranch,
            currentBranch,
        });
    } catch (error) {
        console.error('Failed to fetch branches:', error);
        return NextResponse.json(
            { error: 'Failed to fetch branches', branches: [], defaultBranch: 'main', currentBranch: 'main' },
            { status: 500 }
        );
    }
}
