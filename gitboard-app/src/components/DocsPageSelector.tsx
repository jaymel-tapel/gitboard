'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';

interface DocsPage {
    slug: string;
    folder: string;
    title: string;
    path: string;
}

interface DocsPageSelectorProps {
    selectedPages: string[];
    onSelectionChange: (pages: string[]) => void;
    className?: string;
    maxHeight?: string;
}

/**
 * DocsPageSelector - A component for browsing and selecting documentation pages
 * Extracted from InteractiveTerminal for reusability
 */
export default function DocsPageSelector({
    selectedPages,
    onSelectionChange,
    className = '',
    maxHeight = 'max-h-96',
}: DocsPageSelectorProps) {
    const [docsPages, setDocsPages] = useState<DocsPage[]>([]);
    const [docsFolders, setDocsFolders] = useState<string[]>([]);
    const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Fetch docs pages on mount
    useEffect(() => {
        fetch('/api/docs')
            .then(res => res.json())
            .then(data => {
                setDocsPages(data.docsPages || []);
                setDocsFolders(data.folders || []);
                // Expand all folders by default for docs
                setExpandedFolders(new Set(data.folders || []));
                setLoading(false);
            })
            .catch(err => {
                console.error('Failed to fetch docs pages:', err);
                setError('Failed to load documentation pages');
                setLoading(false);
            });
    }, []);

    // Toggle folder expansion
    const toggleFolder = useCallback((folder: string) => {
        setExpandedFolders(prev => {
            const newSet = new Set(prev);
            if (newSet.has(folder)) {
                newSet.delete(folder);
            } else {
                newSet.add(folder);
            }
            return newSet;
        });
    }, []);

    // Toggle individual page selection
    const togglePage = useCallback((path: string) => {
        const isSelected = selectedPages.includes(path);
        if (isSelected) {
            onSelectionChange(selectedPages.filter(p => p !== path));
        } else {
            onSelectionChange([...selectedPages, path]);
        }
    }, [selectedPages, onSelectionChange]);

    // Select/deselect all pages in a folder
    const selectAllInFolder = useCallback((folder: string) => {
        const folderPages = docsPages.filter(p => p.folder === folder);
        const folderPaths = folderPages.map(p => p.path);
        const allSelected = folderPaths.every(path => selectedPages.includes(path));

        if (allSelected) {
            // Deselect all in folder
            onSelectionChange(selectedPages.filter(p => !folderPaths.includes(p)));
        } else {
            // Select all in folder
            const newPaths = new Set([...selectedPages, ...folderPaths]);
            onSelectionChange(Array.from(newPaths));
        }
    }, [docsPages, selectedPages, onSelectionChange]);

    // Filter pages based on search query
    const filteredDocsPages = useMemo(() => {
        return docsPages.filter(page =>
            page.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            page.path.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [docsPages, searchQuery]);

    const rootPages = useMemo(() => {
        return filteredDocsPages.filter(p => !p.folder);
    }, [filteredDocsPages]);

    const pagesByFolder = useMemo(() => {
        return docsFolders.reduce((acc, folder) => {
            acc[folder] = filteredDocsPages.filter(p => p.folder === folder);
            return acc;
        }, {} as Record<string, DocsPage[]>);
    }, [docsFolders, filteredDocsPages]);

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
                placeholder="Search docs pages..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-3 py-2 bg-[#0d0d0d] border border-gray-700 rounded-lg text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 mb-2 flex-shrink-0"
            />
            <div className="flex-1 overflow-y-auto p-2 bg-[#0d0d0d] border border-gray-700 rounded-lg min-h-0 scrollbar-thin">
                {searchQuery ? (
                    // Flat search results
                    filteredDocsPages.length === 0 ? (
                        <p className="text-xs text-gray-500 text-center py-2">No matching docs found</p>
                    ) : (
                        <div className="space-y-0.5">
                            {filteredDocsPages.map((page) => (
                                <label
                                    key={page.path}
                                    className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-800 rounded cursor-pointer"
                                >
                                    <input
                                        type="checkbox"
                                        checked={selectedPages.includes(page.path)}
                                        onChange={() => togglePage(page.path)}
                                        className="w-3.5 h-3.5 rounded border-gray-600 bg-gray-800 text-purple-600 focus:ring-purple-500 focus:ring-offset-0"
                                    />
                                    <svg className="w-3 h-3 text-gray-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                    <span className="text-sm text-gray-400 truncate" title={page.path}>
                                        {page.folder ? `${page.folder}/` : ''}{page.title}
                                    </span>
                                </label>
                            ))}
                        </div>
                    )
                ) : (
                    // Tree view (no search)
                    docsPages.length === 0 ? (
                        <p className="text-xs text-gray-500 text-center py-2">No documentation pages found</p>
                    ) : (
                    <div className="space-y-1">
                        {docsFolders.map((folder) => {
                            const folderPages = pagesByFolder[folder] || [];
                            if (folderPages.length === 0) return null;

                            const isExpanded = expandedFolders.has(folder);
                            const selectedCount = folderPages.filter(p =>
                                selectedPages.includes(p.path)
                            ).length;
                            const allSelected = selectedCount === folderPages.length;

                            return (
                                <div key={folder}>
                                    <div className="flex items-center gap-1 hover:bg-gray-800 rounded">
                                        <button
                                            onClick={() => toggleFolder(folder)}
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
                                            <span className="truncate">{folder}</span>
                                            <span className="text-xs text-gray-500 ml-auto">
                                                {selectedCount > 0 && `${selectedCount}/`}{folderPages.length}
                                            </span>
                                        </button>
                                        <button
                                            onClick={() => selectAllInFolder(folder)}
                                            className={`px-2 py-1 text-xs rounded ${allSelected ? 'text-purple-400' : 'text-gray-500'}`}
                                            title={allSelected ? 'Deselect all' : 'Select all'}
                                        >
                                            {allSelected ? '✓' : '○'}
                                        </button>
                                    </div>
                                    {isExpanded && (
                                        <div className="ml-5 space-y-0.5">
                                            {folderPages.map((page) => (
                                                <label
                                                    key={page.path}
                                                    className="flex items-center gap-2 px-2 py-1 hover:bg-gray-800 rounded cursor-pointer"
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedPages.includes(page.path)}
                                                        onChange={() => togglePage(page.path)}
                                                        className="w-3.5 h-3.5 rounded border-gray-600 bg-gray-800 text-purple-600 focus:ring-purple-500 focus:ring-offset-0"
                                                    />
                                                    <svg className="w-3 h-3 text-gray-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                    </svg>
                                                    <span className="text-sm text-gray-400 truncate">{page.title}</span>
                                                </label>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}

                        {rootPages.length > 0 && (
                            <div className="pt-1 border-t border-gray-800 mt-1">
                                {rootPages.map((page) => (
                                    <label
                                        key={page.path}
                                        className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-800 rounded cursor-pointer"
                                    >
                                        <input
                                            type="checkbox"
                                            checked={selectedPages.includes(page.path)}
                                            onChange={() => togglePage(page.path)}
                                            className="w-3.5 h-3.5 rounded border-gray-600 bg-gray-800 text-purple-600 focus:ring-purple-500 focus:ring-offset-0"
                                        />
                                        <svg className="w-3 h-3 text-gray-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                        </svg>
                                        <span className="text-sm text-gray-300 truncate">{page.title}</span>
                                    </label>
                                ))}
                            </div>
                        )}
                    </div>
                    )
                )}
            </div>
            {selectedPages.length > 0 && (
                <p className="text-xs text-purple-400 mt-2 flex-shrink-0">
                    {selectedPages.length} page{selectedPages.length !== 1 ? 's' : ''} selected
                </p>
            )}
        </div>
    );
}
