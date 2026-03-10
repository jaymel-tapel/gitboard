import { NextRequest, NextResponse } from 'next/server';
import { FileSystemManager } from '@/lib/file-system';
import { createTicket } from '@/app/actions';
import { getProjectRoot } from '@/lib/get-project-root';

// POST /api/tickets - Create one or more tickets
// Supports both single ticket and batch creation
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const boardId = body.boardId || 'default';

        // Handle batch creation (array of tickets)
        if (Array.isArray(body.tickets)) {
            const results = [];
            for (const ticketData of body.tickets) {
                try {
                    const result = await createTicket({
                        title: ticketData.title,
                        description: ticketData.description || '',
                        priority: ticketData.priority || 'medium',
                    }, boardId);
                    results.push({ success: true, ticket: result?.ticket });
                } catch (error) {
                    results.push({ success: false, error: String(error) });
                }
            }
            return NextResponse.json({
                success: true,
                created: results.filter(r => r.success).length,
                results
            });
        }

        // Handle single ticket creation
        if (body.title) {
            const result = await createTicket({
                title: body.title,
                description: body.description || '',
                priority: body.priority || 'medium',
            }, boardId);
            return NextResponse.json({ success: true, ticket: result?.ticket });
        }

        return NextResponse.json({ error: 'Missing required field: title' }, { status: 400 });
    } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        const errStack = error instanceof Error ? error.stack : '';
        console.error('Failed to create ticket(s):', errMsg, errStack);
        return NextResponse.json({ error: 'Failed to create ticket(s)' }, { status: 500 });
    }
}

export async function GET(request: NextRequest) {
    const repoPath = getProjectRoot();
    const fs = new FileSystemManager(repoPath);

    const ticketId = request.nextUrl.searchParams.get('ticketId');
    const resolvedBoardId = request.nextUrl.searchParams.get('boardId') || 'default';

    if (ticketId) {
        // Get single ticket
        try {
            const status = await fs.findTicketStatus(ticketId, resolvedBoardId);
            const ticket = await fs.readTicket(ticketId, status, resolvedBoardId);
            return NextResponse.json({ ticket });
        } catch (error) {
            return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
        }
    }

    // Get all tickets
    try {
        const tickets = await fs.listAllTickets(resolvedBoardId);
        return NextResponse.json({ tickets });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch tickets' }, { status: 500 });
    }
}
