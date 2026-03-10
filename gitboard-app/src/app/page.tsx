import type { Metadata } from 'next';
import Link from 'next/link';
import { getBoards, getTickets, getConfig, getTeam, getGitHistory } from './actions';
import { RecentActivity } from '@/components/RecentActivity';
import { formatPageTitle } from '@/lib/title-utils';
import type { Board } from '@/lib/schemas';

// Force dynamic rendering since we read from filesystem
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
    const config = await getConfig();
    return {
        title: formatPageTitle('Dashboard', config.project.name),
    };
}

// Helper to get total ticket count for a board
async function getBoardTicketCount(boardId: string): Promise<number> {
    const ticketsByStatus = await getTickets(boardId);
    return Object.values(ticketsByStatus).reduce((total, tickets) => total + tickets.length, 0);
}

// Board card with ticket count
interface BoardWithCount extends Board {
    ticketCount: number;
}

export default async function Home() {
    const [boards, config, team, commits] = await Promise.all([
        getBoards(),
        getConfig(),
        getTeam(),
        getGitHistory(20),
    ]);

    // Get ticket counts for each board in parallel
    const boardsWithCounts: BoardWithCount[] = await Promise.all(
        boards
            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
            .map(async (board) => ({
                ...board,
                ticketCount: await getBoardTicketCount(board.id),
            }))
    );

    return (
        <main className="min-h-screen bg-gradient-to-br from-gray-50 via-purple-50/30 to-blue-50/20 dark:from-[#0a0a0a] dark:via-purple-950/10 dark:to-blue-950/5 relative">
            {/* Gradient waves background */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-1/2 -left-1/4 w-96 h-96 bg-purple-400/10 dark:bg-purple-600/5 rounded-full blur-3xl"></div>
                <div className="absolute top-1/4 -right-1/4 w-[500px] h-[500px] bg-blue-400/10 dark:bg-blue-600/5 rounded-full blur-3xl"></div>
                <div className="absolute -bottom-1/4 left-1/3 w-[600px] h-[600px] bg-purple-300/10 dark:bg-purple-700/5 rounded-full blur-3xl"></div>
            </div>

            {/* Header */}
            <div className="border-b border-gray-200/50 dark:border-gray-800/50 bg-white/80 dark:bg-[#0d0d0d]/80 backdrop-blur-md relative z-10">
                <div className="max-w-7xl mx-auto px-8 py-8">
                    <div>
                        <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                            {config.project.name}
                        </h1>
                        <p className="text-gray-500 dark:text-gray-400">
                            {config.project.description || 'Git-native project management powered by AI'}
                        </p>
                    </div>

                    {/* Quick Stats Bar */}
                    <div className="mt-6 flex items-center gap-6 text-sm">
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-purple-500"></div>
                            <span className="text-gray-600 dark:text-gray-400">
                                {team.team.length} team members
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="max-w-7xl mx-auto px-8 py-8 relative z-10">
                {/* Two Column Layout: Boards on left, Activity on right */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Boards List - Left column */}
                    <div>
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Boards</h2>
                        <div className="rounded-xl bg-white/60 dark:bg-white/5 backdrop-blur-md border border-gray-200/50 dark:border-gray-700/50 overflow-hidden">
                            {boardsWithCounts.length === 0 ? (
                                <div className="p-6 text-center">
                                    <div className="p-3 rounded-full bg-gray-100 dark:bg-gray-800 inline-block mb-3">
                                        <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
                                        </svg>
                                    </div>
                                    <p className="text-sm text-gray-500 dark:text-gray-400">No boards yet</p>
                                </div>
                            ) : (
                                <div className="divide-y divide-gray-200/50 dark:divide-gray-700/50">
                                    {boardsWithCounts.map((board) => (
                                        <Link
                                            key={board.id}
                                            href={`/board?board=${encodeURIComponent(board.id)}`}
                                            className="group flex items-center justify-between p-4 hover:bg-purple-50/50 dark:hover:bg-purple-900/10 transition-colors"
                                        >
                                            <div>
                                                <span className="font-medium text-gray-900 dark:text-gray-100 group-hover:text-purple-700 dark:group-hover:text-purple-300 transition-colors">
                                                    {board.name}
                                                </span>
                                                {board.ticket_prefix && (
                                                    <span className="ml-2 text-xs font-mono text-gray-400 dark:text-gray-500">
                                                        {board.ticket_prefix}-*
                                                    </span>
                                                )}
                                            </div>
                                            <span className="text-sm text-gray-500 dark:text-gray-400">
                                                {board.ticketCount}
                                            </span>
                                        </Link>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Activity Feed - Right columns */}
                    <div className="lg:col-span-2">
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Recent Activity</h2>
                        <RecentActivity commits={commits} />
                    </div>
                </div>
            </div>
        </main>
    );
}
