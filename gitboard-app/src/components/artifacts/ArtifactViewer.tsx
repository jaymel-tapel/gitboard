'use client';

import { useState } from 'react';
import type { Artifact } from '@/lib/schemas';
import { TicketArtifactViewer } from './TicketArtifactViewer';
import { ImageArtifactViewer } from './ImageArtifactViewer';
import { CodeArtifactViewer } from './CodeArtifactViewer';
import { FilesArtifactViewer } from './FilesArtifactViewer';

/**
 * Utility to format unknown type slugs to human-readable labels
 * e.g., 'security-review' → 'Security Review'
 */
function formatTypeLabel(type: string): string {
    return type
        .replace(/[-_]/g, ' ') // Replace hyphens and underscores with spaces
        .replace(/\b\w/g, (char) => char.toUpperCase()); // Capitalize first letter of each word
}

/**
 * Recursively render JSON content as a pretty document
 */
function renderPrettyContent(data: unknown, depth: number = 0): React.ReactNode {
    if (data === null || data === undefined) {
        return <span className="text-gray-500 italic">N/A</span>;
    }

    if (typeof data === 'string') {
        return <span className="text-gray-700 dark:text-gray-300">{data}</span>;
    }

    if (typeof data === 'number' || typeof data === 'boolean') {
        return <span className="text-purple-600 dark:text-purple-400">{String(data)}</span>;
    }

    if (Array.isArray(data)) {
        if (data.length === 0) {
            return <span className="text-gray-500 italic">None</span>;
        }
        // Check if it's an array of simple strings
        if (data.every(item => typeof item === 'string')) {
            return (
                <ul className="list-disc list-inside space-y-1 text-gray-700 dark:text-gray-300">
                    {data.map((item, i) => (
                        <li key={i}>{item}</li>
                    ))}
                </ul>
            );
        }
        // Array of objects - render each as a card
        return (
            <div className="space-y-3">
                {data.map((item, i) => (
                    <div key={i} className="bg-gray-100 dark:bg-gray-800/50 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
                        {renderPrettyContent(item, depth + 1)}
                    </div>
                ))}
            </div>
        );
    }

    if (typeof data === 'object') {
        const entries = Object.entries(data as Record<string, unknown>);
        return (
            <div className={depth > 0 ? 'space-y-2' : 'space-y-4'}>
                {entries.map(([key, value]) => {
                    const label = formatTypeLabel(key);
                    const isNestedObject = typeof value === 'object' && value !== null && !Array.isArray(value);
                    const isArray = Array.isArray(value);

                    return (
                        <div key={key}>
                            <div className={`font-medium ${depth === 0 ? 'text-purple-600 dark:text-purple-400 text-sm uppercase tracking-wide mb-2' : 'text-gray-500 dark:text-gray-400 text-xs mb-1'}`}>
                                {label}
                            </div>
                            <div className={isNestedObject || isArray ? '' : 'text-sm'}>
                                {renderPrettyContent(value, depth + 1)}
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    }

    return <span className="text-gray-700 dark:text-gray-300">{String(data)}</span>;
}

interface ArtifactViewerProps {
    artifact: Artifact;
    onClose: () => void;
    onDelete?: (artifactId: string) => void;
}

/**
 * ArtifactViewer - Right panel viewer for artifacts
 *
 * Replaces ContextSelector when an artifact is selected.
 * Renders the appropriate type-specific viewer based on artifact.type.
 */
export function ArtifactViewer({ artifact, onClose, onDelete }: ArtifactViewerProps) {
    const [viewMode, setViewMode] = useState<'pretty' | 'json'>('pretty');

    // Get type-specific icon
    const getIcon = () => {
        switch (artifact.type) {
            case 'ticket':
                return (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                );
            case 'image':
                return (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                );
            case 'code':
                return (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                    </svg>
                );
            case 'markdown':
                return (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                );
            case 'diagram':
                return (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                    </svg>
                );
            case 'files':
                return (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                    </svg>
                );
            default:
                return (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                );
        }
    };

    // Get type label - handles both known and unknown types
    const getTypeLabel = () => {
        switch (artifact.type) {
            case 'ticket':
                return 'Generated Ticket';
            case 'image':
                return 'Image';
            case 'code':
                return 'Code Snippet';
            case 'markdown':
                return 'Markdown';
            case 'diagram':
                return 'Diagram';
            case 'files':
                return 'File Changes';
            default:
                // For unknown types, format the slug to human-readable
                return formatTypeLabel(artifact.type);
        }
    };

    // Render type-specific viewer
    const renderViewer = () => {
        switch (artifact.type) {
            case 'ticket':
                return <TicketArtifactViewer artifact={artifact} />;
            case 'image':
                return <ImageArtifactViewer artifact={artifact} />;
            case 'code':
                return <CodeArtifactViewer artifact={artifact} />;
            case 'markdown':
                // Fallback to simple markdown display for now
                return (
                    <div className="prose dark:prose-invert max-w-none p-4">
                        <pre className="whitespace-pre-wrap text-sm">{artifact.content.markdown}</pre>
                    </div>
                );
            case 'diagram':
                // Fallback to source display for now
                return (
                    <div className="p-4">
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                            Diagram Type: {artifact.content.diagramType}
                        </p>
                        <pre className="bg-gray-100 dark:bg-gray-800 rounded-lg p-4 text-sm overflow-x-auto">
                            {artifact.content.source}
                        </pre>
                    </div>
                );
            case 'files':
                return <FilesArtifactViewer artifact={artifact} />;
            default:
                // Generic viewer for unknown artifact types
                const content = (artifact as { content: Record<string, unknown> }).content;
                return (
                    <div className="p-4">
                        {/* View mode toggle */}
                        <div className="mb-4 flex items-center justify-between">
                            <div className="flex items-center gap-2 text-purple-600 dark:text-purple-400 text-sm">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <span>Type: <code className="font-mono bg-purple-100 dark:bg-purple-900/30 px-1.5 py-0.5 rounded">{artifact.type}</code></span>
                            </div>
                            <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
                                <button
                                    onClick={() => setViewMode('pretty')}
                                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                                        viewMode === 'pretty'
                                            ? 'bg-purple-600 text-white'
                                            : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                                    }`}
                                >
                                    Pretty
                                </button>
                                <button
                                    onClick={() => setViewMode('json')}
                                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                                        viewMode === 'json'
                                            ? 'bg-purple-600 text-white'
                                            : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                                    }`}
                                >
                                    JSON
                                </button>
                            </div>
                        </div>

                        {viewMode === 'pretty' ? (
                            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                                {renderPrettyContent(content)}
                            </div>
                        ) : (
                            <div className="bg-gray-100 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                                <pre className="p-4 text-sm text-gray-700 dark:text-gray-300 overflow-x-auto font-mono leading-relaxed">
                                    {JSON.stringify(content, null, 2)}
                                </pre>
                            </div>
                        )}
                    </div>
                );
        }
    };

    return (
        <div className="flex flex-col h-full bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-600/20 text-purple-600 dark:text-purple-400">
                        {getIcon()}
                    </div>
                    <div className="min-w-0">
                        <p className="text-xs font-medium text-purple-600 dark:text-purple-400 uppercase tracking-wide">
                            {getTypeLabel()}
                        </p>
                        <h3 className="font-semibold text-gray-900 dark:text-gray-100 truncate">
                            {artifact.title}
                        </h3>
                    </div>
                </div>
                <button
                    onClick={onClose}
                    className="flex-shrink-0 p-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                    title="Close viewer"
                >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
                {renderViewer()}
            </div>

            {/* Footer */}
            <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex items-center justify-between">
                <p className="text-xs text-gray-500">
                    Created {new Date(artifact.createdAt).toLocaleString()}
                </p>
                {onDelete && (
                    <button
                        onClick={() => onDelete(artifact.id)}
                        className="px-3 py-1.5 text-xs text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/20 rounded-lg transition-colors flex items-center gap-1.5"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        Delete
                    </button>
                )}
            </div>
        </div>
    );
}
