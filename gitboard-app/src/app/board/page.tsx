import type { Metadata } from 'next';
import { Suspense } from 'react';
import { getTickets, getConfig, getTeam, getStatuses, getBoards } from '@/app/actions';
import { NewTicketButton } from '@/components/NewTicketButton';
import { Column } from '@/components/Column';
import { BoardWrapper } from '@/components/BoardWrapper';
import { BoardViewToggle } from '@/components/BoardViewToggle';
import { BoardTableView } from '@/components/BoardTableView';
import { BoardAgentView } from '@/components/BoardAgentView';
import { BoardSettingsButton } from '@/components/BoardSettingsButton';
import { PanScrollContainer } from '@/components/PanScrollContainer';
import { BoardSelector } from '@/components/BoardSelector';
import { ArchiveButton } from '@/components/ArchiveButton';
import type { TicketWithStatus, StatusConfig } from '@/lib/schemas';
import { formatPageTitle } from '@/lib/title-utils';

// Force dynamic rendering since we read from filesystem
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
    const config = await getConfig();
    return {
        title: formatPageTitle('Board', config.project.name),
    };
}

interface BoardPageProps {
    searchParams: Promise<{ board?: string }>;
}

export default async function BoardPage({ searchParams }: BoardPageProps) {
    const params = await searchParams;
    // Board ID comes from URL query param (client stores preference in localStorage)
    const currentBoardId = params.board || 'default';

    const [ticketsByStatus, config, team, statuses, boards] = await Promise.all([
        getTickets(currentBoardId),
        getConfig(),
        getTeam(),
        getStatuses(currentBoardId),
        getBoards(),
    ]);

    // Create owner lookup map (id -> name)
    const ownerNames = Object.fromEntries(
        team.team.map(m => [m.id, m.name])
    );

    // Convert to tickets with status
    const allTickets: TicketWithStatus[] = [];
    for (const status of statuses) {
        const statusTickets = ticketsByStatus[status.id] || [];
        for (const ticket of statusTickets) {
            allTickets.push({
                ...ticket,
                status: status.id,
                path: `gitboard/boards/${currentBoardId}/tickets/${status.id}/${ticket.id}.json`,
            });
        }
    }

    // Group tickets by status and sort by position
    const sortByPosition = (a: any, b: any) => {
        const posA = (a.metadata as any)?.position ?? 999;
        const posB = (b.metadata as any)?.position ?? 999;
        return posA - posB;
    };

    const grouped: Record<string, TicketWithStatus[]> = {};
    for (const status of statuses) {
        grouped[status.id] = allTickets
            .filter((t) => t.status === status.id)
            .sort(sortByPosition);
    }

    return (
        <BoardWrapper initialTickets={grouped} initialStatuses={statuses} boardId={currentBoardId}>
            <div className="h-[calc(100vh-3.5rem)] flex flex-col overflow-hidden bg-gradient-to-br from-gray-50 via-purple-50/30 to-blue-50/20 dark:from-[#0a0a0a] dark:via-purple-950/10 dark:to-blue-950/5 relative">
                {/* Gradient waves background */}
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    <div className="absolute -top-1/2 -left-1/4 w-96 h-96 bg-purple-400/10 dark:bg-purple-600/5 rounded-full blur-3xl"></div>
                    <div className="absolute top-1/4 -right-1/4 w-[500px] h-[500px] bg-blue-400/10 dark:bg-blue-600/5 rounded-full blur-3xl"></div>
                    <div className="absolute -bottom-1/4 left-1/3 w-[600px] h-[600px] bg-purple-300/10 dark:bg-purple-700/5 rounded-full blur-3xl"></div>
                </div>

                {/* Header */}
                <div className="flex-shrink-0 border-b border-gray-200/50 dark:border-gray-800/50 bg-white/80 dark:bg-[#0d0d0d]/80 backdrop-blur-md relative z-10">
                    <div className="mx-auto px-6 py-4">
                        <div className="flex items-center justify-between">
                            <Suspense fallback={
                                <div className="flex items-center gap-1">
                                    {boards.map(b => (
                                        <div key={b.id} className={`px-4 py-2 text-sm font-medium rounded-lg ${b.id === currentBoardId
                                            ? 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                                            : 'text-gray-500 dark:text-gray-400'
                                            }`}>
                                            {b.name}
                                        </div>
                                    ))}
                                </div>
                            }>
                                <BoardSelector
                                    boards={boards}
                                    currentBoardId={currentBoardId}
                                />
                            </Suspense>
                            <div className="flex items-center gap-3">
                                <BoardViewToggle />
                                <ArchiveButton boardId={currentBoardId} />
                                <BoardSettingsButton boards={boards} currentBoardId={currentBoardId} statuses={statuses} />
                                <NewTicketButton boardId={currentBoardId} />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Board - Kanban View */}
                <div className="relative z-10 flex-1 min-h-0" data-view="kanban">
                    {/* Horizontal scrollable container with pan scrolling */}
                    <PanScrollContainer>
                        <div
                            className="flex gap-4 h-full pb-4"
                            style={{ minWidth: `${statuses.length * 300}px` }}
                        >
                            {statuses.map((status) => (
                                <div key={status.id} className="w-[300px] flex-shrink-0 h-full">
                                    <Column
                                        title={status.name}
                                        color={status.color}
                                        status={status.id}
                                        statusConfig={status}
                                        ownerNames={ownerNames}
                                        teamMembers={team.team}
                                        allStatuses={statuses}
                                    />
                                </div>
                            ))}
                        </div>
                    </PanScrollContainer>
                </div>

                {/* Board - Table View (hidden by default, shown via client-side toggle) */}
                <div className="flex-1 min-h-0 overflow-y-auto w-full max-w-[1800px] mx-auto px-8 py-8 relative z-10 hidden" data-view="table">
                    <BoardTableView
                        statuses={statuses}
                        ownerNames={ownerNames}
                        teamMembers={team.team}
                    />
                </div>

                {/* Board - Agents View (hidden by default, shown via client-side toggle) */}
                <div className="flex-1 min-h-0 relative z-10 hidden" data-view="agents">
                    <BoardAgentView
                        statuses={statuses}
                        ownerNames={ownerNames}
                        teamMembers={team.team}
                    />
                </div>

            </div>
        </BoardWrapper>
    );
}
