'use client'

import { useEffect, useState, useCallback, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { saveAgent, deleteAgent } from '@/app/actions';
import type { Agent } from '@/lib/schemas';
import { ConversationalAgentCreator } from './ConversationalAgentCreator';
import ContextSelector from './ContextSelector';

interface ConversationalAgentEditorProps {
    isOpen: boolean;
    onClose: () => void;
    agent?: Agent;
}

interface GeneratedAgentConfig {
    name: string;
    description: string;
    executionType: 'cli' | 'api';
    provider: string;
    model: string;
    systemPrompt: string;
    terminalInstructions: string;
    artifactTemplate?: string;
}

const AVAILABLE_MODELS = {
    anthropic: [
        'claude-3-5-sonnet-20241022',
        'claude-3-opus-20240229',
        'claude-3-sonnet-20240229',
        'claude-3-haiku-20240307',
    ],
    openai: [
        'gpt-4-turbo-preview',
        'gpt-4',
        'gpt-3.5-turbo',
    ]
};

export function ConversationalAgentEditor({ isOpen, onClose, agent }: ConversationalAgentEditorProps) {
    const isEditMode = !!agent?.id;
    const [mounted, setMounted] = useState(false);

    // Form state
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [executionType, setExecutionType] = useState<'cli' | 'api'>('cli');
    const [provider, setProvider] = useState('anthropic');
    const [model, setModel] = useState('');
    const [apiKey, setApiKey] = useState('');
    const [systemPrompt, setSystemPrompt] = useState('');
    const [terminalInstructions, setTerminalInstructions] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    // Context selection state
    const [selectedDocsPages, setSelectedDocsPages] = useState<string[]>([]);
    const [selectedRepoFiles, setSelectedRepoFiles] = useState<string[]>([]);
    const [selectedUrls, setSelectedUrls] = useState<string[]>([]);
    const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
    const [selectedMCPs, setSelectedMCPs] = useState<string[]>([]);

    // Artifact template state - simple text field
    const [artifactTemplate, setArtifactTemplate] = useState('');
    const [isArtifactSectionExpanded, setIsArtifactSectionExpanded] = useState(false);

    // Track if AI has generated an agent config
    const [generatedConfig, setGeneratedConfig] = useState<GeneratedAgentConfig | null>(null);

    useEffect(() => {
        setMounted(true);
    }, []);

    // Initialize form with agent data in edit mode
    useEffect(() => {
        if (agent) {
            setName(agent.name);
            setDescription(agent.description || '');
            setExecutionType(agent.executionType);
            setProvider(agent.provider);
            setModel(agent.model || '');
            setApiKey(agent.apiKey || '');
            setSystemPrompt(agent.systemPrompt || '');
            setTerminalInstructions(agent.terminalInstructions || '');
            // Initialize context selections from agent
            setSelectedDocsPages(agent.defaultDocsPages || []);
            setSelectedRepoFiles(agent.defaultRepoFiles || []);
            setSelectedUrls(agent.defaultUrls || []);
            setSelectedSkills(agent.defaultSkills || []);
            setSelectedMCPs(agent.defaultMCPs || []);
            // Initialize artifact template
            setArtifactTemplate(agent.artifactTemplate || '');
            setIsArtifactSectionExpanded(!!agent.artifactTemplate);
        } else {
            // Reset for create mode
            setName('');
            setDescription('');
            setExecutionType('cli');
            setProvider('anthropic');
            setModel('');
            setApiKey('');
            setSystemPrompt('');
            setTerminalInstructions('');
            // Reset context selections
            setSelectedDocsPages([]);
            setSelectedRepoFiles([]);
            setSelectedUrls([]);
            setSelectedSkills([]);
            setSelectedMCPs([]);
            // Reset artifact template
            setArtifactTemplate('');
            setIsArtifactSectionExpanded(false);
        }
        setGeneratedConfig(null);
    }, [agent, isOpen]);

    // Helper to compare string arrays
    const arraysEqual = (a: string[], b: string[]) => {
        if (a.length !== b.length) return false;
        const sortedA = [...a].sort();
        const sortedB = [...b].sort();
        return sortedA.every((val, i) => val === sortedB[i]);
    };

    // Check if there are unsaved changes
    const hasUnsavedChanges = useMemo(() => {
        if (isEditMode) {
            // In edit mode, check if any field changed from original
            const formFieldsChanged =
                name !== (agent?.name || '') ||
                description !== (agent?.description || '') ||
                executionType !== (agent?.executionType || 'cli') ||
                provider !== (agent?.provider || 'anthropic') ||
                model !== (agent?.model || '') ||
                systemPrompt !== (agent?.systemPrompt || '') ||
                terminalInstructions !== (agent?.terminalInstructions || '') ||
                artifactTemplate !== (agent?.artifactTemplate || '');

            // Check if context selections changed
            const contextChanged =
                !arraysEqual(selectedDocsPages, agent?.defaultDocsPages || []) ||
                !arraysEqual(selectedRepoFiles, agent?.defaultRepoFiles || []) ||
                !arraysEqual(selectedUrls, agent?.defaultUrls || []) ||
                !arraysEqual(selectedSkills, agent?.defaultSkills || []) ||
                !arraysEqual(selectedMCPs, agent?.defaultMCPs || []);

            return formFieldsChanged || contextChanged;
        }
        // In create mode, check if any field has content or context selections
        const hasContextSelections =
            selectedDocsPages.length > 0 ||
            selectedRepoFiles.length > 0 ||
            selectedUrls.length > 0 ||
            selectedSkills.length > 0 ||
            selectedMCPs.length > 0;
        return name !== '' || description !== '' || systemPrompt !== '' || terminalInstructions !== '' || artifactTemplate !== '' || hasContextSelections;
    }, [isEditMode, agent, name, description, executionType, provider, model, systemPrompt, terminalInstructions, artifactTemplate, selectedDocsPages, selectedRepoFiles, selectedUrls, selectedSkills, selectedMCPs]);

    // Handle close with confirmation
    const handleCloseWithConfirmation = useCallback(() => {
        if (hasUnsavedChanges) {
            if (!confirm('You have unsaved changes. Are you sure you want to discard them?')) {
                return;
            }
        }
        onClose();
    }, [hasUnsavedChanges, onClose]);

    // Handle escape key
    useEffect(() => {
        function handleEscape(e: KeyboardEvent) {
            if (e.key === 'Escape' && isOpen) {
                handleCloseWithConfirmation();
            }
        }
        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [isOpen, handleCloseWithConfirmation]);

    // Handle agent generated from AI
    function handleAgentGenerated(config: GeneratedAgentConfig) {
        setGeneratedConfig(config);
        // Auto-apply the generated config to the form
        setName(config.name || name);
        setDescription(config.description || description);
        setExecutionType(config.executionType || executionType);
        setProvider(config.provider || provider);
        setModel(config.model || model);
        setSystemPrompt(config.systemPrompt || systemPrompt);
        setTerminalInstructions(config.terminalInstructions || terminalInstructions);
        // Apply artifact template if provided
        if (config.artifactTemplate) {
            setArtifactTemplate(config.artifactTemplate);
            setIsArtifactSectionExpanded(true);
        }
    }

    async function handleSave() {
        if (!name.trim()) {
            alert('Please enter an agent name');
            return;
        }

        setIsSaving(true);
        try {
            const agentData: Agent = {
                id: agent?.id || name.toLowerCase().replace(/\s+/g, '-'),
                name,
                description,
                executionType,
                provider,
                ...(executionType === 'api' && { model, apiKey }),
                systemPrompt,
                terminalInstructions,
                // Include artifact template if configured
                ...(artifactTemplate.trim() && { artifactTemplate }),
                // Include context selections
                defaultDocsPages: selectedDocsPages,
                defaultRepoFiles: selectedRepoFiles,
                defaultUrls: selectedUrls,
                defaultSkills: selectedSkills,
                defaultMCPs: selectedMCPs,
                createdAt: agent?.createdAt || '',
                updatedAt: '',
            };

            await saveAgent(agentData);
            onClose();
            window.location.reload();
        } catch (error) {
            console.error('Failed to save agent:', error);
            alert('Failed to save agent. Please try again.');
        } finally {
            setIsSaving(false);
        }
    }

    async function handleDelete() {
        if (!agent) return;
        if (!confirm(`Delete agent "${agent.name}"? This cannot be undone.`)) return;

        try {
            await deleteAgent(agent.id);
            onClose();
            window.location.reload();
        } catch (error) {
            console.error('Failed to delete agent:', error);
            alert('Failed to delete agent. Please try again.');
        }
    }

    if (!mounted) return null;

    const availableModels = AVAILABLE_MODELS[provider as keyof typeof AVAILABLE_MODELS] || [];

    return (
        <>
            {/* Backdrop */}
            {isOpen && ReactDOM.createPortal(
                <div
                    className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100]"
                    onClick={handleCloseWithConfirmation}
                />,
                document.body
            )}

            {/* Centered Modal */}
            {isOpen && ReactDOM.createPortal(
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-6">
                    <div
                        className="w-[90vw] h-[90vh] max-w-[1600px] bg-white dark:bg-[#0d0d0d] border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl flex flex-col overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#1a1a1a]">
                            <div>
                                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                                    {isEditMode ? 'Edit AI Agent' : 'Create AI Agent'}
                                </h2>
                                {agent?.id && (
                                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{agent.id}</p>
                                )}
                            </div>
                            <button
                                onClick={handleCloseWithConfirmation}
                                className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 p-1"
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {/* Body - Two Column Layout */}
                        <div className="flex-1 flex overflow-hidden">
                            {/* Left Panel - Chat Interface (35%) */}
                            <div className="w-[35%] flex flex-col overflow-hidden bg-white dark:bg-[#0d0d0d] border-r border-gray-200 dark:border-gray-700">
                                <ConversationalAgentCreator
                                    isOpen={isOpen}
                                    onAgentGenerated={handleAgentGenerated}
                                    currentAgent={agent}
                                />
                            </div>

                            {/* Right Panel - Agent Form (65%) */}
                            <div className="w-[65%] flex flex-col overflow-hidden bg-white dark:bg-[#0d0d0d]">
                                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                                    {/* Generated Config Banner */}
                                    {generatedConfig && (
                                        <div className="p-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-700 rounded-xl mb-4">
                                            <div className="flex items-center gap-2 mb-2">
                                                <svg className="w-5 h-5 text-purple-600 dark:text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                </svg>
                                                <span className="text-sm font-medium text-purple-700 dark:text-purple-300">AI-Generated Configuration Applied</span>
                                            </div>
                                            <p className="text-xs text-purple-600 dark:text-purple-400">
                                                The form has been populated with AI suggestions. Feel free to review and modify any fields before saving.
                                            </p>
                                        </div>
                                    )}

                                    {/* Basic Info */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                            Agent Name *
                                        </label>
                                        <input
                                            type="text"
                                            value={name}
                                            onChange={(e) => setName(e.target.value)}
                                            placeholder="e.g., Code Review Agent, Documentation Helper"
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                            Description (Optional)
                                        </label>
                                        <input
                                            type="text"
                                            value={description}
                                            onChange={(e) => setDescription(e.target.value)}
                                            placeholder="Brief description of the agent's purpose"
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                        />
                                    </div>

                                    {/* Execution Type */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                            Execution Type
                                        </label>
                                        <div className="grid grid-cols-2 gap-3">
                                            <button
                                                type="button"
                                                onClick={() => setExecutionType('cli')}
                                                className={`px-4 py-3 rounded-lg border-2 transition-all text-left ${executionType === 'cli'
                                                    ? 'border-purple-600 bg-purple-50 dark:bg-purple-900/20'
                                                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                                                    }`}
                                            >
                                                <div className="text-sm font-medium text-gray-900 dark:text-gray-100">CLI-based</div>
                                                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Uses local Claude CLI</div>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setExecutionType('api')}
                                                className={`px-4 py-3 rounded-lg border-2 transition-all text-left ${executionType === 'api'
                                                    ? 'border-purple-600 bg-purple-50 dark:bg-purple-900/20'
                                                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                                                    }`}
                                            >
                                                <div className="text-sm font-medium text-gray-900 dark:text-gray-100">API-based</div>
                                                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Uses API calls</div>
                                            </button>
                                        </div>
                                    </div>

                                    {/* API Configuration */}
                                    {executionType === 'api' ? (
                                        <div className="space-y-4">
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                                        Provider
                                                    </label>
                                                    <select
                                                        value={provider}
                                                        onChange={(e) => {
                                                            setProvider(e.target.value);
                                                            setModel('');
                                                        }}
                                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                                                    >
                                                        <option value="anthropic">Anthropic (Claude)</option>
                                                        <option value="openai">OpenAI (GPT)</option>
                                                    </select>
                                                </div>

                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                                        Model
                                                    </label>
                                                    <select
                                                        value={model}
                                                        onChange={(e) => setModel(e.target.value)}
                                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                                                    >
                                                        <option value="">Select model...</option>
                                                        {availableModels.map((m) => (
                                                            <option key={m} value={m}>{m}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            </div>

                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                                    API Key
                                                </label>
                                                <input
                                                    type="password"
                                                    value={apiKey}
                                                    onChange={(e) => setApiKey(e.target.value)}
                                                    placeholder="sk-ant-... or sk-..."
                                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-mono text-sm"
                                                />
                                                <p className="text-xs text-gray-500 mt-1">
                                                    Your API key will be stored securely
                                                </p>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                                            <div className="flex gap-3">
                                                <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                </svg>
                                                <div className="text-sm text-blue-800 dark:text-blue-100">
                                                    <strong>CLI-based execution</strong>
                                                    <p className="text-blue-600 dark:text-blue-300 mt-1">
                                                        Uses the local <code className="px-1 py-0.5 bg-blue-100 dark:bg-blue-900/40 rounded text-xs">claude</code> command. Model is determined by your Claude CLI version. No API key needed.
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* System Prompt */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                            System Prompt
                                        </label>
                                        <textarea
                                            value={systemPrompt}
                                            onChange={(e) => setSystemPrompt(e.target.value)}
                                            rows={8}
                                            placeholder="You are a specialized AI agent for... Focus on... Your expertise includes..."
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-mono text-sm resize-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                        />
                                        <p className="text-xs text-gray-500 mt-1">
                                            Custom instructions that define the agent&apos;s behavior and expertise. Use the chat to have AI help generate this.
                                        </p>
                                    </div>

                                    {/* Terminal Instructions */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                            Terminal Instructions
                                        </label>
                                        <textarea
                                            value={terminalInstructions}
                                            onChange={(e) => setTerminalInstructions(e.target.value)}
                                            rows={8}
                                            placeholder="1. Read the ticket file to understand the task&#10;2. Complete the work described in the ticket&#10;3. Commit your changes to this feature branch"
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-mono text-sm resize-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                        />
                                        <p className="text-xs text-gray-500 mt-1">
                                            Instructions displayed in the terminal when launching an agent session. Leave empty for no instructions. Supports multi-line text.
                                        </p>
                                    </div>

                                    {/* Default Context Section */}
                                    <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
                                        <div className="mb-4">
                                            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Default Context</h3>
                                            <p className="text-xs text-gray-500 mt-1">
                                                Pre-select context that will be included when this agent runs on any ticket.
                                            </p>
                                        </div>
                                        <div className="h-[300px] border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                                            <ContextSelector
                                                selectedDocsPages={selectedDocsPages}
                                                onDocsSelectionChange={setSelectedDocsPages}
                                                selectedRepoFiles={selectedRepoFiles}
                                                onRepoFilesSelectionChange={setSelectedRepoFiles}
                                                selectedUrls={selectedUrls}
                                                onUrlsSelectionChange={setSelectedUrls}
                                                selectedSkills={selectedSkills}
                                                onSkillsSelectionChange={setSelectedSkills}
                                                selectedMCPs={selectedMCPs}
                                                onMCPsSelectionChange={setSelectedMCPs}
                                                hideSettingsTab={true}
                                                hideTicketTab={true}
                                                className="h-full"
                                            />
                                        </div>
                                    </div>

                                    {/* Artifact Template Section */}
                                    <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
                                        <button
                                            type="button"
                                            onClick={() => setIsArtifactSectionExpanded(!isArtifactSectionExpanded)}
                                            className="w-full flex items-center justify-between text-left"
                                        >
                                            <div>
                                                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
                                                    <svg className="w-4 h-4 text-purple-600 dark:text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                    </svg>
                                                    Artifact Template
                                                    {artifactTemplate && (
                                                        <span className="px-2 py-0.5 bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 text-xs rounded-full">
                                                            Configured
                                                        </span>
                                                    )}
                                                </h3>
                                                <p className="text-xs text-gray-500 mt-1">
                                                    Define a template for artifacts generated by this agent.
                                                </p>
                                            </div>
                                            <svg
                                                className={`w-5 h-5 text-gray-400 transition-transform ${isArtifactSectionExpanded ? 'rotate-180' : ''}`}
                                                fill="none"
                                                viewBox="0 0 24 24"
                                                stroke="currentColor"
                                            >
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                            </svg>
                                        </button>

                                        {isArtifactSectionExpanded && (
                                            <div className="mt-4">
                                                <textarea
                                                    value={artifactTemplate}
                                                    onChange={(e) => setArtifactTemplate(e.target.value)}
                                                    rows={8}
                                                    placeholder="Enter your artifact template instructions here. This will be included in the agent's context when generating artifacts."
                                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm resize-y focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                                />
                                                <p className="text-xs text-gray-500 mt-1">
                                                    This template will be included in the agent&apos;s context when generating artifacts.
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="px-6 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#1a1a1a] flex items-center justify-between">
                            <div>
                                {isEditMode && (
                                    <button
                                        onClick={handleDelete}
                                        className="px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                    >
                                        Delete Agent
                                    </button>
                                )}
                            </div>
                            <div className="flex gap-3">
                                <button
                                    onClick={handleCloseWithConfirmation}
                                    className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSave}
                                    disabled={isSaving || !name.trim() || (executionType === 'api' && (!model || !apiKey))}
                                    className="px-6 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isSaving ? 'Saving...' : isEditMode ? 'Save Changes' : 'Create Agent'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </>
    );
}
