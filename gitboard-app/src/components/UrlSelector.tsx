'use client';

import { useState, useCallback } from 'react';

interface UrlSelectorProps {
    selectedUrls: string[];
    onSelectionChange: (urls: string[]) => void;
    className?: string;
    maxHeight?: string;
}

/**
 * UrlSelector - A component for adding and managing URL links as context
 * Follows the DocsPageSelector/RepoFileSelector pattern
 */
export default function UrlSelector({
    selectedUrls,
    onSelectionChange,
    className = '',
}: UrlSelectorProps) {
    const [urlInput, setUrlInput] = useState('');
    const [error, setError] = useState<string | null>(null);

    // Validate URL format
    const isValidUrl = useCallback((urlString: string): boolean => {
        try {
            const url = new URL(urlString);
            return url.protocol === 'http:' || url.protocol === 'https:';
        } catch {
            return false;
        }
    }, []);

    // Add a URL to the selection
    const addUrl = useCallback(() => {
        const trimmedUrl = urlInput.trim();

        if (!trimmedUrl) {
            setError(null);
            return;
        }

        if (!isValidUrl(trimmedUrl)) {
            setError('Please enter a valid URL (http:// or https://)');
            return;
        }

        if (selectedUrls.includes(trimmedUrl)) {
            setError('This URL has already been added');
            return;
        }

        onSelectionChange([...selectedUrls, trimmedUrl]);
        setUrlInput('');
        setError(null);
    }, [urlInput, selectedUrls, onSelectionChange, isValidUrl]);

    // Remove a URL from the selection
    const removeUrl = useCallback((urlToRemove: string) => {
        onSelectionChange(selectedUrls.filter(url => url !== urlToRemove));
    }, [selectedUrls, onSelectionChange]);

    // Handle Enter key press
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addUrl();
        }
    };

    // Extract domain for display
    const getDomain = (urlString: string): string => {
        try {
            const url = new URL(urlString);
            return url.hostname;
        } catch {
            return urlString;
        }
    };

    return (
        <div className={`${className} min-h-0`}>
            {/* URL Input */}
            <div className="flex gap-2 mb-2 flex-shrink-0">
                <input
                    type="text"
                    placeholder="Enter URL (e.g., https://example.com/docs)"
                    value={urlInput}
                    onChange={(e) => {
                        setUrlInput(e.target.value);
                        if (error) setError(null);
                    }}
                    onKeyDown={handleKeyDown}
                    className="flex-1 px-3 py-2 bg-[#0d0d0d] border border-gray-700 rounded-lg text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
                <button
                    onClick={addUrl}
                    disabled={!urlInput.trim()}
                    className="px-4 py-2 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                    Add
                </button>
            </div>

            {/* Error message */}
            {error && (
                <p className="text-xs text-red-400 mb-2 flex-shrink-0">{error}</p>
            )}

            {/* URL List */}
            <div className="flex-1 overflow-y-auto p-2 bg-[#0d0d0d] border border-gray-700 rounded-lg min-h-0 scrollbar-thin">
                {selectedUrls.length === 0 ? (
                    <div className="flex items-center justify-center h-32 text-gray-500">
                        <div className="text-center">
                            <svg className="w-8 h-8 mx-auto mb-2 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                            </svg>
                            <p className="text-sm">No URLs added</p>
                            <p className="text-xs text-gray-600 mt-1">Add URLs to include their content as context</p>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-1">
                        {selectedUrls.map((url) => (
                            <div
                                key={url}
                                className="flex items-center gap-2 px-3 py-2 bg-gray-800/50 hover:bg-gray-800 rounded-lg group"
                            >
                                {/* Link Icon */}
                                <svg className="w-4 h-4 text-purple-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                                </svg>

                                {/* URL Display */}
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm text-gray-300 truncate" title={url}>
                                        {getDomain(url)}
                                    </p>
                                    <p className="text-xs text-gray-500 truncate" title={url}>
                                        {url}
                                    </p>
                                </div>

                                {/* External Link */}
                                <a
                                    href={url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="p-1 text-gray-500 hover:text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity"
                                    title="Open in new tab"
                                >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                    </svg>
                                </a>

                                {/* Remove Button */}
                                <button
                                    onClick={() => removeUrl(url)}
                                    className="p-1 text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                                    title="Remove URL"
                                >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Selection count */}
            {selectedUrls.length > 0 && (
                <p className="text-xs text-purple-400 mt-2 flex-shrink-0">
                    {selectedUrls.length} URL{selectedUrls.length !== 1 ? 's' : ''} selected
                </p>
            )}
        </div>
    );
}
