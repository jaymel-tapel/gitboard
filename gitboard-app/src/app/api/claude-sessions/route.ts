import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export const dynamic = 'force-dynamic';

interface SessionInfo {
    sessionId: string;
    summary: string;
    path: string;
    modifiedAt: Date;
}

/**
 * Get the Claude projects directory path
 * Claude Code stores sessions in ~/.claude/projects/
 */
function getClaudeProjectsDir(): string {
    return path.join(os.homedir(), '.claude', 'projects');
}

/**
 * Get the current repo's project directory in Claude's storage
 */
function getRepoProjectDir(): string | null {
    // Get GITBOARD_REPO_PATH or detect it
    let repoPath = process.env.GITBOARD_REPO_PATH;

    if (!repoPath) {
        let currentDir = process.cwd();
        while (currentDir !== '/') {
            const gitboardPath = path.join(currentDir, 'gitboard');
            if (fs.existsSync(gitboardPath) && fs.statSync(gitboardPath).isDirectory()) {
                repoPath = currentDir;
                break;
            }
            currentDir = path.dirname(currentDir);
        }
        if (!repoPath) {
            repoPath = process.cwd();
        }
    }

    // Convert path to Claude's directory naming convention (slashes become dashes)
    const projectDirName = repoPath.replace(/\//g, '-');
    const projectsDir = getClaudeProjectsDir();
    const projectPath = path.join(projectsDir, projectDirName);

    if (fs.existsSync(projectPath)) {
        return projectPath;
    }

    return null;
}

/**
 * Find sessions that match a ticket ID by scanning session file summaries
 */
function findSessionsForTicket(ticketId: string): { exists: boolean; sessions: SessionInfo[] } {
    const projectDir = getRepoProjectDir();

    if (!projectDir) {
        return { exists: false, sessions: [] };
    }

    try {
        const files = fs.readdirSync(projectDir);
        const sessions: SessionInfo[] = [];

        for (const file of files) {
            // Only check .jsonl session files
            if (!file.endsWith('.jsonl')) continue;

            const filePath = path.join(projectDir, file);
            const stat = fs.statSync(filePath);

            if (!stat.isFile()) continue;

            try {
                // Read only the first line to get the summary
                const content = fs.readFileSync(filePath, 'utf-8');
                const firstLine = content.split('\n')[0];

                if (!firstLine) continue;

                const data = JSON.parse(firstLine);

                // Check if this session is related to the ticket
                if (data.type === 'summary' && data.summary) {
                    // Check if summary contains the ticket ID
                    if (data.summary.includes(ticketId)) {
                        sessions.push({
                            sessionId: file.replace('.jsonl', ''),
                            summary: data.summary,
                            path: filePath,
                            modifiedAt: stat.mtime,
                        });
                    }
                }
            } catch {
                // Skip files that can't be parsed
                continue;
            }
        }

        // Sort by most recent first
        sessions.sort((a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime());

        return {
            exists: sessions.length > 0,
            sessions,
        };
    } catch (err) {
        console.error('Error checking for Claude sessions:', err);
        return { exists: false, sessions: [] };
    }
}

// GET /api/claude-sessions?ticketId=PM-0042 - Check if a Claude session exists for a ticket
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

        const result = findSessionsForTicket(ticketId);

        return NextResponse.json({
            ticketId,
            sessionExists: result.exists,
            canResume: result.exists,
            sessionCount: result.sessions.length,
            latestSession: result.sessions[0] ? {
                sessionId: result.sessions[0].sessionId,
                summary: result.sessions[0].summary,
                modifiedAt: result.sessions[0].modifiedAt,
            } : null,
        });
    } catch (error) {
        console.error('Failed to check Claude sessions:', error);
        return NextResponse.json(
            { error: 'Failed to check Claude sessions', sessionExists: false, canResume: false },
            { status: 500 }
        );
    }
}
