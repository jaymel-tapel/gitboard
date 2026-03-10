'use client';

import { useState, useEffect } from 'react';
import { ArchivedTicketsView } from './ArchivedTicketsView';
import { useBoardState } from '@/context/BoardStateContext';

interface ArchiveButtonProps {
    boardId?: string;
}

export function ArchiveButton({ boardId }: ArchiveButtonProps) {
    const { state, setArchivedTicketCount } = useBoardState();
    const [isOpen, setIsOpen] = useState(false);

    const resolvedBoardId = boardId || state.boardId || 'default';

    // Fetch archive count on mount
    useEffect(() => {
        fetch(`/api/board/archive?boardId=${resolvedBoardId}`)
            .then(res => res.json())
            .then(data => {
                if (typeof data.count === 'number') {
                    setArchivedTicketCount(data.count);
                }
            })
            .catch(err => {
                console.error('Failed to fetch archive count:', err);
            });
    }, [resolvedBoardId, setArchivedTicketCount]);

    return (
        <>
            <button
                onClick={() => setIsOpen(true)}
                className="px-2.5 py-2 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors flex items-center justify-center gap-1"
                title="View archived tickets"
            >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                </svg>
                {state.archivedTicketCount > 0 && (
                    <span className="inline-flex items-center justify-center min-w-[18px] h-4 px-1 text-[10px] font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-full">
                        {state.archivedTicketCount}
                    </span>
                )}
            </button>

            <ArchivedTicketsView
                isOpen={isOpen}
                onClose={() => setIsOpen(false)}
                boardId={resolvedBoardId}
            />
        </>
    );
}
