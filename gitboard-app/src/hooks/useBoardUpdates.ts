'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import type { TicketWithStatus, StatusConfig } from '@/lib/schemas';

interface BoardStats {
    todo: number;
    doing: number;
    blocked: number;
    done: number;
    total: number;
}

interface UpdateResponse {
    lastModified: number;
    stats: BoardStats;
    timestamp: number;
}

interface TicketsResponse {
    tickets: Record<string, TicketWithStatus[]>;
    statuses: StatusConfig[];
    timestamp: number;
}

interface UseBoardUpdatesOptions {
    intervalMs?: number;
    onUpdate?: (tickets: Record<string, TicketWithStatus[]>, timestamp: number) => void;
    boardId?: string;
}

interface UseBoardUpdatesReturn {
    lastUpdated: number | null;
    isPolling: boolean;
    forceRefresh: () => Promise<void>;
}

/**
 * Hook to poll for board updates and merge changes into client state
 *
 * Instead of calling router.refresh() which remounts the entire component tree,
 * this hook now fetches updated ticket data and calls onUpdate callback to
 * merge the changes into the existing client state, preserving component instances
 * and their local state (including open terminals).
 *
 * @param options.intervalMs - Polling interval in milliseconds (default: 3000ms / 3 seconds)
 * @param options.onUpdate - Callback to merge updated tickets into client state
 */
export function useBoardUpdates(options: UseBoardUpdatesOptions = {}): UseBoardUpdatesReturn {
    const { intervalMs = 3000, onUpdate, boardId } = options;

    const lastModifiedRef = useRef<number | null>(null);
    const isFirstLoadRef = useRef(true);
    const [lastUpdated, setLastUpdated] = useState<number | null>(null);
    const [isPolling, setIsPolling] = useState(false);

    const fetchAndMergeTickets = useCallback(async (): Promise<boolean> => {
        try {
            const ticketsUrl = boardId
                ? `/api/board/tickets?boardId=${encodeURIComponent(boardId)}`
                : '/api/board/tickets';
            const response = await fetch(ticketsUrl, {
                cache: 'no-store',
            });

            if (response.ok) {
                const data: TicketsResponse = await response.json();

                if (onUpdate) {
                    onUpdate(data.tickets, data.timestamp);
                }

                setLastUpdated(data.timestamp);
                return true;
            }
        } catch (error) {
            console.error('Failed to fetch tickets for merge:', error);
        }
        return false;
    }, [onUpdate, boardId]);

    const forceRefresh = useCallback(async () => {
        await fetchAndMergeTickets();
    }, [fetchAndMergeTickets]);

    useEffect(() => {
        let timeoutId: NodeJS.Timeout;
        let isMounted = true;

        const checkForUpdates = async () => {
            if (!isMounted) return;

            setIsPolling(true);

            try {
                // First check if there are any changes via the updates endpoint
                const updatesUrl = boardId
                    ? `/api/board/updates?boardId=${encodeURIComponent(boardId)}`
                    : '/api/board/updates';
                const response = await fetch(updatesUrl, {
                    cache: 'no-store',
                });

                if (response.ok && isMounted) {
                    const data: UpdateResponse = await response.json();

                    // On first load, just store the timestamp
                    if (isFirstLoadRef.current) {
                        lastModifiedRef.current = data.lastModified;
                        isFirstLoadRef.current = false;
                        setLastUpdated(Date.now());
                    } else if (
                        lastModifiedRef.current !== null &&
                        data.lastModified > lastModifiedRef.current
                    ) {
                        // Changes detected - fetch and merge tickets instead of refreshing
                        console.log('Board changes detected, merging state...');
                        lastModifiedRef.current = data.lastModified;

                        // Fetch updated ticket data and merge into client state
                        await fetchAndMergeTickets();
                    }
                }
            } catch (error) {
                console.error('Failed to check for board updates:', error);
            } finally {
                if (isMounted) {
                    setIsPolling(false);
                    // Schedule next check
                    timeoutId = setTimeout(checkForUpdates, intervalMs);
                }
            }
        };

        // Start polling
        checkForUpdates();

        // Cleanup
        return () => {
            isMounted = false;
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
        };
    }, [intervalMs, fetchAndMergeTickets]);

    return {
        lastUpdated,
        isPolling,
        forceRefresh,
    };
}

// Legacy overload for backwards compatibility (will use router.refresh if no onUpdate provided)
// This maintains the old signature: useBoardUpdates(3000)
export function useBoardUpdatesLegacy(intervalMs: number = 3000) {
    // This is kept for backwards compatibility but logs a warning
    useEffect(() => {
        console.warn(
            'useBoardUpdatesLegacy is deprecated. Use useBoardUpdates with onUpdate callback instead.'
        );
    }, []);

    return useBoardUpdates({ intervalMs });
}
