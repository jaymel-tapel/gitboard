'use client';

import { useState } from 'react';
import type { TicketArtifact } from '@/lib/schemas';

interface TicketArtifactViewerProps {
    artifact: TicketArtifact;
}

/**
 * TicketArtifactViewer - Displays raw JSON output of generated ticket
 */
export function TicketArtifactViewer({ artifact }: TicketArtifactViewerProps) {
    const [copied, setCopied] = useState(false);

    const jsonContent = JSON.stringify(artifact.content, null, 2);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(jsonContent);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    };

    return (
        <div className="p-4">
            {/* Header with copy button */}
            <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                    Raw Output
                </span>
                <button
                    onClick={handleCopy}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors ${
                        copied
                            ? 'bg-green-600 text-white'
                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                >
                    {copied ? (
                        <>
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            Copied!
                        </>
                    ) : (
                        <>
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                            Copy
                        </>
                    )}
                </button>
            </div>

            {/* JSON code block */}
            <pre className="bg-gray-950 rounded-lg p-4 overflow-x-auto border border-gray-700">
                <code className="text-sm font-mono text-gray-200 whitespace-pre">
                    {jsonContent}
                </code>
            </pre>
        </div>
    );
}
