'use client';

import { useState } from 'react';
import DocsPageSelector from './DocsPageSelector';
import RepoFileSelector from './RepoFileSelector';
import UrlSelector from './UrlSelector';
import SkillSelector from './SkillSelector';
import MCPSelector from './MCPSelector';
import { ArtifactSelector } from './ArtifactSelector';
import type { Ticket } from '@/lib/schemas';

type TabType = 'settings' | 'ticket' | 'docs' | 'files' | 'links' | 'skills' | 'mcp' | 'artifacts';

// Settings-related interfaces
interface ExecutionOptions {
    skipPermissions: boolean;
    includeDocsPages: string[];
    includeRepoFiles: string[];
    includeUrls: string[];
    includeSkills: string[];
    includeMCPs: string[];
    includeArtifacts: string[]; // Array of artifact IDs to include as context
    includeRelatedTickets: boolean;
    executionMode: 'normal' | 'plan-only';
    executeImmediately: boolean;
    baseBranch?: string;
    mergeBranch?: string;
    autoMerge: boolean;
    autoPush: boolean;
    autoUpdateTicket: boolean;
    autoMoveTicket: boolean;
    targetColumn: string;
}

interface WorktreeStatus {
    ticketId: string;
    branchName: string;
    branchExists: boolean;
    worktreePath: string;
    worktreeExists: boolean;
    status: 'ready' | 'needs-worktree' | 'needs-branch';
}

interface TicketLink {
    id: string;
    title: string;
}

interface AIAgent {
    id: string;
    name: string;
    systemPrompt?: string;
}

interface AIProvider {
    id: string;
    name: string;
}

interface BoardStatus {
    id: string;
    name: string;
}

// Type for tracking which ticket sections are enabled
export interface TicketSectionSelections {
    title: boolean;
    description: boolean;
    implementationSteps: boolean;
    acceptanceCriteria: boolean;
    notes: boolean;
}

// Default selections - all enabled
export const DEFAULT_TICKET_SECTIONS: TicketSectionSelections = {
    title: true,
    description: true,
    implementationSteps: true,
    acceptanceCriteria: true,
    notes: true,
};

// AI Provider options constant
const AI_PROVIDERS: AIProvider[] = [
    { id: 'claude-code', name: 'Claude Code' },
    { id: 'gemini-cli', name: 'Gemini CLI' },
    { id: 'cursor-cli', name: 'Cursor CLI' },
];

interface ContextSelectorProps {
    selectedDocsPages: string[];
    onDocsSelectionChange: (pages: string[]) => void;
    selectedRepoFiles: string[];
    onRepoFilesSelectionChange: (files: string[]) => void;
    // URL-related props
    selectedUrls?: string[];
    onUrlsSelectionChange?: (urls: string[]) => void;
    // Skills-related props
    selectedSkills?: string[];
    onSkillsSelectionChange?: (skills: string[]) => void;
    // MCP-related props
    selectedMCPs?: string[];
    onMCPsSelectionChange?: (mcps: string[]) => void;
    // Artifacts-related props (for pipeline context)
    selectedArtifacts?: string[];
    onArtifactsSelectionChange?: (artifacts: string[]) => void;
    // Ticket-related props
    ticket?: Ticket | null;
    selectedTicketSections?: TicketSectionSelections;
    onTicketSectionsChange?: (sections: TicketSectionSelections) => void;
    maxHeight?: string;
    className?: string;
    // Custom ticket tab content (e.g., ticket form)
    ticketTabContent?: React.ReactNode;
    // Hide the ticket tab badge count when using custom content
    hideTicketBadge?: boolean;
    // Hide the Ticket tab entirely (for contexts where there's no ticket)
    hideTicketTab?: boolean;
    // Hide the Settings tab (for contexts where AI execution settings are not relevant)
    hideSettingsTab?: boolean;
    // Settings tab props
    ticketId?: string;
    selectedProvider?: string;
    onProviderChange?: (provider: string) => void;
    selectedAgent?: string;
    onAgentChange?: (agent: string) => void;
    aiAgents?: AIAgent[];
    createNewBranch?: boolean;
    onCreateNewBranchChange?: (value: boolean) => void;
    worktreeStatus?: WorktreeStatus | null;
    worktreeLoading?: boolean;
    branches?: string[];
    branchesLoading?: boolean;
    executionOptions?: ExecutionOptions;
    onExecutionOptionsChange?: (options: ExecutionOptions) => void;
    claudeSessionExists?: boolean;
    shouldResumeSession?: boolean;
    onShouldResumeSessionChange?: (value: boolean) => void;
    relatedTickets?: TicketLink[];
    statuses?: BoardStatus[];
    isRunning?: boolean;
}

/**
 * ContextSelector - Tabbed interface for selecting context (Docs, Files, Skills)
 * Reusable component for AgentLauncher, PromptModeChat, and EditWithAIChat
 */
export default function ContextSelector({
    selectedDocsPages,
    onDocsSelectionChange,
    selectedRepoFiles,
    onRepoFilesSelectionChange,
    selectedUrls = [],
    onUrlsSelectionChange,
    selectedSkills = [],
    onSkillsSelectionChange,
    selectedMCPs = [],
    onMCPsSelectionChange,
    selectedArtifacts = [],
    onArtifactsSelectionChange,
    ticket,
    selectedTicketSections = DEFAULT_TICKET_SECTIONS,
    onTicketSectionsChange,
    maxHeight = 'max-h-[400px]',
    className = '',
    ticketTabContent,
    hideTicketBadge = false,
    hideTicketTab = false,
    hideSettingsTab = false,
    // Settings tab props
    ticketId,
    selectedProvider = 'claude-code',
    onProviderChange,
    selectedAgent = '',
    onAgentChange,
    aiAgents = [],
    createNewBranch = true,
    onCreateNewBranchChange,
    worktreeStatus,
    worktreeLoading = false,
    branches = [],
    branchesLoading = false,
    executionOptions,
    onExecutionOptionsChange,
    claudeSessionExists = false,
    shouldResumeSession = false,
    onShouldResumeSessionChange,
    relatedTickets = [],
    statuses = [],
    isRunning = false,
}: ContextSelectorProps) {
    const [activeTab, setActiveTab] = useState<TabType>(
        hideSettingsTab ? (hideTicketTab ? 'docs' : 'ticket') : 'settings'
    );

    // Track which accordion sections are expanded
    const [expandedSections, setExpandedSections] = useState<Set<keyof TicketSectionSelections>>(new Set());

    // Count how many ticket sections are enabled
    const enabledTicketSectionsCount = Object.values(selectedTicketSections).filter(Boolean).length;

    // Toggle a specific ticket section (checkbox)
    const toggleSection = (section: keyof TicketSectionSelections) => {
        if (onTicketSectionsChange) {
            onTicketSectionsChange({
                ...selectedTicketSections,
                [section]: !selectedTicketSections[section],
            });
        }
    };

    // Toggle accordion expand/collapse
    const toggleExpand = (section: keyof TicketSectionSelections) => {
        setExpandedSections(prev => {
            const newSet = new Set(prev);
            if (newSet.has(section)) {
                newSet.delete(section);
            } else {
                newSet.add(section);
            }
            return newSet;
        });
    };

    return (
        <div className={`flex flex-col overflow-hidden ${className}`}>
            {/* Tab Bar */}
            <div className="flex border-b border-gray-200 dark:border-gray-700 overflow-x-auto scrollbar-xs">
                {!hideSettingsTab && (
                    <button
                        onClick={() => setActiveTab('settings')}
                        className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === 'settings'
                            ? 'border-purple-500 text-purple-600 dark:text-purple-400'
                            : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-300'
                            }`}
                    >
                        Settings
                    </button>
                )}
                {!hideTicketTab && (
                    <button
                        onClick={() => setActiveTab('ticket')}
                        className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === 'ticket'
                            ? 'border-purple-500 text-purple-600 dark:text-purple-400'
                            : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-300'
                            }`}
                    >
                        Ticket
                    </button>
                )}
                <button
                    onClick={() => setActiveTab('docs')}
                    className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === 'docs'
                        ? 'border-purple-500 text-purple-600 dark:text-purple-400'
                        : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-300'
                        }`}
                >
                    Docs
                    {selectedDocsPages.length > 0 && (
                        <span className="ml-2 px-1.5 py-0.5 text-xs bg-purple-600 text-white rounded-full">
                            {selectedDocsPages.length}
                        </span>
                    )}
                </button>
                <button
                    onClick={() => setActiveTab('files')}
                    className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === 'files'
                        ? 'border-purple-500 text-purple-600 dark:text-purple-400'
                        : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-300'
                        }`}
                >
                    Files
                    {selectedRepoFiles.length > 0 && (
                        <span className="ml-2 px-1.5 py-0.5 text-xs bg-purple-600 text-white rounded-full">
                            {selectedRepoFiles.length}
                        </span>
                    )}
                </button>
                <button
                    onClick={() => setActiveTab('links')}
                    className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === 'links'
                        ? 'border-purple-500 text-purple-600 dark:text-purple-400'
                        : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-300'
                        }`}
                >
                    Links
                    {selectedUrls.length > 0 && (
                        <span className="ml-2 px-1.5 py-0.5 text-xs bg-purple-600 text-white rounded-full">
                            {selectedUrls.length}
                        </span>
                    )}
                </button>
                <button
                    onClick={() => setActiveTab('skills')}
                    className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === 'skills'
                        ? 'border-purple-500 text-purple-600 dark:text-purple-400'
                        : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-300'
                        }`}
                >
                    Skills
                    {selectedSkills.length > 0 && (
                        <span className="ml-2 px-1.5 py-0.5 text-xs bg-purple-600 text-white rounded-full">
                            {selectedSkills.length}
                        </span>
                    )}
                </button>
                <button
                    onClick={() => setActiveTab('mcp')}
                    className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === 'mcp'
                        ? 'border-purple-500 text-purple-600 dark:text-purple-400'
                        : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-300'
                        }`}
                >
                    MCP
                    {selectedMCPs.length > 0 && (
                        <span className="ml-2 px-1.5 py-0.5 text-xs bg-purple-600 text-white rounded-full">
                            {selectedMCPs.length}
                        </span>
                    )}
                </button>
                <button
                    onClick={() => setActiveTab('artifacts')}
                    className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === 'artifacts'
                        ? 'border-purple-500 text-purple-600 dark:text-purple-400'
                        : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-300'
                        }`}
                >
                    Artifacts
                    {selectedArtifacts.length > 0 && (
                        <span className="ml-2 px-1.5 py-0.5 text-xs bg-purple-600 text-white rounded-full">
                            {selectedArtifacts.length}
                        </span>
                    )}
                </button>
            </div>

            {/* Tab Content */}
            <div className="flex-1 flex flex-col overflow-hidden pt-3 h-0">
                {activeTab === 'settings' && (
                    <div className="h-full overflow-y-auto pr-2 scrollbar-thin space-y-4">
                        {/* Claude Session Indicator */}
                        {!isRunning && claudeSessionExists && (
                            <div className="p-3 rounded-lg border border-blue-500/30 bg-blue-50 dark:bg-blue-500/10">
                                <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    <span className="text-sm">
                                        Previous session found
                                    </span>
                                </div>
                            </div>
                        )}

                        {/* Provider Dropdown */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Provider
                            </label>
                            <select
                                value={selectedProvider}
                                onChange={(e) => onProviderChange?.(e.target.value)}
                                disabled={isRunning}
                                className="w-full px-3 py-2 bg-white dark:bg-[#1a1a1a] border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50"
                            >
                                {AI_PROVIDERS.map((provider) => (
                                    <option key={provider.id} value={provider.id}>
                                        {provider.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Agent Dropdown */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                AI Agent
                            </label>
                            <select
                                value={selectedAgent}
                                onChange={(e) => onAgentChange?.(e.target.value)}
                                disabled={isRunning}
                                className="w-full px-3 py-2 bg-white dark:bg-[#1a1a1a] border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50"
                            >
                                {aiAgents.length === 0 ? (
                                    <option>No agents available</option>
                                ) : (
                                    aiAgents.map((agent) => (
                                        <option key={agent.id} value={agent.id}>
                                            {agent.name}
                                        </option>
                                    ))
                                )}
                            </select>
                        </div>

                        {/* Branch Toggle */}
                        <div className={`p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#1a1a1a]/50 ${isRunning ? 'opacity-50' : ''}`}>
                            <div className="flex items-center justify-between">
                                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Create New Branch</label>
                                <button
                                    onClick={() => !isRunning && onCreateNewBranchChange?.(!createNewBranch)}
                                    disabled={isRunning}
                                    className={`w-11 h-6 rounded-full transition-colors ${createNewBranch ? 'bg-purple-600' : 'bg-gray-300 dark:bg-gray-700'} ${isRunning ? 'cursor-not-allowed' : ''}`}
                                >
                                    <div className={`w-5 h-5 bg-white rounded-full shadow transform transition-transform ${createNewBranch ? 'translate-x-5' : 'translate-x-0.5'}`} />
                                </button>
                            </div>

                            {/* Branch Status */}
                            <div className="mt-2 text-xs">
                                {worktreeLoading ? (
                                    <span className="text-gray-500 dark:text-gray-400 flex items-center gap-2">
                                        <div className="w-3 h-3 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                                        Checking...
                                    </span>
                                ) : createNewBranch ? (
                                    (worktreeStatus?.status === 'ready' || worktreeStatus?.status === 'needs-worktree') ? (
                                        <span className="text-yellow-600 dark:text-yellow-400">Branch exists</span>
                                    ) : (
                                        <span className="text-purple-600 dark:text-purple-400">Will create: {ticketId}</span>
                                    )
                                ) : (
                                    worktreeStatus?.status === 'ready' ? (
                                        <span className="text-green-600 dark:text-green-400">Using: {ticketId}</span>
                                    ) : (
                                        <span className="text-gray-500 dark:text-gray-400">No branch yet</span>
                                    )
                                )}
                            </div>

                            {/* Base Branch Selector */}
                            {createNewBranch && !branchesLoading && executionOptions && (
                                <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                                    <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Base Branch</label>
                                    <select
                                        value={executionOptions.baseBranch || 'main'}
                                        onChange={(e) => onExecutionOptionsChange?.({
                                            ...executionOptions,
                                            baseBranch: e.target.value,
                                        })}
                                        disabled={isRunning}
                                        className="w-full px-2 py-1.5 bg-white dark:bg-[#1a1a1a] border border-gray-300 dark:border-gray-700 rounded text-gray-900 dark:text-gray-100 text-sm disabled:cursor-not-allowed"
                                    >
                                        {branches.map((branch) => (
                                            <option key={branch} value={branch}>{branch}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {/* Auto Push Toggle */}
                            {createNewBranch && executionOptions && (
                                <div className="mt-3 flex items-center justify-between">
                                    <label className="text-xs text-gray-500 dark:text-gray-400">Auto Push</label>
                                    <button
                                        onClick={() => !isRunning && onExecutionOptionsChange?.({ ...executionOptions, autoPush: !executionOptions.autoPush })}
                                        disabled={isRunning}
                                        className={`w-11 h-6 rounded-full transition-colors ${executionOptions.autoPush ? 'bg-purple-600' : 'bg-gray-300 dark:bg-gray-700'} ${isRunning ? 'cursor-not-allowed' : ''}`}
                                    >
                                        <div className={`w-5 h-5 bg-white rounded-full shadow transform transition-transform ${executionOptions.autoPush ? 'translate-x-5' : 'translate-x-0.5'}`} />
                                    </button>
                                </div>
                            )}

                            {/* Auto Merge Toggle */}
                            {createNewBranch && executionOptions && (
                                <div className="mt-3 flex items-center justify-between">
                                    <label className="text-xs text-gray-500 dark:text-gray-400">Auto Merge PR</label>
                                    <button
                                        onClick={() => !isRunning && onExecutionOptionsChange?.({ ...executionOptions, autoMerge: !executionOptions.autoMerge })}
                                        disabled={isRunning}
                                        className={`w-11 h-6 rounded-full transition-colors ${executionOptions.autoMerge ? 'bg-purple-600' : 'bg-gray-300 dark:bg-gray-700'} ${isRunning ? 'cursor-not-allowed' : ''}`}
                                    >
                                        <div className={`w-5 h-5 bg-white rounded-full shadow transform transition-transform ${executionOptions.autoMerge ? 'translate-x-5' : 'translate-x-0.5'}`} />
                                    </button>
                                </div>
                            )}

                            {/* Merge Branch Selector - Only shown when Auto Merge is enabled */}
                            {createNewBranch && !branchesLoading && executionOptions && executionOptions.autoMerge && (
                                <div className="mt-3">
                                    <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Merge Branch (PR Target)</label>
                                    <select
                                        value={executionOptions.mergeBranch || 'main'}
                                        onChange={(e) => onExecutionOptionsChange?.({
                                            ...executionOptions,
                                            mergeBranch: e.target.value,
                                        })}
                                        disabled={isRunning}
                                        className="w-full px-2 py-1.5 bg-white dark:bg-[#1a1a1a] border border-gray-300 dark:border-gray-700 rounded text-gray-900 dark:text-gray-100 text-sm disabled:cursor-not-allowed"
                                    >
                                        {branches.map((branch) => (
                                            <option key={branch} value={branch}>{branch}</option>
                                        ))}
                                    </select>
                                </div>
                            )}
                        </div>

                        {/* Ticket Automation */}
                        {createNewBranch && executionOptions && (
                            <div className={`p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#1a1a1a]/50 ${isRunning ? 'opacity-50' : ''}`}>
                                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-3">Ticket Automation</label>

                                {/* Auto Update Ticket Toggle */}
                                <div className="flex items-center justify-between">
                                    <label className="text-xs text-gray-500 dark:text-gray-400">Auto Update Ticket</label>
                                    <button
                                        onClick={() => !isRunning && onExecutionOptionsChange?.({ ...executionOptions, autoUpdateTicket: !executionOptions.autoUpdateTicket })}
                                        disabled={isRunning}
                                        className={`w-11 h-6 rounded-full transition-colors ${executionOptions.autoUpdateTicket ? 'bg-purple-600' : 'bg-gray-300 dark:bg-gray-700'} ${isRunning ? 'cursor-not-allowed' : ''}`}
                                    >
                                        <div className={`w-5 h-5 bg-white rounded-full shadow transform transition-transform ${executionOptions.autoUpdateTicket ? 'translate-x-5' : 'translate-x-0.5'}`} />
                                    </button>
                                </div>

                                {/* Auto Move Ticket Toggle */}
                                <div className="mt-3 flex items-center justify-between">
                                    <label className="text-xs text-gray-500 dark:text-gray-400">Auto Move Ticket</label>
                                    <button
                                        onClick={() => !isRunning && onExecutionOptionsChange?.({ ...executionOptions, autoMoveTicket: !executionOptions.autoMoveTicket })}
                                        disabled={isRunning}
                                        className={`w-11 h-6 rounded-full transition-colors ${executionOptions.autoMoveTicket ? 'bg-purple-600' : 'bg-gray-300 dark:bg-gray-700'} ${isRunning ? 'cursor-not-allowed' : ''}`}
                                    >
                                        <div className={`w-5 h-5 bg-white rounded-full shadow transform transition-transform ${executionOptions.autoMoveTicket ? 'translate-x-5' : 'translate-x-0.5'}`} />
                                    </button>
                                </div>

                                {/* Target Column Dropdown */}
                                {executionOptions.autoMoveTicket && (
                                    <div className="mt-3">
                                        <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Target Column</label>
                                        <select
                                            value={executionOptions.targetColumn}
                                            onChange={(e) => onExecutionOptionsChange?.({
                                                ...executionOptions,
                                                targetColumn: e.target.value,
                                            })}
                                            disabled={isRunning}
                                            className="w-full px-2 py-1.5 bg-white dark:bg-[#1a1a1a] border border-gray-300 dark:border-gray-700 rounded text-gray-900 dark:text-gray-100 text-sm disabled:cursor-not-allowed"
                                        >
                                            {statuses.map((status) => (
                                                <option key={status.id} value={status.id}>{status.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Options */}
                        {executionOptions && (
                            <div className={`space-y-3 p-3 bg-gray-50 dark:bg-[#1a1a1a]/50 rounded-lg border border-gray-200 dark:border-gray-700 ${isRunning ? 'opacity-50' : ''}`}>
                                {/* Resume Session */}
                                {claudeSessionExists && (
                                    <div className="flex items-center justify-between">
                                        <label className="text-sm text-gray-700 dark:text-gray-300">Resume Session</label>
                                        <button
                                            onClick={() => !isRunning && onShouldResumeSessionChange?.(!shouldResumeSession)}
                                            disabled={isRunning}
                                            className={`w-11 h-6 rounded-full transition-colors ${shouldResumeSession ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-700'} ${isRunning ? 'cursor-not-allowed' : ''}`}
                                        >
                                            <div className={`w-5 h-5 bg-white rounded-full shadow transform transition-transform ${shouldResumeSession ? 'translate-x-5' : 'translate-x-0.5'}`} />
                                        </button>
                                    </div>
                                )}

                                {/* Skip Permissions */}
                                <div className="flex items-center justify-between">
                                    <label className="text-sm text-gray-700 dark:text-gray-300">Skip Permissions</label>
                                    <button
                                        onClick={() => !isRunning && onExecutionOptionsChange?.({ ...executionOptions, skipPermissions: !executionOptions.skipPermissions })}
                                        disabled={isRunning}
                                        className={`w-11 h-6 rounded-full transition-colors ${executionOptions.skipPermissions ? 'bg-purple-600' : 'bg-gray-300 dark:bg-gray-700'} ${isRunning ? 'cursor-not-allowed' : ''}`}
                                    >
                                        <div className={`w-5 h-5 bg-white rounded-full shadow transform transition-transform ${executionOptions.skipPermissions ? 'translate-x-5' : 'translate-x-0.5'}`} />
                                    </button>
                                </div>

                                {/* Execution Mode */}
                                <div>
                                    <label className="text-sm text-gray-700 dark:text-gray-300 mb-2 block">Execution Mode</label>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => !isRunning && onExecutionOptionsChange?.({ ...executionOptions, executionMode: 'normal' })}
                                            disabled={isRunning}
                                            className={`flex-1 px-3 py-1.5 rounded text-xs font-medium ${executionOptions.executionMode === 'normal'
                                                ? 'bg-purple-600 text-white'
                                                : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                                                } ${isRunning ? 'cursor-not-allowed' : ''}`}
                                        >
                                            Normal
                                        </button>
                                        <button
                                            onClick={() => !isRunning && onExecutionOptionsChange?.({ ...executionOptions, executionMode: 'plan-only' })}
                                            disabled={isRunning}
                                            className={`flex-1 px-3 py-1.5 rounded text-xs font-medium ${executionOptions.executionMode === 'plan-only'
                                                ? 'bg-purple-600 text-white'
                                                : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                                                } ${isRunning ? 'cursor-not-allowed' : ''}`}
                                        >
                                            Plan First
                                        </button>
                                    </div>
                                </div>

                                {/* Related Tickets */}
                                {relatedTickets.length > 0 && (
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <label className="text-sm text-gray-700 dark:text-gray-300">Related Tickets</label>
                                            <p className="text-xs text-gray-500">{relatedTickets.length} linked</p>
                                        </div>
                                        <button
                                            onClick={() => !isRunning && onExecutionOptionsChange?.({ ...executionOptions, includeRelatedTickets: !executionOptions.includeRelatedTickets })}
                                            disabled={isRunning}
                                            className={`w-11 h-6 rounded-full transition-colors ${executionOptions.includeRelatedTickets ? 'bg-purple-600' : 'bg-gray-300 dark:bg-gray-700'} ${isRunning ? 'cursor-not-allowed' : ''}`}
                                        >
                                            <div className={`w-5 h-5 bg-white rounded-full shadow transform transition-transform ${executionOptions.includeRelatedTickets ? 'translate-x-5' : 'translate-x-0.5'}`} />
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
                {activeTab === 'ticket' && !hideTicketTab && (
                    <div className="h-full overflow-y-auto pr-2 scrollbar-thin">
                        {ticketTabContent ? (
                            // Custom ticket tab content (e.g., ticket form from TicketEditor)
                            ticketTabContent
                        ) : !ticket ? (
                            <div className="flex items-center justify-center h-48 text-gray-500">
                                <div className="text-center">
                                    <svg className="w-10 h-10 mx-auto mb-2 text-gray-400 dark:text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                    </svg>
                                    <p className="text-sm">No ticket data available</p>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {/* Title */}
                                <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#1a1a1a]/50 p-3">
                                    <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Title</div>
                                    <div className="text-sm text-gray-800 dark:text-gray-200">{ticket.title}</div>
                                </div>

                                {/* Description */}
                                {ticket.description && (
                                    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#1a1a1a]/50 p-3">
                                        <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Description</div>
                                        <div className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{ticket.description}</div>
                                    </div>
                                )}

                                {/* Implementation Steps */}
                                {ticket.implementation_steps?.length > 0 && (
                                    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#1a1a1a]/50 p-3">
                                        <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                                            Implementation Steps ({ticket.implementation_steps.length})
                                        </div>
                                        <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-1.5">
                                            {ticket.implementation_steps.map((step, i) => (
                                                <li key={i} className="flex items-start gap-2">
                                                    <span className={`text-xs mt-0.5 ${step.completed ? 'text-green-600 dark:text-green-400' : 'text-gray-400 dark:text-gray-500'}`}>
                                                        {step.completed ? '✓' : '○'}
                                                    </span>
                                                    <span>{step.text}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                {/* Acceptance Criteria */}
                                {ticket.acceptance_criteria?.length > 0 && (
                                    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#1a1a1a]/50 p-3">
                                        <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                                            Acceptance Criteria ({ticket.acceptance_criteria.length})
                                        </div>
                                        <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-1.5">
                                            {ticket.acceptance_criteria.map((criterion, i) => (
                                                <li key={i} className="flex items-start gap-2">
                                                    <span className={`text-xs mt-0.5 ${criterion.completed ? 'text-green-600 dark:text-green-400' : 'text-gray-400 dark:text-gray-500'}`}>
                                                        {criterion.completed ? '✓' : '○'}
                                                    </span>
                                                    <span>{criterion.text}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                {/* Notes */}
                                {ticket.notes && (
                                    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#1a1a1a]/50 p-3">
                                        <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Notes</div>
                                        <div className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{ticket.notes}</div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
                {activeTab === 'docs' && (
                    <DocsPageSelector
                        selectedPages={selectedDocsPages}
                        onSelectionChange={onDocsSelectionChange}
                        className="h-full flex flex-col"
                    />
                )}
                {activeTab === 'files' && (
                    <RepoFileSelector
                        selectedFiles={selectedRepoFiles}
                        onSelectionChange={onRepoFilesSelectionChange}
                        className="h-full flex flex-col"
                    />
                )}
                {activeTab === 'links' && (
                    <UrlSelector
                        selectedUrls={selectedUrls}
                        onSelectionChange={onUrlsSelectionChange || (() => {})}
                        className="h-full flex flex-col"
                    />
                )}
                {activeTab === 'skills' && (
                    <SkillSelector
                        selectedSkills={selectedSkills}
                        onSelectionChange={onSkillsSelectionChange || (() => {})}
                        className="h-full flex flex-col"
                    />
                )}
                {activeTab === 'mcp' && (
                    <MCPSelector
                        selectedMCPs={selectedMCPs}
                        onSelectionChange={onMCPsSelectionChange || (() => {})}
                        className="h-full flex flex-col"
                    />
                )}
                {activeTab === 'artifacts' && ticketId && (
                    <ArtifactSelector
                        ticketId={ticketId}
                        selectedArtifacts={selectedArtifacts}
                        onSelectionChange={onArtifactsSelectionChange || (() => {})}
                        className="h-full flex flex-col"
                    />
                )}
                {activeTab === 'artifacts' && !ticketId && (
                    <div className="flex flex-col items-center justify-center p-8 text-gray-500">
                        <svg className="w-10 h-10 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <p className="text-sm">No ticket selected</p>
                        <p className="text-xs text-gray-400 dark:text-gray-600 mt-1">Select a ticket to view its artifacts</p>
                    </div>
                )}
            </div>
        </div>
    );
}
