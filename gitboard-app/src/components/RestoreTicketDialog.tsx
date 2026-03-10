'use client';

import { useState } from 'react';
import ReactDOM from 'react-dom';
import type { Ticket, StatusConfig } from '@/lib/schemas';

interface RestoreTicketDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onRestore: (targetStatus: string) => Promise<void>;
    ticket: Ticket;
    statuses: StatusConfig[];
}

export function RestoreTicketDialog({
    isOpen,
    onClose,
    onRestore,
    ticket,
    statuses,
}: RestoreTicketDialogProps) {
    const [selectedStatus, setSelectedStatus] = useState<string>('');
    const [isRestoring, setIsRestoring] = useState(false);

    if (!isOpen) return null;

    const originalStatus = ticket.metadata.original_status;
    const originalStatusConfig = statuses.find(s => s.id === originalStatus);

    async function handleRestore() {
        if (!selectedStatus) return;

        setIsRestoring(true);
        try {
            await onRestore(selectedStatus);
            onClose();
        } catch (error) {
            console.error('Failed to restore ticket:', error);
        } finally {
            setIsRestoring(false);
        }
    }

    return ReactDOM.createPortal(
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200]"
                onClick={onClose}
            />

            {/* Dialog */}
            <div className="fixed inset-0 z-[210] flex items-center justify-center p-4">
                <div
                    className="w-full max-w-md bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Restore Ticket</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{ticket.id}: {ticket.title}</p>
                    </div>

                    {/* Body */}
                    <div className="px-6 py-4 space-y-4">
                        {/* Original status info */}
                        {originalStatusConfig && (
                            <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
                                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Originally in:</p>
                                <span className="inline-flex items-center px-2 py-1 rounded text-sm font-medium bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200">
                                    {originalStatusConfig.name}
                                </span>
                            </div>
                        )}

                        {/* Status selector */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Restore to status:
                            </label>
                            <div className="space-y-2">
                                {statuses.map((status) => (
                                    <label
                                        key={status.id}
                                        className={`flex items-center p-3 rounded-lg border cursor-pointer transition-colors ${
                                            selectedStatus === status.id
                                                ? 'border-purple-500 bg-purple-50 dark:bg-purple-500/10'
                                                : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                                        }`}
                                    >
                                        <input
                                            type="radio"
                                            name="targetStatus"
                                            value={status.id}
                                            checked={selectedStatus === status.id}
                                            onChange={(e) => setSelectedStatus(e.target.value)}
                                            className="sr-only"
                                        />
                                        <div className="flex items-center gap-3 flex-1">
                                            <div
                                                className={`w-3 h-3 rounded-full ${
                                                    selectedStatus === status.id
                                                        ? 'bg-purple-500'
                                                        : 'bg-gray-300 dark:bg-gray-600'
                                                }`}
                                            />
                                            <span className="text-gray-800 dark:text-gray-200">{status.name}</span>
                                        </div>
                                        {status.id === originalStatus && (
                                            <span className="text-xs text-gray-500">(original)</span>
                                        )}
                                    </label>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleRestore}
                            disabled={!selectedStatus || isRestoring}
                            className="px-4 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isRestoring ? 'Restoring...' : 'Restore Ticket'}
                        </button>
                    </div>
                </div>
            </div>
        </>,
        document.body
    );
}
