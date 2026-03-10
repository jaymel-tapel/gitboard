'use client'

import { useState } from 'react';
import { ConversationalMCPEditor } from '@/components/ConversationalMCPEditor';
import type { MCPConfig } from '@/lib/schemas';

interface MCPClientProps {
    mcps: MCPConfig[];
}

export function MCPClient({ mcps }: MCPClientProps) {
    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const [selectedMCP, setSelectedMCP] = useState<MCPConfig | undefined>();

    function handleNewMCP() {
        setSelectedMCP(undefined);
        setIsEditorOpen(true);
    }

    function handleEditMCP(mcp: MCPConfig) {
        setSelectedMCP(mcp);
        setIsEditorOpen(true);
    }

    return (
        <>
            <ConversationalMCPEditor
                isOpen={isEditorOpen}
                onClose={() => setIsEditorOpen(false)}
                mcp={selectedMCP}
            />

            {/* Header */}
            <div className="border-b border-gray-200/50 dark:border-gray-800/50 bg-white/80 dark:bg-[#0d0d0d]/80 backdrop-blur-md relative z-10">
                <div className="max-w-6xl mx-auto px-8 py-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-1">
                                MCP Servers
                            </h1>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                Configure Model Context Protocol servers to extend AI capabilities
                            </p>
                        </div>
                        <button
                            onClick={handleNewMCP}
                            className="px-4 py-2 bg-purple-600 dark:bg-purple-500 text-white text-sm font-medium rounded-lg hover:bg-purple-700 dark:hover:bg-purple-600 transition-colors flex items-center gap-2"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            New MCP
                        </button>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="max-w-6xl mx-auto px-8 py-8 relative z-10">
                {mcps.length === 0 ? (
                    <div className="text-center py-12">
                        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-purple-100/80 dark:bg-purple-900/30 backdrop-blur-sm flex items-center justify-center">
                            <svg className="w-8 h-8 text-purple-600 dark:text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
                            </svg>
                        </div>
                        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                            No MCP servers configured
                        </h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                            Configure your first MCP server to extend AI agent capabilities with tools and resources
                        </p>
                        <button
                            onClick={handleNewMCP}
                            className="px-4 py-2 bg-purple-600 dark:bg-purple-500 text-white text-sm font-medium rounded-lg hover:bg-purple-700 dark:hover:bg-purple-600 transition-colors"
                        >
                            Create MCP Server
                        </button>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 gap-6">
                        {mcps.map((mcp) => (
                            <div
                                key={mcp.id}
                                onClick={() => handleEditMCP(mcp)}
                                className="p-6 bg-white/70 dark:bg-[#1a1a1a]/70 backdrop-blur-xl border border-gray-200/50 dark:border-gray-800/50 rounded-xl hover:border-purple-300/50 dark:hover:border-purple-700/50 hover:shadow-lg transition-all duration-200 cursor-pointer group"
                            >
                                <div className="flex items-start gap-4 mb-4">
                                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-400 to-blue-600 flex items-center justify-center flex-shrink-0 shadow-lg">
                                        <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
                                        </svg>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1 group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                                            {mcp.name}
                                        </h3>
                                        {mcp.description && (
                                            <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2">
                                                {mcp.description}
                                            </p>
                                        )}
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    {/* Command badge */}
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="px-2.5 py-1 bg-gray-100/80 dark:bg-gray-800/50 text-gray-700 dark:text-gray-300 rounded-full text-xs font-mono">
                                            {mcp.command}
                                        </span>
                                        {mcp.args && mcp.args.length > 0 && (
                                            <span className="px-2.5 py-1 bg-blue-100/80 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full text-xs font-medium">
                                                {mcp.args.length} arg{mcp.args.length !== 1 ? 's' : ''}
                                            </span>
                                        )}
                                        {mcp.env && Object.keys(mcp.env).length > 0 && (
                                            <span className="px-2.5 py-1 bg-yellow-100/80 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 rounded-full text-xs font-medium">
                                                {Object.keys(mcp.env).length} env var{Object.keys(mcp.env).length !== 1 ? 's' : ''}
                                            </span>
                                        )}
                                    </div>

                                    {/* Footer */}
                                    <div className="flex items-center justify-between pt-3 border-t border-gray-200/50 dark:border-gray-800/50">
                                        <div className="flex items-center gap-2">
                                            <div className={`w-2 h-2 rounded-full shadow-sm ${mcp.enabled ? 'bg-green-500' : 'bg-gray-500'}`}></div>
                                            <span className="text-xs text-gray-600 dark:text-gray-400">
                                                {mcp.enabled ? 'Enabled' : 'Disabled'}
                                            </span>
                                        </div>
                                        <svg className="w-4 h-4 text-gray-400 group-hover:text-purple-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                        </svg>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </>
    );
}
