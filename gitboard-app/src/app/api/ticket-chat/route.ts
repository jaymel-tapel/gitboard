import { NextRequest, NextResponse } from 'next/server';
import { FileSystemManager } from '@/lib/file-system';
import { GitManager } from '@/lib/git-manager';
import { getProjectRoot } from '@/lib/get-project-root';
import type { TicketChatHistory, TicketChatMessage } from '@/lib/schemas';

function getRepoPath(): string {
    return getProjectRoot();
}

function getFs(): FileSystemManager {
    return new FileSystemManager(getRepoPath());
}

function getGit(): GitManager {
    return new GitManager(getRepoPath());
}

/**
 * GET /api/ticket-chat?ticketId=PM-0001
 * Fetches chat history for a ticket
 */
export async function GET(request: NextRequest) {
    const ticketId = request.nextUrl.searchParams.get('ticketId');

    if (!ticketId) {
        return NextResponse.json({ error: 'ticketId is required' }, { status: 400 });
    }

    try {
        const fs = getFs();
        const chatHistory = await fs.readTicketChatHistory(ticketId);

        if (!chatHistory) {
            // Return empty history for new tickets
            return NextResponse.json({
                chatHistory: {
                    ticketId,
                    messages: [],
                    metadata: {
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                    },
                },
            });
        }

        return NextResponse.json({ chatHistory });
    } catch (error) {
        console.error('Failed to fetch chat history:', error);
        return NextResponse.json({ error: 'Failed to fetch chat history' }, { status: 500 });
    }
}

/**
 * POST /api/ticket-chat
 * Saves chat history for a ticket
 * Body: { ticketId: string, messages: TicketChatMessage[] }
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { ticketId, messages } = body as {
            ticketId: string;
            messages: TicketChatMessage[];
        };

        if (!ticketId) {
            return NextResponse.json({ error: 'ticketId is required' }, { status: 400 });
        }

        if (!Array.isArray(messages)) {
            return NextResponse.json({ error: 'messages must be an array' }, { status: 400 });
        }

        const fs = getFs();
        const git = getGit();

        // Get existing chat history or create new one
        const existingHistory = await fs.readTicketChatHistory(ticketId);
        const now = new Date().toISOString();

        const chatHistory: TicketChatHistory = {
            ticketId,
            messages,
            metadata: {
                created_at: existingHistory?.metadata.created_at || now,
                updated_at: now,
            },
        };

        await fs.writeTicketChatHistory(chatHistory);

        // Auto-commit the chat history
        await git.autoCommit(
            `[gitboard] Update chat history for ${ticketId}`,
            [fs.getTicketChatRelativePath(ticketId)]
        );

        return NextResponse.json({ success: true, chatHistory });
    } catch (error) {
        console.error('Failed to save chat history:', error);
        return NextResponse.json({ error: 'Failed to save chat history' }, { status: 500 });
    }
}

/**
 * DELETE /api/ticket-chat?ticketId=PM-0001
 * Deletes chat history for a ticket
 */
export async function DELETE(request: NextRequest) {
    const ticketId = request.nextUrl.searchParams.get('ticketId');

    if (!ticketId) {
        return NextResponse.json({ error: 'ticketId is required' }, { status: 400 });
    }

    try {
        const fs = getFs();
        const git = getGit();

        await fs.deleteTicketChatHistory(ticketId);

        // Auto-commit the deletion
        await git.autoCommit(
            `[gitboard] Delete chat history for ${ticketId}`,
            [fs.getTicketChatRelativePath(ticketId)]
        );

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Failed to delete chat history:', error);
        return NextResponse.json({ error: 'Failed to delete chat history' }, { status: 500 });
    }
}
