'use client';

import { useState, useEffect } from 'react';
import type { Artifact } from '@/lib/schemas';

interface ArtifactSelectorProps {
    ticketId: string;
    selectedArtifacts: string[];
    onSelectionChange: (artifactIds: string[]) => void;
    className?: string;
}

/**
 * ArtifactSelector - Component for selecting artifacts from previous pipeline stages
 *
 * Displays available artifacts for a ticket with checkbox selection.
 * Used in ContextSelector to allow users to include artifacts as context.
 */
export function ArtifactSelector({
    ticketId,
    selectedArtifacts,
    onSelectionChange,
    className = '',
}: ArtifactSelectorProps) {
    const [artifacts, setArtifacts] = useState<Artifact[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!ticketId) {
            setLoading(false);
            return;
        }

        setLoading(true);
        setError(null);

        fetch(`/api/ticket-artifacts/${ticketId}`)
            .then(res => {
                if (!res.ok) throw new Error('Failed to fetch artifacts');
                return res.json();
            })
            .then(data => {
                setArtifacts(data.artifacts || []);
                setLoading(false);
            })
            .catch(err => {
                console.error('Failed to fetch artifacts:', err);
                setError('Failed to load artifacts');
                setLoading(false);
            });
    }, [ticketId]);

    const toggleArtifact = (artifactId: string) => {
        if (selectedArtifacts.includes(artifactId)) {
            onSelectionChange(selectedArtifacts.filter(id => id !== artifactId));
        } else {
            onSelectionChange([...selectedArtifacts, artifactId]);
        }
    };

    const selectAll = () => {
        onSelectionChange(artifacts.map(a => a.id));
    };

    const deselectAll = () => {
        onSelectionChange([]);
    };

    const getTypeIcon = (type: string) => {
        switch (type) {
            case 'ticket':
                return (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                );
            case 'code':
                return (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                    </svg>
                );
            case 'files':
                return (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                    </svg>
                );
            case 'markdown':
                return (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                );
            case 'diagram':
                return (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                    </svg>
                );
            case 'image':
                return (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                );
            default:
                return (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                );
        }
    };

    const getTypeLabel = (type: string) => {
        const labels: Record<string, string> = {
            ticket: 'Ticket',
            code: 'Code',
            files: 'Files',
            markdown: 'Markdown',
            diagram: 'Diagram',
            image: 'Image',
        };
        return labels[type] || type.charAt(0).toUpperCase() + type.slice(1);
    };

    if (loading) {
        return (
            <div className={`flex items-center justify-center p-8 text-gray-400 ${className}`}>
                <svg className="w-5 h-5 animate-spin mr-2" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Loading artifacts...
            </div>
        );
    }

    if (error) {
        return (
            <div className={`flex flex-col items-center justify-center p-8 text-red-400 ${className}`}>
                <svg className="w-8 h-8 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm">{error}</p>
            </div>
        );
    }

    if (artifacts.length === 0) {
        return (
            <div className={`flex flex-col items-center justify-center p-8 text-gray-500 ${className}`}>
                <svg className="w-10 h-10 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                </svg>
                <p className="text-sm">No artifacts available</p>
                <p className="text-xs text-gray-600 mt-1">Artifacts from previous pipeline stages will appear here</p>
            </div>
        );
    }

    return (
        <div className={`flex flex-col overflow-hidden ${className}`}>
            {/* Header with select/deselect all */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700">
                <span className="text-sm text-gray-400">
                    {selectedArtifacts.length} of {artifacts.length} selected
                </span>
                <div className="flex gap-2">
                    <button
                        onClick={selectAll}
                        className="text-xs text-purple-400 hover:text-purple-300 transition-colors"
                    >
                        Select All
                    </button>
                    <span className="text-gray-600">|</span>
                    <button
                        onClick={deselectAll}
                        className="text-xs text-gray-400 hover:text-gray-300 transition-colors"
                    >
                        Clear
                    </button>
                </div>
            </div>

            {/* Artifact list */}
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {artifacts.map((artifact) => (
                    <label
                        key={artifact.id}
                        className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                            selectedArtifacts.includes(artifact.id)
                                ? 'bg-purple-900/30 border-purple-700/50'
                                : 'bg-[#1a1a1a] border-gray-700 hover:border-gray-600'
                        }`}
                    >
                        {/* Custom checkbox */}
                        <div className="flex-shrink-0 mt-0.5">
                            <input
                                type="checkbox"
                                checked={selectedArtifacts.includes(artifact.id)}
                                onChange={() => toggleArtifact(artifact.id)}
                                className="hidden"
                            />
                            <div className={`w-5 h-5 rounded flex items-center justify-center transition-colors ${
                                selectedArtifacts.includes(artifact.id)
                                    ? 'bg-purple-600'
                                    : 'bg-gray-700 border border-gray-600'
                            }`}>
                                {selectedArtifacts.includes(artifact.id) && (
                                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                    </svg>
                                )}
                            </div>
                        </div>

                        {/* Artifact info */}
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                                <span className={`p-1 rounded ${
                                    selectedArtifacts.includes(artifact.id)
                                        ? 'bg-purple-600/30 text-purple-300'
                                        : 'bg-gray-700/50 text-gray-400'
                                }`}>
                                    {getTypeIcon(artifact.type)}
                                </span>
                                <span className={`text-xs px-1.5 py-0.5 rounded ${
                                    selectedArtifacts.includes(artifact.id)
                                        ? 'bg-purple-600/20 text-purple-300'
                                        : 'bg-gray-700 text-gray-400'
                                }`}>
                                    {getTypeLabel(artifact.type)}
                                </span>
                            </div>
                            <p className={`text-sm font-medium truncate ${
                                selectedArtifacts.includes(artifact.id)
                                    ? 'text-gray-100'
                                    : 'text-gray-300'
                            }`}>
                                {artifact.title}
                            </p>
                            <p className="text-xs text-gray-500 mt-0.5">
                                {new Date(artifact.createdAt).toLocaleString()}
                            </p>
                        </div>
                    </label>
                ))}
            </div>
        </div>
    );
}
