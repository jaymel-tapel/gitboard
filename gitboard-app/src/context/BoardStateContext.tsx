'use client';

import React, { createContext, useContext, useReducer, useCallback, useRef } from 'react';
import type { Ticket, TicketWithStatus, StatusConfig } from '@/lib/schemas';
import { useToast } from './ToastContext';

// ============================================================================
// Archived Ticket Types
// ============================================================================

interface ArchivedTicket {
    ticket: Ticket;
    yearMonth: string;
}

// ============================================================================
// Types
// ============================================================================

interface PendingMove {
    ticketId: string;
    fromStatus: string;
    toStatus: string;
    timestamp: number;
}

interface PendingAutoExecute {
    ticketId: string;
    agentId: string;
}

interface BoardState {
    // Tickets grouped by status
    tickets: Record<string, TicketWithStatus[]>;
    // Archived tickets
    archivedTickets: ArchivedTicket[];
    // Archived ticket count (for badge display without loading all tickets)
    archivedTicketCount: number;
    // Track which ticket has an open terminal
    openTerminalTicketId: string | null;
    // Track the agent ID for pipeline auto-execution
    openTerminalAgentId: string | null;
    // Track if terminal was opened in pipeline mode (auto-execute)
    openTerminalPipelineMode: boolean;
    // Track pending optimistic moves for rollback
    pendingMoves: Map<string, PendingMove>;
    // Last known server timestamp
    lastServerTimestamp: number;
    // Error message for display
    error: string | null;
    // Statuses configuration
    statuses: StatusConfig[];
    // Current board ID
    boardId?: string;
}

type BoardAction =
    | { type: 'SET_INITIAL_STATE'; payload: { tickets: Record<string, TicketWithStatus[]>; statuses: StatusConfig[] } }
    | { type: 'MOVE_TICKET_OPTIMISTIC'; payload: { ticketId: string; fromStatus: string; toStatus: string; targetIndex?: number } }
    | { type: 'REORDER_TICKET'; payload: { ticketId: string; status: string; fromIndex: number; toIndex: number } }
    | { type: 'CONFIRM_MOVE'; payload: { ticketId: string } }
    | { type: 'ROLLBACK_MOVE'; payload: { ticketId: string } }
    | { type: 'MERGE_SERVER_STATE'; payload: { tickets: Record<string, TicketWithStatus[]>; timestamp: number } }
    | { type: 'OPEN_TERMINAL'; payload: { ticketId: string; agentId?: string; pipelineMode?: boolean } }
    | { type: 'CLOSE_TERMINAL' }
    | { type: 'SET_ERROR'; payload: string | null }
    | { type: 'CLEAR_PENDING_MOVES' }
    // Archive actions
    | { type: 'ARCHIVE_TICKET_OPTIMISTIC'; payload: { ticketId: string; fromStatus: string } }
    | { type: 'RESTORE_TICKET_OPTIMISTIC'; payload: { ticketId: string; toStatus: string; ticket: Ticket } }
    | { type: 'SET_ARCHIVED_TICKETS'; payload: { tickets: ArchivedTicket[]; count: number } }
    | { type: 'SET_ARCHIVED_TICKET_COUNT'; payload: number };

interface BoardContextValue {
    state: BoardState;
    moveTicket: (ticketId: string, fromStatus: string, toStatus: string, targetIndex?: number) => Promise<void>;
    reorderTicket: (ticketId: string, status: string, fromIndex: number, toIndex: number) => Promise<void>;
    confirmMove: (ticketId: string) => void;
    rollbackMove: (ticketId: string) => void;
    mergeServerState: (tickets: Record<string, TicketWithStatus[]>, timestamp: number) => void;
    openTerminal: (ticketId: string, agentId?: string, pipelineMode?: boolean) => void;
    closeTerminal: () => void;
    setError: (error: string | null) => void;
    getTicketById: (ticketId: string) => TicketWithStatus | undefined;
    isTerminalOpen: (ticketId: string) => boolean;
    // Archive functions
    archiveTicket: (ticketId: string, fromStatus: string) => Promise<void>;
    restoreTicket: (ticketId: string, toStatus: string) => Promise<void>;
    setArchivedTickets: (tickets: ArchivedTicket[], count: number) => void;
    setArchivedTicketCount: (count: number) => void;
}

// ============================================================================
// Initial State
// ============================================================================

const initialState: BoardState = {
    tickets: {},
    archivedTickets: [],
    archivedTicketCount: 0,
    openTerminalTicketId: null,
    openTerminalAgentId: null,
    openTerminalPipelineMode: false,
    pendingMoves: new Map(),
    lastServerTimestamp: 0,
    error: null,
    statuses: [],
};

// ============================================================================
// Reducer
// ============================================================================

function boardReducer(state: BoardState, action: BoardAction): BoardState {
    switch (action.type) {
        case 'SET_INITIAL_STATE': {
            return {
                ...state,
                tickets: action.payload.tickets,
                statuses: action.payload.statuses,
            };
        }

        case 'MOVE_TICKET_OPTIMISTIC': {
            const { ticketId, fromStatus, toStatus, targetIndex } = action.payload;
            const newTickets = { ...state.tickets };

            // Find the ticket in the source column
            const sourceTickets = newTickets[fromStatus] || [];
            const ticketIndex = sourceTickets.findIndex(t => t.id === ticketId);

            if (ticketIndex === -1) {
                console.warn(`Ticket ${ticketId} not found in ${fromStatus}`);
                return state;
            }

            const ticket = sourceTickets[ticketIndex]!;

            // Remove from source
            newTickets[fromStatus] = sourceTickets.filter(t => t.id !== ticketId);

            // Add to destination with updated status
            const destTickets = [...(newTickets[toStatus] || [])];
            const boardPath = state.boardId ? `gitboard/boards/${state.boardId}/tickets` : 'gitboard/tickets';
            const movedTicket: TicketWithStatus = {
                ...ticket,
                status: toStatus,
                path: `${boardPath}/${toStatus}/${ticketId}.json`,
            };
            if (targetIndex !== undefined) {
                destTickets.splice(targetIndex, 0, movedTicket);
            } else {
                destTickets.unshift(movedTicket);
            }
            newTickets[toStatus] = destTickets;

            // Track the pending move
            const newPendingMoves = new Map(state.pendingMoves);
            newPendingMoves.set(ticketId, {
                ticketId,
                fromStatus,
                toStatus,
                timestamp: Date.now(),
            });

            return {
                ...state,
                tickets: newTickets,
                pendingMoves: newPendingMoves,
            };
        }

        case 'REORDER_TICKET': {
            const { ticketId, status, fromIndex, toIndex } = action.payload;
            const newTickets = { ...state.tickets };
            const columnTickets = [...(newTickets[status] || [])];

            const ticketIndex = columnTickets.findIndex(t => t.id === ticketId);
            if (ticketIndex === -1) return state;

            const [moved] = columnTickets.splice(ticketIndex, 1);
            columnTickets.splice(toIndex, 0, moved!);
            newTickets[status] = columnTickets;

            return { ...state, tickets: newTickets };
        }

        case 'CONFIRM_MOVE': {
            const newPendingMoves = new Map(state.pendingMoves);
            newPendingMoves.delete(action.payload.ticketId);
            return {
                ...state,
                pendingMoves: newPendingMoves,
            };
        }

        case 'ROLLBACK_MOVE': {
            const { ticketId } = action.payload;
            const pendingMove = state.pendingMoves.get(ticketId);

            if (!pendingMove) {
                console.warn(`No pending move found for ${ticketId}`);
                return state;
            }

            const { fromStatus, toStatus } = pendingMove;
            const newTickets = { ...state.tickets };

            // Find the ticket in the destination column (where it was moved to)
            const destTickets = newTickets[toStatus] || [];
            const ticketIndex = destTickets.findIndex(t => t.id === ticketId);

            if (ticketIndex === -1) {
                console.warn(`Ticket ${ticketId} not found in ${toStatus} for rollback`);
                const newPendingMoves = new Map(state.pendingMoves);
                newPendingMoves.delete(ticketId);
                return { ...state, pendingMoves: newPendingMoves };
            }

            const ticket = destTickets[ticketIndex]!;

            // Remove from current location
            newTickets[toStatus] = destTickets.filter(t => t.id !== ticketId);

            // Add back to original location
            const sourceTickets = newTickets[fromStatus] || [];
            const boardPath = state.boardId ? `gitboard/boards/${state.boardId}/tickets` : 'gitboard/tickets';
            const rolledBackTicket: TicketWithStatus = {
                ...ticket,
                status: fromStatus,
                path: `${boardPath}/${fromStatus}/${ticketId}.json`,
            };
            newTickets[fromStatus] = [rolledBackTicket, ...sourceTickets];

            // Remove from pending
            const newPendingMoves = new Map(state.pendingMoves);
            newPendingMoves.delete(ticketId);

            return {
                ...state,
                tickets: newTickets,
                pendingMoves: newPendingMoves,
            };
        }

        case 'MERGE_SERVER_STATE': {
            const { tickets: serverTickets, timestamp } = action.payload;
            const newTickets: Record<string, TicketWithStatus[]> = {};

            // Start with server state
            for (const [status, ticketList] of Object.entries(serverTickets)) {
                newTickets[status] = [...ticketList];
            }

            // Preserve pending moves - tickets that are in flight should keep their optimistic position
            for (const [ticketId, pendingMove] of state.pendingMoves) {
                const { toStatus } = pendingMove;

                // Check if ticket exists in the new state somewhere
                let ticketExists = false;
                let existingTicket: TicketWithStatus | null = null;

                for (const [status, ticketList] of Object.entries(newTickets)) {
                    const found = ticketList.find(t => t.id === ticketId);
                    if (found) {
                        ticketExists = true;
                        existingTicket = found;
                        // Remove from wherever it is in server state
                        newTickets[status] = ticketList.filter(t => t.id !== ticketId);
                        break;
                    }
                }

                // If ticket still exists, put it in the optimistic position
                if (ticketExists && existingTicket) {
                    const destTickets = newTickets[toStatus] || [];
                    const mergeBoardPath = state.boardId ? `gitboard/boards/${state.boardId}/tickets` : 'gitboard/tickets';
                    const movedTicket: TicketWithStatus = {
                        ...existingTicket,
                        status: toStatus,
                        path: `${mergeBoardPath}/${toStatus}/${ticketId}.json`,
                    };
                    newTickets[toStatus] = [movedTicket, ...destTickets];
                }
            }

            // Check if the terminal's ticket was deleted
            let terminalTicketId = state.openTerminalTicketId;
            if (terminalTicketId) {
                let terminalTicketExists = false;
                for (const ticketList of Object.values(newTickets)) {
                    if (ticketList.some(t => t.id === terminalTicketId)) {
                        terminalTicketExists = true;
                        break;
                    }
                }
                if (!terminalTicketExists) {
                    // Ticket was deleted externally, close the terminal
                    terminalTicketId = null;
                    console.log(`Ticket ${state.openTerminalTicketId} was deleted externally, closing terminal`);
                }
            }

            return {
                ...state,
                tickets: newTickets,
                lastServerTimestamp: timestamp,
                openTerminalTicketId: terminalTicketId,
            };
        }

        case 'OPEN_TERMINAL': {
            return {
                ...state,
                openTerminalTicketId: action.payload.ticketId,
                openTerminalAgentId: action.payload.agentId || null,
                openTerminalPipelineMode: action.payload.pipelineMode || false,
            };
        }

        case 'CLOSE_TERMINAL': {
            return {
                ...state,
                openTerminalTicketId: null,
                openTerminalAgentId: null,
                openTerminalPipelineMode: false,
            };
        }

        case 'SET_ERROR': {
            return {
                ...state,
                error: action.payload,
            };
        }

        case 'CLEAR_PENDING_MOVES': {
            return {
                ...state,
                pendingMoves: new Map(),
            };
        }

        case 'ARCHIVE_TICKET_OPTIMISTIC': {
            const { ticketId, fromStatus } = action.payload;
            const newTickets = { ...state.tickets };

            // Find and remove the ticket from its current status
            const sourceTickets = newTickets[fromStatus] || [];
            const ticketIndex = sourceTickets.findIndex(t => t.id === ticketId);

            if (ticketIndex === -1) {
                console.warn(`Ticket ${ticketId} not found in ${fromStatus} for archiving`);
                return state;
            }

            // Remove from source
            newTickets[fromStatus] = sourceTickets.filter(t => t.id !== ticketId);

            return {
                ...state,
                tickets: newTickets,
                archivedTicketCount: state.archivedTicketCount + 1,
            };
        }

        case 'RESTORE_TICKET_OPTIMISTIC': {
            const { ticketId, toStatus, ticket } = action.payload;
            const newTickets = { ...state.tickets };

            // Add ticket to the target status
            const destTickets = [...(newTickets[toStatus] || [])];
            const boardPath = state.boardId ? `gitboard/boards/${state.boardId}/tickets` : 'gitboard/tickets';
            const restoredTicket: TicketWithStatus = {
                ...ticket,
                status: toStatus,
                path: `${boardPath}/${toStatus}/${ticketId}.json`,
            };
            destTickets.unshift(restoredTicket);
            newTickets[toStatus] = destTickets;

            // Remove from archived tickets
            const newArchivedTickets = state.archivedTickets.filter(
                at => at.ticket.id !== ticketId
            );

            return {
                ...state,
                tickets: newTickets,
                archivedTickets: newArchivedTickets,
                archivedTicketCount: Math.max(0, state.archivedTicketCount - 1),
            };
        }

        case 'SET_ARCHIVED_TICKETS': {
            return {
                ...state,
                archivedTickets: action.payload.tickets,
                archivedTicketCount: action.payload.count,
            };
        }

        case 'SET_ARCHIVED_TICKET_COUNT': {
            return {
                ...state,
                archivedTicketCount: action.payload,
            };
        }

        default:
            return state;
    }
}

// ============================================================================
// Context
// ============================================================================

const BoardStateContext = createContext<BoardContextValue | null>(null);

// ============================================================================
// Provider
// ============================================================================

interface BoardStateProviderProps {
    children: React.ReactNode;
    initialTickets: Record<string, TicketWithStatus[]>;
    initialStatuses: StatusConfig[];
    boardId?: string;
}

export function BoardStateProvider({
    children,
    initialTickets,
    initialStatuses,
    boardId,
}: BoardStateProviderProps) {
    const [state, dispatch] = useReducer(boardReducer, {
        ...initialState,
        tickets: initialTickets,
        statuses: initialStatuses,
        boardId,
    });

    // Get toast context for notifications
    const { toast } = useToast();

    // Track if we've already initialized to avoid double initialization
    const initializedRef = useRef(false);

    // Update state when initial props change (e.g., from server re-render)
    React.useEffect(() => {
        if (!initializedRef.current) {
            initializedRef.current = true;
            return;
        }
        // Only update if we have no pending moves (to avoid conflicts)
        if (state.pendingMoves.size === 0) {
            dispatch({
                type: 'SET_INITIAL_STATE',
                payload: { tickets: initialTickets, statuses: initialStatuses },
            });
        }
    }, [initialTickets, initialStatuses]);

    const moveTicket = useCallback(async (ticketId: string, fromStatus: string, toStatus: string, targetIndex?: number) => {
        // Optimistic update
        dispatch({
            type: 'MOVE_TICKET_OPTIMISTIC',
            payload: { ticketId, fromStatus, toStatus, targetIndex },
        });

        try {
            // Import dynamically to avoid server action issues
            const { updateTicketStatus } = await import('@/app/actions');
            const result = await updateTicketStatus(ticketId, toStatus, targetIndex, boardId);

            if (result.success) {
                dispatch({ type: 'CONFIRM_MOVE', payload: { ticketId } });

                // Check if auto-execution should be triggered
                if (result.autoExecute) {
                    // Dispatch custom event for auto-execution
                    const event = new CustomEvent('gitboard:auto-execute', {
                        detail: {
                            ticketId: result.autoExecute.ticketId,
                            agentId: result.autoExecute.agentId,
                        },
                    });
                    window.dispatchEvent(event);
                }
            } else {
                // Rollback on failure
                dispatch({ type: 'ROLLBACK_MOVE', payload: { ticketId } });
                toast.error('Failed to move ticket. Please try again.');
            }
        } catch (error) {
            console.error('Error moving ticket:', error);
            dispatch({ type: 'ROLLBACK_MOVE', payload: { ticketId } });
            toast.error('Network error. Ticket move was rolled back.');
        }
    }, [boardId, toast]);

    const reorderTicket = useCallback(async (ticketId: string, status: string, fromIndex: number, toIndex: number) => {
        // Optimistic update
        dispatch({
            type: 'REORDER_TICKET',
            payload: { ticketId, status, fromIndex, toIndex },
        });

        try {
            const { reorderTicketInColumn } = await import('@/app/actions');
            const result = await reorderTicketInColumn(ticketId, status, toIndex, boardId);

            if (!result.success) {
                // Rollback by re-ordering back
                dispatch({
                    type: 'REORDER_TICKET',
                    payload: { ticketId, status, fromIndex: toIndex, toIndex: fromIndex },
                });
                toast.error('Failed to reorder ticket.');
            }
        } catch (error) {
            console.error('Error reordering ticket:', error);
            dispatch({
                type: 'REORDER_TICKET',
                payload: { ticketId, status, fromIndex: toIndex, toIndex: fromIndex },
            });
            toast.error('Network error. Reorder was rolled back.');
        }
    }, [boardId, toast]);

    const confirmMove = useCallback((ticketId: string) => {
        dispatch({ type: 'CONFIRM_MOVE', payload: { ticketId } });
    }, []);

    const rollbackMove = useCallback((ticketId: string) => {
        dispatch({ type: 'ROLLBACK_MOVE', payload: { ticketId } });
    }, []);

    const mergeServerState = useCallback((tickets: Record<string, TicketWithStatus[]>, timestamp: number) => {
        dispatch({
            type: 'MERGE_SERVER_STATE',
            payload: { tickets, timestamp },
        });
    }, []);

    const openTerminal = useCallback((ticketId: string, agentId?: string, pipelineMode?: boolean) => {
        dispatch({ type: 'OPEN_TERMINAL', payload: { ticketId, agentId, pipelineMode } });
    }, []);

    const openTerminalAutoExecute = useCallback((ticketId: string, agentId: string) => {
        dispatch({ type: 'OPEN_TERMINAL_AUTO_EXECUTE', payload: { ticketId, agentId } });
    }, []);

    const clearAutoExecute = useCallback(() => {
        dispatch({ type: 'CLEAR_AUTO_EXECUTE' });
    }, []);

    const closeTerminal = useCallback(() => {
        dispatch({ type: 'CLOSE_TERMINAL' });
    }, []);

    const setError = useCallback((error: string | null) => {
        dispatch({ type: 'SET_ERROR', payload: error });
    }, []);

    const getTicketById = useCallback((ticketId: string): TicketWithStatus | undefined => {
        for (const ticketList of Object.values(state.tickets)) {
            const ticket = ticketList.find(t => t.id === ticketId);
            if (ticket) return ticket;
        }
        return undefined;
    }, [state.tickets]);

    const isTerminalOpen = useCallback((ticketId: string): boolean => {
        return state.openTerminalTicketId === ticketId;
    }, [state.openTerminalTicketId]);

    // Archive a ticket (optimistic update with server call)
    const archiveTicket = useCallback(async (ticketId: string, fromStatus: string) => {
        // Optimistic update - remove from board
        dispatch({
            type: 'ARCHIVE_TICKET_OPTIMISTIC',
            payload: { ticketId, fromStatus },
        });

        try {
            const { archiveTicket: archiveTicketAction, restoreTicket: restoreTicketAction } = await import('@/app/actions');
            const result = await archiveTicketAction(ticketId, boardId);

            if (result.success) {
                // Show success toast with undo action
                toast.success('Ticket archived', {
                    action: {
                        label: 'Undo',
                        onClick: async () => {
                            try {
                                const restoreResult = await restoreTicketAction(ticketId, fromStatus, boardId);
                                if (restoreResult.success) {
                                    toast.success('Ticket restored successfully');
                                    // Refresh state by fetching tickets
                                    const response = await fetch(`/api/board/tickets?boardId=${boardId || 'default'}`);
                                    const data = await response.json();
                                    if (data.tickets) {
                                        dispatch({
                                            type: 'MERGE_SERVER_STATE',
                                            payload: { tickets: data.tickets, timestamp: Date.now() },
                                        });
                                    }
                                } else {
                                    toast.error(restoreResult.error || 'Failed to restore ticket');
                                }
                            } catch (error) {
                                console.error('Error restoring ticket:', error);
                                toast.error('Failed to restore ticket');
                            }
                        },
                    },
                });
            } else {
                // TODO: Rollback by fetching fresh state
                toast.error(result.error || 'Failed to archive ticket');
            }
        } catch (error) {
            console.error('Error archiving ticket:', error);
            toast.error('Network error while archiving ticket');
        }
    }, [boardId, toast]);

    // Restore a ticket from archive (optimistic update with server call)
    const restoreTicket = useCallback(async (ticketId: string, toStatus: string) => {
        // Find the archived ticket for optimistic update (with safeguard for uninitialized state)
        const archivedTickets = state.archivedTickets || [];
        const archivedTicket = archivedTickets.find(at => at.ticket.id === ticketId);

        if (archivedTicket) {
            // Optimistic update - add to board
            dispatch({
                type: 'RESTORE_TICKET_OPTIMISTIC',
                payload: { ticketId, toStatus, ticket: archivedTicket.ticket },
            });
        }

        try {
            const { restoreTicket: restoreTicketAction } = await import('@/app/actions');
            const result = await restoreTicketAction(ticketId, toStatus, boardId);

            if (result.success) {
                toast.success('Ticket restored successfully');
            } else {
                // TODO: Rollback by fetching fresh state
                toast.error(result.error || 'Failed to restore ticket');
            }
        } catch (error) {
            console.error('Error restoring ticket:', error);
            toast.error('Network error while restoring ticket');
        }
    }, [boardId, state.archivedTickets, toast]);

    // Set archived tickets (from API response)
    const setArchivedTickets = useCallback((tickets: ArchivedTicket[], count: number) => {
        dispatch({
            type: 'SET_ARCHIVED_TICKETS',
            payload: { tickets, count },
        });
    }, []);

    // Set just the archived ticket count (for badge display)
    const setArchivedTicketCount = useCallback((count: number) => {
        dispatch({
            type: 'SET_ARCHIVED_TICKET_COUNT',
            payload: count,
        });
    }, []);

    const value: BoardContextValue = {
        state,
        moveTicket,
        reorderTicket,
        confirmMove,
        rollbackMove,
        mergeServerState,
        openTerminal,
        openTerminalAutoExecute,
        clearAutoExecute,
        closeTerminal,
        setError,
        getTicketById,
        isTerminalOpen,
        archiveTicket,
        restoreTicket,
        setArchivedTickets,
        setArchivedTicketCount,
    };

    return (
        <BoardStateContext.Provider value={value}>
            {children}
        </BoardStateContext.Provider>
    );
}

// ============================================================================
// Hook
// ============================================================================

export function useBoardState(): BoardContextValue {
    const context = useContext(BoardStateContext);
    if (!context) {
        throw new Error('useBoardState must be used within a BoardStateProvider');
    }
    return context;
}

// Export for testing
export { boardReducer, initialState };
export type { BoardState, BoardAction, BoardContextValue, PendingMove, PendingAutoExecute, ArchivedTicket };
