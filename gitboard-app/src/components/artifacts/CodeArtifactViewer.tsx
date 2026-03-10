'use client';

import { useState } from 'react';
import type { CodeArtifact } from '@/lib/schemas';

interface CodeArtifactViewerProps {
    artifact: CodeArtifact;
}

/**
 * CodeArtifactViewer - Displays code snippets with syntax highlighting and copy button
 *
 * Shows code with language label and one-click copy functionality.
 */
export function CodeArtifactViewer({ artifact }: CodeArtifactViewerProps) {
    const [copied, setCopied] = useState(false);
    const { content } = artifact;

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(content.code);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy code:', err);
        }
    };

    return (
        <div className="p-4">
            {/* Header with filename and language */}
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                    {content.filename && (
                        <span className="text-sm font-mono text-gray-200">
                            {content.filename}
                        </span>
                    )}
                    <span className="px-2 py-0.5 text-xs bg-gray-700 text-gray-300 rounded">
                        {content.language || 'text'}
                    </span>
                </div>
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

            {/* Code block */}
            <div className="relative rounded-lg overflow-hidden border border-gray-700">
                <pre className="bg-gray-950 p-4 overflow-x-auto">
                    <code className={`text-sm font-mono text-gray-200 language-${content.language || 'text'}`}>
                        {content.code}
                    </code>
                </pre>

                {/* Line count */}
                <div className="absolute bottom-2 right-2 px-2 py-0.5 bg-gray-800/80 rounded text-xs text-gray-500">
                    {content.code.split('\n').length} lines
                </div>
            </div>
        </div>
    );
}
