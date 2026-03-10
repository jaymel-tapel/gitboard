'use client'

import { useState } from 'react';
import { ConversationalAgentEditor } from '@/components/ConversationalAgentEditor';
import type { Agent } from '@/lib/schemas';

interface AgentsClientProps {
    agents: Agent[];
}

export function AgentsClient({ agents }: AgentsClientProps) {
    const [isPanelOpen, setIsPanelOpen] = useState(false);
    const [selectedAgent, setSelectedAgent] = useState<Agent | undefined>();

    function handleNewAgent() {
        setSelectedAgent(undefined);
        setIsPanelOpen(true);
    }

    function handleEditAgent(agent: Agent) {
        setSelectedAgent(agent);
        setIsPanelOpen(true);
    }

    return (
        <>
            <ConversationalAgentEditor
                isOpen={isPanelOpen}
                onClose={() => setIsPanelOpen(false)}
                agent={selectedAgent}
            />

            {/* Header */}
            <div className="border-b border-gray-200/50 dark:border-gray-800/50 bg-white/80 dark:bg-[#0d0d0d]/80 backdrop-blur-md relative z-10">
                <div className="max-w-6xl mx-auto px-8 py-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-1">
                                AI Agents
                            </h1>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                Manage your autonomous AI team members
                            </p>
                        </div>
                        <button
                            onClick={handleNewAgent}
                            className="px-4 py-2 bg-purple-600 dark:bg-purple-500 text-white text-sm font-medium rounded-lg hover:bg-purple-700 dark:hover:bg-purple-600 transition-colors flex items-center gap-2"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            New Agent
                        </button>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="max-w-6xl mx-auto px-8 py-8 relative z-10">
                {agents.length === 0 ? (
                    <div className="text-center py-12">
                        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-purple-100/80 dark:bg-purple-900/30 backdrop-blur-sm flex items-center justify-center">
                            <svg className="w-8 h-8 text-purple-600 dark:text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                            </svg>
                        </div>
                        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                            No AI agents yet
                        </h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                            Create your first AI agent to start automating tasks
                        </p>
                        <button
                            onClick={handleNewAgent}
                            className="px-4 py-2 bg-purple-600 dark:bg-purple-500 text-white text-sm font-medium rounded-lg hover:bg-purple-700 dark:hover:bg-purple-600 transition-colors"
                        >
                            Create AI Agent
                        </button>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 gap-6">
                        {agents.map((agent) => (
                            <div
                                key={agent.id}
                                onClick={() => handleEditAgent(agent)}
                                className="p-6 bg-white/70 dark:bg-[#1a1a1a]/70 backdrop-blur-xl border border-gray-200/50 dark:border-gray-800/50 rounded-xl hover:border-purple-300/50 dark:hover:border-purple-700/50 hover:shadow-lg transition-all duration-200 cursor-pointer group"
                            >
                                <div className="flex items-start gap-4 mb-4">
                                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-400 to-purple-600 flex items-center justify-center flex-shrink-0 shadow-lg">
                                        <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                        </svg>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1 group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                                            {agent.name}
                                        </h3>
                                        {agent.description && (
                                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                                {agent.description}
                                            </p>
                                        )}
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    {/* Execution Type Badge */}
                                    <div className="flex items-center gap-2">
                                        <span className="px-2.5 py-1 bg-purple-100/80 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-full text-xs font-medium">
                                            {agent.executionType === 'cli' ? 'CLI-based' : 'API-based'}
                                        </span>
                                        {agent.executionType === 'api' && agent.model && (
                                            <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                                                {agent.model}
                                            </span>
                                        )}
                                    </div>

                                    {/* Status */}
                                    <div className="flex items-center justify-between pt-3 border-t border-gray-200/50 dark:border-gray-800/50">
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full bg-green-500 shadow-sm"></div>
                                            <span className="text-xs text-gray-600 dark:text-gray-400">Active</span>
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
            </div >
        </>
    );
}
