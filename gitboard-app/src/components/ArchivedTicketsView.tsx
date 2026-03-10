'use client';

import { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import type { Ticket, StatusConfig } from '@/lib/schemas';
import { RestoreTicketDialog } from './RestoreTicketDialog';
import { useBoardState } from '@/context/BoardStateContext';
import { useToast } from '@/context/ToastContext';

interface ArchivedTicket {
    ticket: Ticket;
    yearMonth: string;
}

interface ArchivedTicketsViewProps {
    isOpen: boolean;
    onClose: () => void;
    boardId?: string;
}

export function ArchivedTicketsView({
    isOpen,
    onClose,
    boardId,
}: ArchivedTicketsViewProps) {
    const { state, restoreTicket, setArchivedTickets } = useBoardState();
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(true);
    const [statuses, setStatuses] = useState<StatusConfig[]>([]);
    const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
    const [showRestoreDialog, setShowRestoreDialog] = useState(false);

    const resolvedBoardId = boardId || state.boardId || 'default';

    // Fetch archived tickets when dialog opens
    useEffect(() => {
        if (isOpen) {
            setIsLoading(true);
            fetch(`/api/board/archive?boardId=${resolvedBoardId}`)
                .then(res => res.json())
                .then(data => {
                    if (data.tickets) {
                        setArchivedTickets(data.tickets, data.count);
                    }
                    if (data.statuses) {
                        setStatuses(data.statuses);
                    }
                })
                .catch(err => {
                    console.error('Failed to fetch archived tickets:', err);
                    toast.error('Failed to load archived tickets');
                })
                .finally(() => {
                    setIsLoading(false);
                });
        }
    }, [isOpen, resolvedBoardId, setArchivedTickets]);

    if (!isOpen) return null;

    // Ensure archivedTickets is always an array
    const archivedTickets = state.archivedTickets || [];

    // Group tickets by yearMonth
    const ticketsByMonth: Record<string, ArchivedTicket[]> = {};
    for (const at of archivedTickets) {
        if (!ticketsByMonth[at.yearMonth]) {
            ticketsByMonth[at.yearMonth] = [];
        }
        ticketsByMonth[at.yearMonth]!.push(at);
    }

    // Sort months in descending order (newest first)
    const sortedMonths = Object.keys(ticketsByMonth).sort().reverse();

    const formatMonth = (yearMonth: string) => {
        const [year, month] = yearMonth.split('-');
        const date = new Date(parseInt(year!), parseInt(month!) - 1);
        return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
    };

    const formatDate = (isoString?: string) => {
        if (!isoString) return 'Unknown date';
        return new Date(isoString).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const handleRestoreClick = (ticket: Ticket) => {
        setSelectedTicket(ticket);
        setShowRestoreDialog(true);
    };

    const handleRestore = async (targetStatus: string) => {
        if (!selectedTicket) return;
        await restoreTicket(selectedTicket.id, targetStatus);
        setShowRestoreDialog(false);
        setSelectedTicket(null);
    };

    const priorityColors = {
        critical: 'bg-red-500',
        high: 'bg-orange-500',
        medium: 'bg-yellow-500',
        low: 'bg-gray-400',
    };

    return ReactDOM.createPortal(
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100]"
                onClick={onClose}
            />

            {/* Panel */}
            <div className="fixed inset-y-0 right-0 w-full max-w-xl bg-[#0d0d0d] border-l border-gray-700 shadow-2xl z-[110] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700 bg-[#1a1a1a]">
                    <div className="flex items-center gap-3">
                        <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                        </svg>
                        <div>
                            <h2 className="text-lg font-semibold text-gray-100">Archived Tickets</h2>
                            <p className="text-sm text-gray-400">
                                {state.archivedTicketCount} ticket{state.archivedTicketCount !== 1 ? 's' : ''} archived
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-300 p-1"
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-4">
                    {isLoading ? (
                        <div className="flex items-center justify-center h-full">
                            <div className="flex items-center gap-3 text-gray-400">
                                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                </svg>
                                <span>Loading archived tickets...</span>
                            </div>
                        </div>
                    ) : archivedTickets.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-center px-4">
                            <svg className="w-16 h-16 text-gray-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                            </svg>
                            <h3 className="text-lg font-medium text-gray-400 mb-2">No archived tickets</h3>
                            <p className="text-sm text-gray-500">
                                Tickets you archive will appear here
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {sortedMonths.map(month => (
                                <div key={month}>
                                    <h3 className="text-sm font-medium text-gray-400 mb-3 sticky top-0 bg-[#0d0d0d] py-2">
                                        {formatMonth(month)}
                                    </h3>
                                    <div className="space-y-2">
                                        {ticketsByMonth[month]!.map(({ ticket }) => (
                                            <div
                                                key={ticket.id}
                                                className="p-4 bg-gray-800/50 rounded-lg border border-gray-700 hover:border-gray-600 transition-colors"
                                            >
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="flex-1 min-w-0">
                                                        {/* Ticket ID and Priority */}
                                                        <div className="flex items-center gap-2 mb-2">
                                                            <span className="text-xs font-mono text-gray-500">
                                                                {ticket.id}
                                                            </span>
                                                            <div
                                                                className={`w-1.5 h-1.5 rounded-full ${priorityColors[ticket.priority]}`}
                                                                title={ticket.priority}
                                                            />
                                                        </div>

                                                        {/* Title */}
                                                        <h4 className="text-sm font-medium text-gray-200 mb-2 line-clamp-2">
                                                            {ticket.title}
                                                        </h4>

                                                        {/* Archive info */}
                                                        <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
                                                            <span title="Archived date">
                                                                {formatDate(ticket.metadata.archived_at)}
                                                            </span>
                                                            {ticket.metadata.original_status && (
                                                                <span className="flex items-center gap-1">
                                                                    <span>from</span>
                                                                    <span className="px-1.5 py-0.5 bg-gray-700 rounded text-gray-400">
                                                                        {statuses.find(s => s.id === ticket.metadata.original_status)?.name || ticket.metadata.original_status}
                                                                    </span>
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Restore button */}
                                                    <button
                                                        onClick={() => handleRestoreClick(ticket)}
                                                        className="flex-shrink-0 px-3 py-1.5 text-xs font-medium text-purple-400 hover:text-purple-300 hover:bg-purple-500/10 border border-purple-500/30 rounded-lg transition-colors"
                                                    >
                                                        Restore
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Restore Dialog */}
            {selectedTicket && (
                <RestoreTicketDialog
                    isOpen={showRestoreDialog}
                    onClose={() => {
                        setShowRestoreDialog(false);
                        setSelectedTicket(null);
                    }}
                    onRestore={handleRestore}
                    ticket={selectedTicket}
                    statuses={statuses}
                />
            )}
        </>,
        document.body
    );
}
