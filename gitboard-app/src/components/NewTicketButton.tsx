'use client'

import { useState } from 'react';
import { TicketEditor } from './TicketEditor';

export function NewTicketButton({ boardId }: { boardId?: string } = {}) {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <>
            <button
                onClick={() => setIsOpen(true)}
                className="px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-2"
            >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                New Ticket
            </button>
            <TicketEditor
                isOpen={isOpen}
                onClose={() => setIsOpen(false)}
                boardId={boardId}
            />
        </>
    );
}
