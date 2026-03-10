import { useCallback, useRef, useState, useEffect, RefObject } from 'react';

interface UsePanScrollOptions {
    /** The scrollable container ref */
    containerRef: RefObject<HTMLDivElement | null>;
}

interface UsePanScrollReturn {
    /** Whether the user is currently panning */
    isPanning: boolean;
    /** Handler for mousedown events on the container */
    handleMouseDown: (e: React.MouseEvent<HTMLDivElement>) => void;
    /** Class names to apply based on pan state */
    panClassName: string;
}

/**
 * Custom hook that provides click-and-drag pan scrolling functionality.
 *
 * This hook enables horizontal scrolling by clicking and dragging on the
 * container background. It carefully avoids interfering with existing
 * drag-and-drop functionality for tickets and columns.
 */
export function usePanScroll({ containerRef }: UsePanScrollOptions): UsePanScrollReturn {
    const [isPanning, setIsPanning] = useState(false);
    const startX = useRef(0);
    const scrollLeft = useRef(0);

    /**
     * Check if the click target is a valid pan area (background, not interactive elements)
     * Uses a blacklist approach: allow panning everywhere except on specific interactive elements
     */
    const isPanTarget = useCallback((target: EventTarget | null): boolean => {
        if (!target || !(target instanceof HTMLElement)) return false;

        const container = containerRef.current;
        if (!container) return false;

        // Don't pan if clicking on draggable elements (ticket cards, column headers)
        if (target.getAttribute('draggable') === 'true') return false;
        if (target.closest('[draggable="true"]')) return false;

        // Don't pan if clicking on interactive elements
        if (target.closest('button, input, a, [role="button"], textarea, select')) return false;

        // Don't pan if clicking on elements marked as non-pan areas
        if (target.closest('[data-no-pan]')) return false;

        // Allow panning on everything else within the container
        return container.contains(target);
    }, [containerRef]);

    /**
     * Handle mouse down to start panning
     */
    const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        // Only respond to left mouse button
        if (e.button !== 0) return;

        // Check if we should pan (clicking on background, not on interactive elements)
        if (!isPanTarget(e.target)) return;

        const container = containerRef.current;
        if (!container) return;

        // Start panning
        setIsPanning(true);
        startX.current = e.pageX - container.offsetLeft;
        scrollLeft.current = container.scrollLeft;

        // Prevent text selection while panning
        e.preventDefault();
    }, [containerRef, isPanTarget]);

    /**
     * Handle global mouse move during panning
     */
    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!isPanning) return;

        const container = containerRef.current;
        if (!container) return;

        // Calculate the delta and update scroll position
        const x = e.pageX - container.offsetLeft;
        const delta = x - startX.current;

        // Scroll in the intuitive direction: dragging right reveals left columns
        container.scrollLeft = scrollLeft.current - delta;
    }, [isPanning, containerRef]);

    /**
     * Handle mouse up to stop panning
     */
    const handleMouseUp = useCallback(() => {
        setIsPanning(false);
    }, []);

    // Add global event listeners when panning is active
    useEffect(() => {
        if (isPanning) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);

            // Add a class to prevent text selection on the body
            document.body.style.userSelect = 'none';
            document.body.style.cursor = 'grabbing';
        }

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.body.style.userSelect = '';
            document.body.style.cursor = '';
        };
    }, [isPanning, handleMouseMove, handleMouseUp]);

    // Generate appropriate class names based on pan state
    const panClassName = isPanning
        ? 'cursor-grabbing select-none'
        : 'cursor-grab';

    return {
        isPanning,
        handleMouseDown,
        panClassName,
    };
}
