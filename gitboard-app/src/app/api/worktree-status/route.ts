import { NextRequest, NextResponse } from 'next/server';
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

// GET /api/worktree-status?ticketId=PM-0042 - Check worktree and branch status for a ticket
export async function GET(request: NextRequest) {
    try {
        const url = new URL(request.url);
        const ticketId = url.searchParams.get('ticketId');

        if (!ticketId) {
            return NextResponse.json(
                { error: 'ticketId is required' },
                { status: 400 }
            );
        }

        const repoPath = getRepoPath();
        const gitManager = new GitManager(repoPath);

        const branchName = ticketId; // Branch name matches ticket ID
        const worktreePath = gitManager.getWorktreePath(ticketId);

        const branchExists = await gitManager.branchExists(branchName);
        const worktreeExists = await gitManager.worktreeExists(worktreePath);

        return NextResponse.json({
            ticketId,
            branchName,
            branchExists,
            worktreePath,
            worktreeExists,
            // Status helps determine the UI flow
            status: branchExists && worktreeExists
                ? 'ready' // Both exist, can resume
                : branchExists
                    ? 'needs-worktree' // Branch exists, need to create worktree
                    : 'needs-branch' // Neither exists, need to select base branch
        });
    } catch (error) {
        console.error('Failed to check worktree status:', error);
        return NextResponse.json(
            { error: 'Failed to check worktree status' },
            { status: 500 }
        );
    }
}
