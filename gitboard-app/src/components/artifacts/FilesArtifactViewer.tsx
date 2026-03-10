'use client';

import { useState } from 'react';
import type { FilesArtifact, FileChange } from './types';

interface FilesArtifactViewerProps {
    artifact: FilesArtifact;
}

/**
 * FilesArtifactViewer - Displays file changes from agent execution
 *
 * Shows file changes with collapsible sections, change type indicators,
 * and optional diff/content view toggle.
 */
export function FilesArtifactViewer({ artifact }: FilesArtifactViewerProps) {
    const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
    const [viewMode, setViewMode] = useState<'diff' | 'content'>('diff');

    const { files, commitHash, branchName, summary } = artifact.content;

    const toggleFile = (path: string) => {
        setExpandedFiles(prev => {
            const next = new Set(prev);
            if (next.has(path)) {
                next.delete(path);
            } else {
                next.add(path);
            }
            return next;
        });
    };

    const expandAll = () => {
        setExpandedFiles(new Set(files.map(f => f.path)));
    };

    const collapseAll = () => {
        setExpandedFiles(new Set());
    };

    const getChangeIcon = (changeType: FileChange['changeType']) => {
        switch (changeType) {
            case 'created':
                return (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                );
            case 'modified':
                return (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                );
            case 'deleted':
                return (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                );
            default:
                return null;
        }
    };

    const getChangeColor = (changeType: FileChange['changeType']) => {
        switch (changeType) {
            case 'created':
                return 'text-green-400 bg-green-400/10';
            case 'modified':
                return 'text-yellow-400 bg-yellow-400/10';
            case 'deleted':
                return 'text-red-400 bg-red-400/10';
            default:
                return 'text-gray-400 bg-gray-400/10';
        }
    };

    const getChangeLabel = (changeType: FileChange['changeType']) => {
        switch (changeType) {
            case 'created':
                return 'Added';
            case 'modified':
                return 'Modified';
            case 'deleted':
                return 'Deleted';
            default:
                return changeType;
        }
    };

    const createdCount = files.filter(f => f.changeType === 'created').length;
    const modifiedCount = files.filter(f => f.changeType === 'modified').length;
    const deletedCount = files.filter(f => f.changeType === 'deleted').length;

    return (
        <div className="p-4 space-y-4">
            {/* Summary header */}
            {(summary || branchName || commitHash) && (
                <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700">
                    {summary && (
                        <p className="text-sm text-gray-300 mb-2">{summary}</p>
                    )}
                    <div className="flex flex-wrap gap-4 text-xs text-gray-500">
                        {branchName && (
                            <span className="flex items-center gap-1">
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                </svg>
                                Branch: <code className="text-purple-400 ml-1">{branchName}</code>
                            </span>
                        )}
                        {commitHash && (
                            <span className="flex items-center gap-1">
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                                </svg>
                                Commit: <code className="text-purple-400 ml-1">{commitHash.substring(0, 7)}</code>
                            </span>
                        )}
                    </div>
                </div>
            )}

            {/* File stats and controls */}
            <div className="flex items-center justify-between">
                <div className="flex gap-3 text-sm">
                    {createdCount > 0 && (
                        <span className="flex items-center gap-1 text-green-400">
                            <span className="font-semibold">+{createdCount}</span>
                            <span className="text-gray-500">added</span>
                        </span>
                    )}
                    {modifiedCount > 0 && (
                        <span className="flex items-center gap-1 text-yellow-400">
                            <span className="font-semibold">~{modifiedCount}</span>
                            <span className="text-gray-500">modified</span>
                        </span>
                    )}
                    {deletedCount > 0 && (
                        <span className="flex items-center gap-1 text-red-400">
                            <span className="font-semibold">-{deletedCount}</span>
                            <span className="text-gray-500">deleted</span>
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    {/* Expand/Collapse buttons */}
                    <button
                        onClick={expandAll}
                        className="px-2 py-1 text-xs text-gray-400 hover:text-gray-200 transition-colors"
                    >
                        Expand All
                    </button>
                    <button
                        onClick={collapseAll}
                        className="px-2 py-1 text-xs text-gray-400 hover:text-gray-200 transition-colors"
                    >
                        Collapse All
                    </button>

                    {/* View mode toggle */}
                    <div className="flex rounded-lg overflow-hidden border border-gray-700">
                        <button
                            onClick={() => setViewMode('diff')}
                            className={`px-3 py-1 text-xs transition-colors ${
                                viewMode === 'diff'
                                    ? 'bg-purple-600 text-white'
                                    : 'bg-gray-800 text-gray-400 hover:text-gray-200'
                            }`}
                        >
                            Diff
                        </button>
                        <button
                            onClick={() => setViewMode('content')}
                            className={`px-3 py-1 text-xs transition-colors ${
                                viewMode === 'content'
                                    ? 'bg-purple-600 text-white'
                                    : 'bg-gray-800 text-gray-400 hover:text-gray-200'
                            }`}
                        >
                            Content
                        </button>
                    </div>
                </div>
            </div>

            {/* File list */}
            <div className="space-y-2">
                {files.map((file) => (
                    <div
                        key={file.path}
                        className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden"
                    >
                        {/* File header */}
                        <button
                            onClick={() => toggleFile(file.path)}
                            className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-gray-700/50 transition-colors"
                        >
                            {/* Expand/Collapse indicator */}
                            <svg
                                className={`w-4 h-4 text-gray-500 transition-transform ${
                                    expandedFiles.has(file.path) ? 'rotate-90' : ''
                                }`}
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>

                            {/* Change type badge */}
                            <span className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs ${getChangeColor(file.changeType)}`}>
                                {getChangeIcon(file.changeType)}
                                {getChangeLabel(file.changeType)}
                            </span>

                            {/* File path */}
                            <span className="text-sm text-gray-300 font-mono truncate flex-1 text-left">
                                {file.path}
                            </span>
                        </button>

                        {/* File content */}
                        {expandedFiles.has(file.path) && (
                            <div className="border-t border-gray-700">
                                {(viewMode === 'diff' && file.diff) || (viewMode === 'content' && file.content) ? (
                                    <pre className="p-4 text-xs overflow-x-auto font-mono bg-gray-900/50 max-h-96">
                                        <code className={`${viewMode === 'diff' ? 'language-diff' : ''}`}>
                                            {viewMode === 'diff' ? file.diff : file.content}
                                        </code>
                                    </pre>
                                ) : (
                                    <div className="p-4 text-sm text-gray-500 italic">
                                        {viewMode === 'diff'
                                            ? 'No diff available'
                                            : file.changeType === 'deleted'
                                            ? 'File was deleted'
                                            : 'No content available'}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* Empty state */}
            {files.length === 0 && (
                <div className="flex flex-col items-center justify-center p-8 text-gray-500">
                    <svg className="w-12 h-12 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                    </svg>
                    <p className="text-sm">No file changes recorded</p>
                </div>
            )}
        </div>
    );
}
