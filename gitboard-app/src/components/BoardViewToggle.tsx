'use client'

import { useState, useEffect } from 'react';

type ViewMode = 'kanban' | 'table' | 'agents';

const STORAGE_KEY = 'gitboard-view-preference';

export function BoardViewToggle() {
    const [viewMode, setViewMode] = useState<ViewMode>('kanban');
    const [mounted, setMounted] = useState(false);

    // Load preference from localStorage on mount
    useEffect(() => {
        setMounted(true);
        const saved = localStorage.getItem(STORAGE_KEY) as ViewMode;
        if (saved === 'kanban' || saved === 'table' || saved === 'agents') {
            setViewMode(saved);
            updateViewVisibility(saved);
        }
    }, []);

    function updateViewVisibility(mode: ViewMode) {
        // Show/hide view containers
        const kanbanView = document.querySelector('[data-view="kanban"]');
        const tableView = document.querySelector('[data-view="table"]');
        const agentsView = document.querySelector('[data-view="agents"]');

        if (kanbanView && tableView && agentsView) {
            kanbanView.classList.add('hidden');
            tableView.classList.add('hidden');
            agentsView.classList.add('hidden');

            if (mode === 'kanban') {
                kanbanView.classList.remove('hidden');
            } else if (mode === 'table') {
                tableView.classList.remove('hidden');
            } else if (mode === 'agents') {
                agentsView.classList.remove('hidden');
            }
        } else if (kanbanView && tableView) {
            // Fallback if agents view not yet in DOM
            if (mode === 'kanban') {
                kanbanView.classList.remove('hidden');
                tableView.classList.add('hidden');
            } else if (mode === 'table') {
                kanbanView.classList.add('hidden');
                tableView.classList.remove('hidden');
            }
        }
    }

    function handleViewChange(mode: ViewMode) {
        setViewMode(mode);
        localStorage.setItem(STORAGE_KEY, mode);
        updateViewVisibility(mode);
    }

    if (!mounted) {
        return (
            <div className="flex items-center border border-gray-300 dark:border-gray-700 rounded-lg overflow-hidden">
                <div className="px-2.5 py-2 text-sm font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 flex items-center justify-center" title="Kanban View">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
                    </svg>
                </div>
                <div className="px-2.5 py-2 text-sm font-medium text-gray-500 dark:text-gray-400 flex items-center justify-center" title="Table View">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                </div>
                <div className="px-2.5 py-2 text-sm font-medium text-gray-500 dark:text-gray-400 flex items-center justify-center" title="Agents View">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                </div>
            </div>
        );
    }

    return (
        <div className="flex items-center border border-gray-300 dark:border-gray-700 rounded-lg overflow-hidden">
            <button
                onClick={() => handleViewChange('kanban')}
                title="Kanban View"
                className={`px-2.5 py-2 text-sm font-medium flex items-center justify-center transition-colors ${viewMode === 'kanban'
                    ? 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                    : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-900'
                }`}
            >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
                </svg>
            </button>
            <button
                onClick={() => handleViewChange('table')}
                title="Table View"
                className={`px-2.5 py-2 text-sm font-medium flex items-center justify-center transition-colors ${viewMode === 'table'
                    ? 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                    : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-900'
                }`}
            >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
            </button>
            <button
                onClick={() => handleViewChange('agents')}
                title="Agents View"
                className={`px-2.5 py-2 text-sm font-medium flex items-center justify-center transition-colors ${viewMode === 'agents'
                    ? 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                    : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-900'
                }`}
            >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
            </button>
        </div>
    );
}
