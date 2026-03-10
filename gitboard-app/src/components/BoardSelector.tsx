'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Board } from '@/lib/schemas';

const STORAGE_KEY = 'gitboard-active-board';

interface BoardSelectorProps {
    boards: Board[];
    currentBoardId: string;
}

export function BoardSelector({ boards, currentBoardId }: BoardSelectorProps) {
    const router = useRouter();
    const searchParams = useSearchParams();

    // On mount: if no ?board= in URL but localStorage has a saved board, redirect
    useEffect(() => {
        const urlBoard = searchParams.get('board');
        if (!urlBoard) {
            const savedBoard = localStorage.getItem(STORAGE_KEY);
            if (savedBoard && savedBoard !== 'default' && boards.some(b => b.id === savedBoard)) {
                router.replace(`/board?board=${encodeURIComponent(savedBoard)}`);
            }
        }
    }, []);

    const handleSwitchBoard = (boardId: string) => {
        if (boardId !== currentBoardId) {
            localStorage.setItem(STORAGE_KEY, boardId);
            router.push(`/board?board=${encodeURIComponent(boardId)}`);
        }
    };

    // Only show pinned boards, sorted by order
    const pinnedBoards = [...boards]
        .filter(b => b.pinned ?? true) // Default to pinned for backwards compatibility
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    return (
        <div className="flex items-center gap-1">
            {pinnedBoards.map(board => (
                <button
                    key={board.id}
                    onClick={() => handleSwitchBoard(board.id)}
                    className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                        board.id === currentBoardId
                            ? 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/50'
                    }`}
                >
                    {board.name}
                </button>
            ))}
        </div>
    );
}
