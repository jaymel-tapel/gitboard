'use client'

import { useState } from 'react';
import type { TicketWithStatus, TeamMember, StatusConfig } from '@/lib/schemas';
import { TicketCard } from './TicketCard';
import { reorderStatuses } from '@/app/actions';
import { useBoardState } from '@/context/BoardStateContext';

interface ColumnProps {
    title: string;
    color: StatusConfig['color'];
    status: string;
    statusConfig: StatusConfig;
    ownerNames: Record<string, string>;
    teamMembers?: TeamMember[];
    allStatuses: StatusConfig[];
}

export function Column({
    title,
    color,
    status,
    statusConfig,
    ownerNames,
    teamMembers = [],
    allStatuses
}: ColumnProps) {
    const { state, moveTicket, reorderTicket } = useBoardState();
    const [isDragOver, setIsDragOver] = useState(false);
    const [isColumnDragOver, setIsColumnDragOver] = useState(false);
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

    // Get tickets for this column from the centralized state
    const tickets = state.tickets[status] || [];
    const count = tickets.length;

    // Ticket drag handlers
    function handleDragOver(e: React.DragEvent) {
        e.preventDefault();
        const dragType = e.dataTransfer.types.includes('ticketid') ? 'ticket' : 'column';
        if (dragType === 'ticket') {
            setIsDragOver(true);
        }
    }

    function handleDragLeave() {
        setIsDragOver(false);
        setDragOverIndex(null);
    }

    function handleCardDragOver(e: React.DragEvent, index: number) {
        e.preventDefault();
        e.stopPropagation();
        setDragOverIndex(index);
    }

    async function handleDrop(e: React.DragEvent) {
        e.preventDefault();
        setIsDragOver(false);
        setDragOverIndex(null);

        const ticketId = e.dataTransfer.getData('ticketId');
        const fromStatus = e.dataTransfer.getData('fromStatus');

        if (!ticketId) return;

        // Cross-column move - use optimistic update via context
        if (fromStatus !== status) {
            await moveTicket(ticketId, fromStatus, status);
            return;
        }
    }

    async function handleCardDrop(e: React.DragEvent, dropIndex: number) {
        e.preventDefault();
        e.stopPropagation();
        setDragOverIndex(null);

        const ticketId = e.dataTransfer.getData('ticketId');
        const fromStatus = e.dataTransfer.getData('fromStatus');

        if (!ticketId) return;

        // Cross-column move - insert at the specific drop position
        if (fromStatus !== status) {
            await moveTicket(ticketId, fromStatus, status, dropIndex);
            return;
        }

        // Same column reorder
        const currentIndex = tickets.findIndex(t => t.id === ticketId);
        if (currentIndex === -1 || currentIndex === dropIndex) return;

        await reorderTicket(ticketId, status, currentIndex, dropIndex);
    }

    // Column drag handlers for reordering columns
    function handleColumnDragStart(e: React.DragEvent) {
        e.dataTransfer.setData('columnId', status);
        e.dataTransfer.effectAllowed = 'move';
    }

    function handleColumnDragOver(e: React.DragEvent) {
        e.preventDefault();
        const columnId = e.dataTransfer.types.includes('columnid');
        if (columnId) {
            setIsColumnDragOver(true);
        }
    }

    function handleColumnDragLeave() {
        setIsColumnDragOver(false);
    }

    async function handleColumnDrop(e: React.DragEvent) {
        e.preventDefault();
        setIsColumnDragOver(false);

        const draggedColumnId = e.dataTransfer.getData('columnId');
        if (!draggedColumnId || draggedColumnId === status) return;

        // Calculate new order
        const currentOrder = [...allStatuses].sort((a, b) => a.order - b.order);
        const draggedIndex = currentOrder.findIndex(s => s.id === draggedColumnId);
        const dropIndex = currentOrder.findIndex(s => s.id === status);

        if (draggedIndex === -1 || dropIndex === -1) return;

        // Reorder
        const newOrder = [...currentOrder];
        const [dragged] = newOrder.splice(draggedIndex, 1);
        newOrder.splice(dropIndex, 0, dragged!);

        await reorderStatuses(newOrder.map(s => s.id));
    }

    return (
        <div
            className={`flex flex-col h-full transition-all ${isColumnDragOver ? 'ring-2 ring-purple-500/50 ring-offset-2 ring-offset-transparent rounded-xl' : ''}`}
            onDragOver={(e) => {
                handleDragOver(e);
                handleColumnDragOver(e);
            }}
            onDragLeave={() => {
                handleDragLeave();
                handleColumnDragLeave();
            }}
            onDrop={(e) => {
                // Check what type of drop this is
                if (e.dataTransfer.getData('columnId')) {
                    handleColumnDrop(e);
                } else {
                    handleDrop(e);
                }
            }}
        >
            {/* Column Header - Draggable for reordering */}
            <div
                className="mb-4 px-1 cursor-grab active:cursor-grabbing flex-shrink-0"
                draggable
                onDragStart={handleColumnDragStart}
            >
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <h2 className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                            {title}
                        </h2>
                        {/* Pipeline indicator */}
                        {statusConfig.assignedAgent && (
                            <span
                                className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                    statusConfig.autoExecute
                                        ? 'bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-400 border border-purple-200 dark:border-purple-500/30'
                                        : 'bg-gray-100 dark:bg-gray-700/50 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700'
                                }`}
                                title={`Agent assigned${statusConfig.autoExecute ? ' (auto-execute)' : ''}`}
                            >
                                <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                </svg>
                                {statusConfig.autoExecute ? 'Auto' : 'Agent'}
                            </span>
                        )}
                    </div>
                    <span className="text-xs text-gray-400 dark:text-gray-500">{count}</span>
                </div>
            </div>

            {/* Tickets */}
            <div
                className={`space-y-3 flex-1 min-h-0 overflow-y-auto scrollbar-thin rounded-xl transition-colors p-2 -m-2 ${isDragOver ? 'bg-white/30 dark:bg-white/5' : ''
                    }`}
            >
                {tickets.length === 0 ? (
                    <div className="px-1 py-12 text-center text-sm text-gray-400 dark:text-gray-500">
                        {isDragOver ? 'Drop here' : 'No tickets'}
                    </div>
                ) : (
                    tickets.map((ticket, index) => (
                        <div
                            key={ticket.id}
                            onDragOver={(e) => handleCardDragOver(e, index)}
                            onDrop={(e) => handleCardDrop(e, index)}
                            className="relative"
                        >
                            {/* Drop indicator */}
                            {dragOverIndex === index && (
                                <div className="absolute -top-1.5 left-0 right-0 h-0.5 bg-purple-500/70 rounded-full z-10" />
                            )}
                            <TicketCard
                                ticket={ticket}
                                status={status}
                                ownerName={ownerNames[ticket.owner || ''] || ticket.owner}
                                teamMembers={teamMembers}
                            />
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
