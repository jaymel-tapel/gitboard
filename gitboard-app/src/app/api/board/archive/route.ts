import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getArchivedTickets, getStatuses } from '@/app/actions';
import type { Ticket, StatusConfig } from '@/lib/schemas';

export const dynamic = 'force-dynamic';

interface ArchivedTicket {
    ticket: Ticket;
    yearMonth: string;
}

interface ArchiveResponse {
    tickets: ArchivedTicket[];
    statuses: StatusConfig[];
    count: number;
    timestamp: number;
    boardId: string;
}

/**
 * GET /api/board/archive?boardId=xxx
 *
 * Returns all archived tickets for a board, grouped by their YYYY-MM archive folder.
 * Each ticket includes its full data and archive metadata (archived_at, original_status).
 * Also returns the board's status configuration for the restore dialog.
 */
export async function GET(request: NextRequest): Promise<NextResponse<ArchiveResponse | { error: string }>> {
    try {
        const searchParams = request.nextUrl.searchParams;
        const resolvedBoardId = searchParams.get('boardId') || 'default';

        const [archiveData, statuses] = await Promise.all([
            getArchivedTickets(resolvedBoardId),
            getStatuses(resolvedBoardId),
        ]);

        return NextResponse.json({
            tickets: archiveData.tickets,
            statuses,
            count: archiveData.count,
            timestamp: Date.now(),
            boardId: resolvedBoardId,
        });
    } catch (error) {
        console.error('Error fetching archived tickets:', error);
        return NextResponse.json(
            { error: 'Failed to fetch archived tickets' },
            { status: 500 }
        );
    }
}
