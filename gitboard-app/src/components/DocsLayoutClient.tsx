'use client';

import { useState, useEffect, useCallback } from 'react';
import { DocsAgentChat } from './DocsAgentChat';
import type { DocContext } from './DocsAgentButton';

interface DocsLayoutClientProps {
    children: React.ReactNode;
}

export function DocsLayoutClient({ children }: DocsLayoutClientProps) {
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [docContext, setDocContext] = useState<DocContext | null>(null);

    const handleToggle = useCallback(() => {
        setIsChatOpen((prev) => {
            if (prev) {
                // Closing — clear context
                setDocContext(null);
            }
            return !prev;
        });
    }, []);

    // Listen for custom event from DocsAgentButton
    useEffect(() => {
        const handler = (event: Event) => {
            const customEvent = event as CustomEvent<DocContext | null>;
            const detail = customEvent.detail || null;

            setIsChatOpen((prev) => {
                if (!prev) {
                    // Opening — set context from event detail
                    setDocContext(detail);
                } else {
                    // Closing — clear context
                    setDocContext(null);
                }
                return !prev;
            });
        };
        window.addEventListener('toggleDocsAgent', handler);
        return () => window.removeEventListener('toggleDocsAgent', handler);
    }, []);

    return (
        <>
            {children}
            <DocsAgentChat isOpen={isChatOpen} onToggle={handleToggle} docContext={docContext} />
        </>
    );
}
