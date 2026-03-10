'use client';

import { useBoardUpdates } from '@/hooks/useBoardUpdates';
import { BoardStateProvider, useBoardState } from '@/context/BoardStateContext';
import { useToast } from '@/context/ToastContext';
import { ReactNode, useCallback, useEffect } from 'react';
import type { TicketWithStatus, StatusConfig } from '@/lib/schemas';

interface BoardWrapperProps {
    children: ReactNode;
    initialTickets: Record<string, TicketWithStatus[]>;
    initialStatuses: StatusConfig[];
    boardId?: string;
}

/**
 * Internal component that sets up polling with the board state context
 */
function BoardPollingWrapper({ children, boardId }: { children: ReactNode; boardId?: string }) {
    const { mergeServerState, openTerminal, state } = useBoardState();
    const { toast } = useToast();

    // Callback to merge server state into client state
    const handleUpdate = useCallback((tickets: Record<string, TicketWithStatus[]>, timestamp: number) => {
        mergeServerState(tickets, timestamp);
    }, [mergeServerState]);

    // Poll every 3 seconds for updates, merge instead of refresh
    const { isPolling } = useBoardUpdates({
        intervalMs: 3000,
        onUpdate: handleUpdate,
        boardId,
    });

    // Listen for auto-execute events from pipeline status changes
    useEffect(() => {
        const handleAutoExecute = (event: Event) => {
            const customEvent = event as CustomEvent<{ ticketId: string; agentId: string }>;
            const { ticketId, agentId } = customEvent.detail;

            console.log(`🚀 Pipeline auto-execute triggered for ticket ${ticketId} with agent ${agentId}`);

            // Check if there's already a terminal open
            if (state.openTerminalTicketId) {
                if (state.openTerminalTicketId === ticketId) {
                    // Same ticket already has terminal open, just show a toast
                    toast.info(`Terminal already open for ${ticketId}`);
                    return;
                } else {
                    // Different ticket has terminal open - warn user
                    toast.warning(`Auto-execute queued: Close terminal for ${state.openTerminalTicketId} first`);
                    return;
                }
            }

            try {
                // Show info toast about pipeline execution
                toast.info(`Pipeline: Auto-starting agent for ${ticketId}`);

                // Open the terminal for the ticket with pipeline context
                // Pass agentId for auto-selection and pipelineMode=true for artifact auto-inclusion
                openTerminal(ticketId, agentId, true);
            } catch (error) {
                console.error('Pipeline auto-execute failed:', error);
                toast.error(`Pipeline execution failed for ${ticketId}`);
            }
        };

        // Listen for pipeline execution errors
        const handleAutoExecuteError = (event: Event) => {
            const customEvent = event as CustomEvent<{ ticketId: string; error: string }>;
            const { ticketId, error } = customEvent.detail;

            console.error(`❌ Pipeline auto-execute error for ${ticketId}:`, error);
            toast.error(`Pipeline failed: ${error}`);
        };

        window.addEventListener('gitboard:auto-execute', handleAutoExecute);
        window.addEventListener('gitboard:auto-execute-error', handleAutoExecuteError);

        return () => {
            window.removeEventListener('gitboard:auto-execute', handleAutoExecute);
            window.removeEventListener('gitboard:auto-execute-error', handleAutoExecuteError);
        };
    }, [openTerminal, state.openTerminalTicketId, toast]);

    return <>{children}</>;
}

/**
 * Client component wrapper that provides centralized board state
 * and polls for updates, merging changes instead of refreshing
 * to preserve component state (including open terminals)
 */
export function BoardWrapper({ children, initialTickets, initialStatuses, boardId }: BoardWrapperProps) {
    return (
        <BoardStateProvider initialTickets={initialTickets} initialStatuses={initialStatuses} boardId={boardId}>
            <BoardPollingWrapper boardId={boardId}>
                {children}
            </BoardPollingWrapper>
        </BoardStateProvider>
    );
}
