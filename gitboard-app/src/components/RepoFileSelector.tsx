'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useDebounce } from '@/hooks/useDebounce';

// File tree node structure (matches API response)
interface RepoFileNode {
    name: string;
    path: string;
    type: 'file' | 'directory';
    children?: RepoFileNode[];
}

interface RepoFileSelectorProps {
    selectedFiles: string[];
    onSelectionChange: (files: string[]) => void;
    className?: string;
    maxHeight?: string;
}

/**
 * RepoFileSelector - A component for browsing and selecting repository files
 * Mirrors the DocsPageSelector pattern from InteractiveTerminal.tsx
 */
export default function RepoFileSelector({
    selectedFiles,
    onSelectionChange,
    className = '',
    maxHeight = 'max-h-48',
}: RepoFileSelectorProps) {
    const [repoFiles, setRepoFiles] = useState<RepoFileNode[]>([]);
    const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
    const [searchQuery, setSearchQuery] = useState('');
    const debouncedSearchQuery = useDebounce(searchQuery, 300);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Fetch file tree on mount
    useEffect(() => {
        fetch('/api/repo-files')
            .then(res => res.json())
            .then(data => {
                setRepoFiles(data.tree || []);
                setLoading(false);
            })
            .catch(err => {
                console.error('Failed to fetch repo files:', err);
                setError('Failed to load repository files');
                setLoading(false);
            });
    }, []);

    // Toggle folder expansion
    const toggleFolder = useCallback((folderPath: string) => {
        setExpandedFolders(prev => {
            const newSet = new Set(prev);
            if (newSet.has(folderPath)) {
                newSet.delete(folderPath);
            } else {
                newSet.add(folderPath);
            }
            return newSet;
        });
    }, []);

    // Toggle individual file selection
    const toggleFile = useCallback((filePath: string) => {
        const isSelected = selectedFiles.includes(filePath);
        if (isSelected) {
            onSelectionChange(selectedFiles.filter(p => p !== filePath));
        } else {
            onSelectionChange([...selectedFiles, filePath]);
        }
    }, [selectedFiles, onSelectionChange]);

    // Get all file paths from a folder (recursive)
    const getAllFilePaths = useCallback((node: RepoFileNode): string[] => {
        if (node.type === 'file') {
            return [node.path];
        }
        if (!node.children) return [];
        return node.children.flatMap(child => getAllFilePaths(child));
    }, []);

    // Get selection counts for a folder
    const getSelectionCounts = useCallback((node: RepoFileNode): { selectedCount: number; totalCount: number } => {
        const allPaths = getAllFilePaths(node);
        const selectedCount = allPaths.filter(p => selectedFiles.includes(p)).length;
        return { selectedCount, totalCount: allPaths.length };
    }, [getAllFilePaths, selectedFiles]);

    // Select/deselect all files in a folder
    const selectAllInFolder = useCallback((node: RepoFileNode) => {
        const allFilePaths = getAllFilePaths(node);
        const allSelected = allFilePaths.every(path => selectedFiles.includes(path));

        if (allSelected) {
            // Deselect all in folder
            onSelectionChange(selectedFiles.filter(p => !allFilePaths.includes(p)));
        } else {
            // Select all in folder
            const newPaths = new Set([...selectedFiles, ...allFilePaths]);
            onSelectionChange(Array.from(newPaths));
        }
    }, [getAllFilePaths, selectedFiles, onSelectionChange]);

    // Flatten all files from tree (for search results)
    const flattenFiles = useCallback((nodes: RepoFileNode[]): RepoFileNode[] => {
        return nodes.reduce((acc, node) => {
            if (node.type === 'file') {
                acc.push(node);
            } else if (node.children) {
                acc.push(...flattenFiles(node.children));
            }
            return acc;
        }, [] as RepoFileNode[]);
    }, []);

    // Get flat search results (uses debounced query for performance)
    const searchResults = useMemo(() => {
        if (!debouncedSearchQuery) return [];
        const allFiles = flattenFiles(repoFiles);
        return allFiles.filter(file =>
            file.name.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
            file.path.toLowerCase().includes(debouncedSearchQuery.toLowerCase())
        ).sort((a, b) => a.path.localeCompare(b.path));
    }, [repoFiles, debouncedSearchQuery, flattenFiles]);

    // Render a single node (file or folder)
    const renderNode = (node: RepoFileNode, depth: number = 0): React.ReactNode => {
        if (node.type === 'file') {
            return (
                <label
                    key={node.path}
                    className="flex items-center gap-2 px-2 py-1 hover:bg-gray-800 rounded cursor-pointer"
                >
                    <input
                        type="checkbox"
                        checked={selectedFiles.includes(node.path)}
                        onChange={() => toggleFile(node.path)}
                        className="w-3.5 h-3.5 rounded border-gray-600 bg-gray-800 text-purple-600 focus:ring-purple-500 focus:ring-offset-0"
                    />
                    <svg className="w-3 h-3 text-gray-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span className="text-sm text-gray-400 truncate">{node.name}</span>
                </label>
            );
        }

        // Directory node
        const isExpanded = expandedFolders.has(node.path);
        const { selectedCount, totalCount } = getSelectionCounts(node);
        const allSelected = selectedCount === totalCount && totalCount > 0;

        return (
            <div key={node.path}>
                <div className="flex items-center gap-1 hover:bg-gray-800 rounded">
                    <button
                        onClick={() => toggleFolder(node.path)}
                        className="flex-1 flex items-center gap-2 px-2 py-1.5 text-sm text-gray-300"
                    >
                        <svg
                            className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                        <svg className="w-3 h-3 text-gray-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                        </svg>
                        <span className="truncate">{node.name}</span>
                        <span className="text-xs text-gray-500 ml-auto">
                            {selectedCount > 0 && `${selectedCount}/`}{totalCount}
                        </span>
                    </button>
                    <button
                        onClick={() => selectAllInFolder(node)}
                        className={`px-2 py-1 text-xs rounded ${allSelected ? 'text-purple-400' : 'text-gray-500'}`}
                        title={allSelected ? 'Deselect all' : 'Select all'}
                    >
                        {allSelected ? '✓' : '○'}
                    </button>
                </div>
                {isExpanded && node.children && (
                    <div className="ml-5 space-y-0.5">
                        {node.children.map(child => renderNode(child, depth + 1))}
                    </div>
                )}
            </div>
        );
    };

    if (loading) {
        return (
            <div className={`p-4 bg-[#0d0d0d] border border-gray-700 rounded-lg ${className}`}>
                <div className="animate-pulse flex items-center gap-2">
                    <div className="w-4 h-4 bg-gray-700 rounded"></div>
                    <div className="h-4 bg-gray-700 rounded w-32"></div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className={`p-4 bg-[#0d0d0d] border border-gray-700 rounded-lg ${className}`}>
                <p className="text-xs text-red-400">{error}</p>
            </div>
        );
    }

    return (
        <div className={`${className} min-h-0`}>
            <input
                type="text"
                placeholder="Search files..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-3 py-2 bg-[#0d0d0d] border border-gray-700 rounded-lg text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 mb-2 flex-shrink-0"
            />
            <div className="flex-1 overflow-y-auto p-2 bg-[#0d0d0d] border border-gray-700 rounded-lg min-h-0 scrollbar-thin">
                {debouncedSearchQuery ? (
                    // Flat search results
                    searchResults.length === 0 ? (
                        <p className="text-xs text-gray-500 text-center py-2">No matching files found</p>
                    ) : (
                        <div className="space-y-0.5">
                            {searchResults.map((file) => (
                                <label
                                    key={file.path}
                                    className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-800 rounded cursor-pointer"
                                >
                                    <input
                                        type="checkbox"
                                        checked={selectedFiles.includes(file.path)}
                                        onChange={() => toggleFile(file.path)}
                                        className="w-3.5 h-3.5 rounded border-gray-600 bg-gray-800 text-purple-600 focus:ring-purple-500 focus:ring-offset-0"
                                    />
                                    <svg className="w-3 h-3 text-gray-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                    <span className="text-sm text-gray-400 truncate" title={file.path}>{file.path}</span>
                                </label>
                            ))}
                        </div>
                    )
                ) : (
                    // Tree view (no search)
                    repoFiles.length === 0 ? (
                        <p className="text-xs text-gray-500 text-center py-2">No files in repository</p>
                    ) : (
                        <div className="space-y-1">
                            {repoFiles.map(node => renderNode(node))}
                        </div>
                    )
                )}
            </div>
            {selectedFiles.length > 0 && (
                <p className="text-xs text-purple-400 mt-2 flex-shrink-0">
                    {selectedFiles.length} file{selectedFiles.length !== 1 ? 's' : ''} selected
                </p>
            )}
        </div>
    );
}
