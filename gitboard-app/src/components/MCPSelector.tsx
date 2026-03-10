'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { MCPConfig } from '@/lib/schemas';

interface MCPSelectorProps {
    selectedMCPs: string[];
    onSelectionChange: (mcps: string[]) => void;
    className?: string;
    maxHeight?: string;
}

/**
 * MCPSelector - A component for browsing and selecting MCP servers for context
 * Similar pattern to SkillSelector for consistency
 */
export default function MCPSelector({
    selectedMCPs,
    onSelectionChange,
    className = '',
    maxHeight = 'max-h-96',
}: MCPSelectorProps) {
    const [mcps, setMCPs] = useState<MCPConfig[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Fetch MCPs on mount
    useEffect(() => {
        fetch('/api/mcp')
            .then(res => res.json())
            .then(data => {
                setMCPs(data.mcps || []);
                setLoading(false);
            })
            .catch(err => {
                console.error('Failed to fetch MCPs:', err);
                setError('Failed to load MCP servers');
                setLoading(false);
            });
    }, []);

    // Toggle individual MCP selection
    const toggleMCP = useCallback((mcpId: string) => {
        const isSelected = selectedMCPs.includes(mcpId);
        if (isSelected) {
            onSelectionChange(selectedMCPs.filter(id => id !== mcpId));
        } else {
            onSelectionChange([...selectedMCPs, mcpId]);
        }
    }, [selectedMCPs, onSelectionChange]);

    // Filter MCPs based on search query
    const filteredMCPs = useMemo(() => {
        return mcps.filter(mcp =>
            mcp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (mcp.description?.toLowerCase().includes(searchQuery.toLowerCase())) ||
            mcp.command.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [mcps, searchQuery]);

    if (loading) {
        return (
            <div className={`p-4 bg-white dark:bg-[#0d0d0d] border border-gray-200 dark:border-gray-700 rounded-lg ${className}`}>
                <div className="animate-pulse flex items-center gap-2">
                    <div className="w-4 h-4 bg-gray-300 dark:bg-gray-700 rounded"></div>
                    <div className="h-4 bg-gray-300 dark:bg-gray-700 rounded w-32"></div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className={`p-4 bg-white dark:bg-[#0d0d0d] border border-gray-200 dark:border-gray-700 rounded-lg ${className}`}>
                <p className="text-xs text-red-400">{error}</p>
            </div>
        );
    }

    return (
        <div className={`${className} min-h-0`}>
            <input
                type="text"
                placeholder="Search MCP servers..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-[#0d0d0d] border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 mb-2 flex-shrink-0"
            />
            <div className="flex-1 overflow-y-auto p-2 bg-white dark:bg-[#0d0d0d] border border-gray-200 dark:border-gray-700 rounded-lg min-h-0 scrollbar-thin">
                {mcps.length === 0 ? (
                    <div className="text-center py-6">
                        <svg className="w-10 h-10 mx-auto mb-2 text-gray-400 dark:text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
                        </svg>
                        <p className="text-xs text-gray-500">No MCP servers yet</p>
                        <a
                            href="/mcp"
                            className="text-xs text-purple-600 dark:text-purple-400 hover:text-purple-500 dark:hover:text-purple-300 mt-1 inline-block"
                        >
                            Configure your first MCP server
                        </a>
                    </div>
                ) : filteredMCPs.length === 0 ? (
                    <p className="text-xs text-gray-500 text-center py-2">No matching MCP servers found</p>
                ) : (
                    <div className="space-y-1">
                        {filteredMCPs.map((mcp) => {
                            const isSelected = selectedMCPs.includes(mcp.id);
                            return (
                                <label
                                    key={mcp.id}
                                    className={`flex items-start gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                                        isSelected
                                            ? 'bg-purple-50 dark:bg-purple-500/10 border border-purple-300 dark:border-purple-500/50'
                                            : 'hover:bg-gray-100 dark:hover:bg-gray-800 border border-transparent'
                                    }`}
                                >
                                    <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={() => toggleMCP(mcp.id)}
                                        className="mt-1 w-4 h-4 rounded border-gray-400 dark:border-gray-600 bg-gray-100 dark:bg-gray-800 text-purple-600 focus:ring-purple-500 focus:ring-offset-0"
                                    />
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{mcp.name}</span>
                                            <span className={`w-2 h-2 rounded-full ${mcp.enabled ? 'bg-green-500' : 'bg-gray-500'}`} />
                                        </div>
                                        {mcp.description && (
                                            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{mcp.description}</p>
                                        )}
                                        {/* Command badge */}
                                        <div className="flex flex-wrap gap-1 mt-1.5">
                                            <span className="px-1.5 py-0.5 text-[10px] bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded font-mono">
                                                {mcp.command}
                                            </span>
                                            {mcp.args && mcp.args.length > 0 && (
                                                <span className="px-1.5 py-0.5 text-[10px] bg-gray-100 dark:bg-gray-800 text-gray-500 rounded">
                                                    {mcp.args.length} arg{mcp.args.length !== 1 ? 's' : ''}
                                                </span>
                                            )}
                                            {mcp.env && Object.keys(mcp.env).length > 0 && (
                                                <span className="px-1.5 py-0.5 text-[10px] bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded">
                                                    {Object.keys(mcp.env).length} env var{Object.keys(mcp.env).length !== 1 ? 's' : ''}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </label>
                            );
                        })}
                    </div>
                )}
            </div>
            {selectedMCPs.length > 0 && (
                <p className="text-xs text-purple-600 dark:text-purple-400 mt-2 flex-shrink-0">
                    {selectedMCPs.length} MCP server{selectedMCPs.length !== 1 ? 's' : ''} selected
                </p>
            )}
        </div>
    );
}
