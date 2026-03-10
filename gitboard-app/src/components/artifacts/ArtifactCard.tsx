'use client';

import type { Artifact } from '@/lib/schemas';
import { KNOWN_ARTIFACT_TYPES, type KnownArtifactType } from './types';

/**
 * Utility to format unknown type slugs to human-readable labels
 * e.g., 'security-review' → 'Security Review'
 */
function formatTypeLabel(type: string): string {
    return type
        .replace(/[-_]/g, ' ') // Replace hyphens and underscores with spaces
        .replace(/\b\w/g, (char) => char.toUpperCase()); // Capitalize first letter of each word
}

interface ArtifactCardProps {
    artifact: Artifact;
    isSelected?: boolean;
    onClick?: () => void;
    onDelete?: (artifactId: string) => void;
}

/**
 * ArtifactCard - Clickable card for displaying an artifact in the chat thread
 *
 * Displays type-specific icons and a preview title.
 * When clicked, opens the ArtifactViewer in the right panel.
 */
export function ArtifactCard({ artifact, isSelected = false, onClick, onDelete }: ArtifactCardProps) {
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

    // Get a preview subtitle based on artifact type
    const getPreviewSubtitle = () => {
        switch (artifact.type) {
            case 'ticket':
                const ticketContent = artifact.content as { implementationSteps: unknown[]; acceptanceCriteria: unknown[] };
                return `${ticketContent.implementationSteps?.length || 0} steps, ${ticketContent.acceptanceCriteria?.length || 0} criteria`;
            case 'code':
                const codeContent = artifact.content as { language?: string };
                return codeContent.language || 'Code';
            case 'image':
                const imageContent = artifact.content as { alt?: string };
                return imageContent.alt || 'Image';
            case 'files':
                const filesContent = artifact.content as { files: Array<{ changeType: string }> };
                const created = filesContent.files.filter(f => f.changeType === 'created').length;
                const modified = filesContent.files.filter(f => f.changeType === 'modified').length;
                const deleted = filesContent.files.filter(f => f.changeType === 'deleted').length;
                const parts: string[] = [];
                if (created > 0) parts.push(`+${created}`);
                if (modified > 0) parts.push(`~${modified}`);
                if (deleted > 0) parts.push(`-${deleted}`);
                return parts.length > 0 ? `${parts.join(' ')} files` : 'No changes';
            default:
                // For unknown types, show a helpful message
                if (!KNOWN_ARTIFACT_TYPES.includes(artifact.type as KnownArtifactType)) {
                    return 'Click to view details';
                }
                return '';
        }
    };

    const handleDelete = (e: React.MouseEvent) => {
        e.stopPropagation(); // Prevent triggering onClick
        if (onDelete) {
            onDelete(artifact.id);
        }
    };

    return (
        <div
            onClick={onClick}
            className={`group relative w-full max-w-sm text-left rounded-xl border-2 transition-all duration-200 hover:shadow-lg cursor-pointer ${
                isSelected
                    ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/30 shadow-md'
                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-purple-300 dark:hover:border-purple-600'
            }`}
        >
            {/* Delete button - visible on hover */}
            {onDelete && (
                <button
                    onClick={handleDelete}
                    className="absolute top-2 right-2 p-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-400 hover:bg-red-100 hover:text-red-500 dark:hover:bg-red-900/30 dark:hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all duration-200 z-10"
                    title="Delete artifact"
                >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                </button>
            )}
            <div className="p-4">
                {/* Header with icon and type label */}
                <div className="flex items-center gap-3 mb-2">
                    <div className={`p-2 rounded-lg ${
                        isSelected
                            ? 'bg-purple-100 dark:bg-purple-800 text-purple-600 dark:text-purple-300'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                    }`}>
                        {getIcon()}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className={`text-xs font-medium uppercase tracking-wide ${
                            isSelected
                                ? 'text-purple-600 dark:text-purple-400'
                                : 'text-gray-500 dark:text-gray-400'
                        }`}>
                            {getTypeLabel()}
                        </p>
                    </div>
                    {isSelected && (
                        <div className="flex-shrink-0">
                            <svg className="w-5 h-5 text-purple-500" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                        </div>
                    )}
                </div>

                {/* Title */}
                <h4 className={`font-semibold text-sm mb-1 line-clamp-2 ${
                    isSelected
                        ? 'text-purple-900 dark:text-purple-100'
                        : 'text-gray-900 dark:text-gray-100'
                }`}>
                    {artifact.title}
                </h4>

                {/* Subtitle/Preview */}
                {getPreviewSubtitle() && (
                    <p className={`text-xs ${
                        isSelected
                            ? 'text-purple-600 dark:text-purple-400'
                            : 'text-gray-500 dark:text-gray-400'
                    }`}>
                        {getPreviewSubtitle()}
                    </p>
                )}
            </div>

            {/* Click hint */}
            <div className={`px-4 py-2 border-t text-xs flex items-center gap-1.5 ${
                isSelected
                    ? 'border-purple-200 dark:border-purple-700 text-purple-600 dark:text-purple-400 bg-purple-50/50 dark:bg-purple-900/20'
                    : 'border-gray-100 dark:border-gray-700 text-gray-400 dark:text-gray-500'
            }`}>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                <span>{isSelected ? 'Click to close' : 'Click to view'}</span>
            </div>
        </div>
    );
}
