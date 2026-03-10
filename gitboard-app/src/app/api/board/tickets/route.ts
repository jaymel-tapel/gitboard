import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getTickets, getStatuses } from '@/app/actions';
import type { TicketWithStatus, StatusConfig } from '@/lib/schemas';

export const dynamic = 'force-dynamic';

interface TicketsResponse {
    tickets: Record<string, TicketWithStatus[]>;
    statuses: StatusConfig[];
    timestamp: number;
    boardId: string;
}

/**
 * GET /api/board/tickets?boardId=xxx
 *
 * Returns all tickets grouped by status for a specific board, along with status configuration.
 * Used by the board state context to fetch updated ticket data for merging
 * without triggering a full page refresh.
 */
export async function GET(request: NextRequest): Promise<NextResponse<TicketsResponse | { error: string }>> {
    try {
        const searchParams = request.nextUrl.searchParams;
        const resolvedBoardId = searchParams.get('boardId') || 'default';

        const [ticketsByStatus, statuses] = await Promise.all([
            getTickets(resolvedBoardId),
            getStatuses(resolvedBoardId),
        ]);

        // Convert to TicketWithStatus format
        const tickets: Record<string, TicketWithStatus[]> = {};

        // Initialize empty arrays for each status
        for (const status of statuses) {
            tickets[status.id] = [];
        }

        // Populate tickets with status info
        for (const status of statuses) {
            const statusTickets = ticketsByStatus[status.id] || [];
            for (const ticket of statusTickets) {
                tickets[status.id]!.push({
                    ...ticket,
                    status: status.id,
                    path: `gitboard/boards/${resolvedBoardId}/tickets/${status.id}/${ticket.id}.json`,
                });
            }

            // Sort by position
            tickets[status.id]!.sort((a, b) => {
                const posA = (a.metadata as any)?.position ?? 999;
                const posB = (b.metadata as any)?.position ?? 999;
                return posA - posB;
            });
        }

        return NextResponse.json({
            tickets,
            statuses,
            timestamp: Date.now(),
            boardId: resolvedBoardId,
        });
    } catch (error) {
        console.error('Error fetching tickets:', error);
        return NextResponse.json(
            { error: 'Failed to fetch tickets' },
            { status: 500 }
        );
    }
}
