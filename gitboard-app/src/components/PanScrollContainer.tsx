'use client';

import { useRef, ReactNode } from 'react';
import { usePanScroll } from '@/hooks/usePanScroll';

interface PanScrollContainerProps {
    children: ReactNode;
    className?: string;
}

/**
 * A client component that provides click-and-drag pan scrolling functionality.
 *
 * Wraps content in a horizontally scrollable container that supports:
 * - Traditional scrollbar scrolling
 * - Click-and-drag pan scrolling on background areas
 *
 * Pan scrolling is carefully designed to not interfere with:
 * - Ticket card drag-and-drop
 * - Column reordering
 * - Clicking on tickets to open details
 * - Other interactive elements (buttons, inputs)
 */
export function PanScrollContainer({ children, className = '' }: PanScrollContainerProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const { isPanning, handleMouseDown, panClassName } = usePanScroll({ containerRef });

    return (
        <div
            ref={containerRef}
            className={`overflow-x-auto h-full px-8 pt-6 scrollbar-board ${panClassName} ${className}`}
            onMouseDown={handleMouseDown}
            data-pan-area
        >
            {children}
        </div>
    );
}
