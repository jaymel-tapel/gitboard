'use client'

import { useState, useEffect } from 'react';
import { saveAgent, deleteAgent } from '@/app/actions';
import type { Agent } from '@/lib/schemas';

interface EditAIAgentPanelProps {
    isOpen: boolean;
    onClose: () => void;
    agent?: Agent;
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

export function EditAIAgentPanel({ isOpen, onClose, agent }: EditAIAgentPanelProps) {
    const [name, setName] = useState(agent?.name || '');
    const [description, setDescription] = useState(agent?.description || '');
    const [executionType, setExecutionType] = useState<'cli' | 'api'>(agent?.executionType || 'cli');
    const [provider, setProvider] = useState(agent?.provider || 'anthropic');
    const [model, setModel] = useState(agent?.model || '');
    const [apiKey, setApiKey] = useState(agent?.apiKey || '');
    const [systemPrompt, setSystemPrompt] = useState(agent?.systemPrompt || '');
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (agent) {
            setName(agent.name);
            setDescription(agent.description || '');
            setExecutionType(agent.executionType);
            setProvider(agent.provider);
            setModel(agent.model || '');
            setApiKey(agent.apiKey || '');
            setSystemPrompt(agent.systemPrompt || '');
        } else {
            // Reset for new agent
            setName('');
            setDescription('');
            setExecutionType('cli');
            setProvider('anthropic');
            setModel('');
            setApiKey('');
            setSystemPrompt('');
        }
    }, [agent, isOpen]);

    async function handleSave() {
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

    if (!isOpen) return null;

    const availableModels = AVAILABLE_MODELS[provider as keyof typeof AVAILABLE_MODELS] || [];

    return (
        <div className="fixed inset-y-0 right-0 w-[700px] bg-white dark:bg-[#0d0d0d] border-l border-gray-200 dark:border-gray-800 shadow-2xl z-50 flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
                <div>
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        {agent ? 'Edit AI Agent' : 'New AI Agent'}
                    </h2>
                    {agent && <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{agent.id}</p>}
                </div>
                <button
                    onClick={onClose}
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Basic Info */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Agent Name
                    </label>
                    <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g., Claude Code, GPT Assistant"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
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
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
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
                            className={`px-4 py-3 rounded-lg border-2 transition-all ${executionType === 'cli'
                                ? 'border-purple-600 bg-purple-50 dark:bg-purple-900/20'
                                : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700'
                                }`}
                        >
                            <div className="text-sm font-medium text-gray-900 dark:text-gray-100">CLI-based</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Uses local Claude CLI</div>
                        </button>
                        <button
                            type="button"
                            onClick={() => setExecutionType('api')}
                            className={`px-4 py-3 rounded-lg border-2 transition-all ${executionType === 'api'
                                ? 'border-purple-600 bg-purple-50 dark:bg-purple-900/20'
                                : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700'
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
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
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
                            <div className="text-sm text-blue-900 dark:text-blue-100">
                                <strong>CLI-based execution</strong>
                                <p className="text-blue-700 dark:text-blue-300 mt-1">
                                    Uses the local <code className="px-1 py-0.5 bg-blue-100 dark:bg-blue-900/40 rounded text-xs">claude</code> command. Model is determined by your Claude CLI version. No API key needed.
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {/* System Prompt */}
                <div>
                    <div className="flex items-center justify-between mb-2">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                            System Prompt (Optional)
                        </label>
                        <button
                            type="button"
                            onClick={async () => {
                                if (!name) {
                                    alert('Please enter an agent name first');
                                    return;
                                }

                                setIsSaving(true);
                                try {
                                    const response = await fetch('/api/generate-system-prompt', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({
                                            name,
                                            description: description || 'A helpful AI assistant'
                                        }),
                                    });

                                    if (!response.ok) throw new Error('Failed to generate prompt');

                                    const data = await response.json();
                                    setSystemPrompt(data.systemPrompt);
                                } catch (error) {
                                    console.error('Failed to generate system prompt:', error);
                                    alert('Failed to generate system prompt. Make sure Claude CLI is installed.');
                                } finally {
                                    setIsSaving(false);
                                }
                            }}
                            disabled={isSaving || !name}
                            className="text-xs px-3 py-1.5 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg hover:from-purple-700 hover:to-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                        >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                            {isSaving ? 'Generating...' : 'Generate with AI'}
                        </button>
                    </div>
                    <textarea
                        value={systemPrompt}
                        onChange={(e) => setSystemPrompt(e.target.value)}
                        rows={8}
                        placeholder="You are a specialized AI agent for... Focus on... Your expertise includes..."
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-mono text-sm"
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Custom instructions that will be prepended to all prompts for this agent
                    </p>
                </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-[#0d0d0d] flex items-center justify-between">
                {agent && (
                    <button
                        onClick={handleDelete}
                        className="px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                    >
                        Delete Agent
                    </button>
                )}
                <div className="flex gap-3 ml-auto">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm border border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isSaving || !name || (executionType === 'api' && (!model || !apiKey))}
                        className="px-4 py-2 text-sm bg-purple-600 dark:bg-purple-500 text-white rounded-lg hover:bg-purple-700 dark:hover:bg-purple-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isSaving ? 'Saving...' : 'Save Agent'}
                    </button>
                </div>
            </div>
        </div>
    );
}
