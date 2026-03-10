'use client'

import { useState, useEffect } from 'react';
import { saveSkill, deleteSkill } from '@/app/actions';
import type { Skill } from '@/lib/schemas';

interface EditSkillPanelProps {
    isOpen: boolean;
    onClose: () => void;
    skill?: Skill;
}

export function EditSkillPanel({ isOpen, onClose, skill }: EditSkillPanelProps) {
    const [name, setName] = useState(skill?.name || '');
    const [description, setDescription] = useState(skill?.description || '');
    const [license, setLicense] = useState(skill?.license || '');
    const [version, setVersion] = useState(skill?.version || '');
    const [agents, setAgents] = useState<string[]>(skill?.compatibility?.agents || []);
    const [providers, setProviders] = useState<string[]>(skill?.compatibility?.providers || []);
    const [instructions, setInstructions] = useState(skill?.instructions || '');
    const [isSaving, setIsSaving] = useState(false);
    const [agentInput, setAgentInput] = useState('');
    const [providerInput, setProviderInput] = useState('');

    useEffect(() => {
        if (skill) {
            setName(skill.name);
            setDescription(skill.description || '');
            setLicense(skill.license || '');
            setVersion(skill.version || '');
            setAgents(skill.compatibility?.agents || []);
            setProviders(skill.compatibility?.providers || []);
            setInstructions(skill.instructions || '');
        } else {
            // Reset for new skill
            setName('');
            setDescription('');
            setLicense('');
            setVersion('');
            setAgents([]);
            setProviders([]);
            setInstructions('');
        }
        setAgentInput('');
        setProviderInput('');
    }, [skill, isOpen]);

    async function handleSave() {
        setIsSaving(true);
        try {
            const skillData: Partial<Skill> & { id: string; name: string } = {
                id: skill?.id || name.toLowerCase().replace(/\s+/g, '-'),
                name,
                description: description || undefined,
                license: license || undefined,
                version: version || undefined,
                compatibility: (agents.length > 0 || providers.length > 0)
                    ? { agents, providers }
                    : undefined,
                instructions,
            };

            await saveSkill(skillData);
            onClose();
            window.location.reload();
        } catch (error) {
            console.error('Failed to save skill:', error);
            alert('Failed to save skill. Please try again.');
        } finally {
            setIsSaving(false);
        }
    }

    async function handleDelete() {
        if (!skill) return;
        if (!confirm(`Delete skill "${skill.name}"? This cannot be undone.`)) return;

        try {
            await deleteSkill(skill.id);
            onClose();
            window.location.reload();
        } catch (error) {
            console.error('Failed to delete skill:', error);
            alert('Failed to delete skill. Please try again.');
        }
    }

    function addAgent() {
        if (agentInput.trim() && !agents.includes(agentInput.trim())) {
            setAgents([...agents, agentInput.trim()]);
            setAgentInput('');
        }
    }

    function removeAgent(agent: string) {
        setAgents(agents.filter(a => a !== agent));
    }

    function addProvider() {
        if (providerInput.trim() && !providers.includes(providerInput.trim())) {
            setProviders([...providers, providerInput.trim()]);
            setProviderInput('');
        }
    }

    function removeProvider(provider: string) {
        setProviders(providers.filter(p => p !== provider));
    }

    if (!isOpen) return null;

    return (
        <div className="fixed inset-y-0 right-0 w-[700px] bg-white dark:bg-[#0d0d0d] border-l border-gray-200 dark:border-gray-800 shadow-2xl z-50 flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
                <div>
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        {skill ? 'Edit Skill' : 'New Skill'}
                    </h2>
                    {skill && <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{skill.id}</p>}
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
                        Skill Name
                    </label>
                    <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g., Code Review, Documentation Writer"
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
                        placeholder="Brief description of what this skill does"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                    />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            License (Optional)
                        </label>
                        <input
                            type="text"
                            value={license}
                            onChange={(e) => setLicense(e.target.value)}
                            placeholder="e.g., MIT, Apache-2.0"
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Version (Optional)
                        </label>
                        <input
                            type="text"
                            value={version}
                            onChange={(e) => setVersion(e.target.value)}
                            placeholder="e.g., 1.0.0"
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                        />
                    </div>
                </div>

                {/* Compatibility */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Compatible Agents (Optional)
                    </label>
                    <div className="flex gap-2 mb-2">
                        <input
                            type="text"
                            value={agentInput}
                            onChange={(e) => setAgentInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addAgent())}
                            placeholder="e.g., claude-code, cursor"
                            className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                        />
                        <button
                            onClick={addAgent}
                            className="px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                        >
                            Add
                        </button>
                    </div>
                    {agents.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                            {agents.map((agent) => (
                                <span
                                    key={agent}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-full text-sm"
                                >
                                    {agent}
                                    <button
                                        onClick={() => removeAgent(agent)}
                                        className="ml-1 hover:text-purple-900 dark:hover:text-purple-100"
                                    >
                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </span>
                            ))}
                        </div>
                    )}
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Compatible Providers (Optional)
                    </label>
                    <div className="flex gap-2 mb-2">
                        <input
                            type="text"
                            value={providerInput}
                            onChange={(e) => setProviderInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addProvider())}
                            placeholder="e.g., anthropic, openai"
                            className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                        />
                        <button
                            onClick={addProvider}
                            className="px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                        >
                            Add
                        </button>
                    </div>
                    {providers.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                            {providers.map((provider) => (
                                <span
                                    key={provider}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full text-sm"
                                >
                                    {provider}
                                    <button
                                        onClick={() => removeProvider(provider)}
                                        className="ml-1 hover:text-blue-900 dark:hover:text-blue-100"
                                    >
                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </span>
                            ))}
                        </div>
                    )}
                </div>

                {/* Instructions */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Instructions (Markdown)
                    </label>
                    <textarea
                        value={instructions}
                        onChange={(e) => setInstructions(e.target.value)}
                        rows={12}
                        placeholder="# Skill Instructions

Write the instructions for this skill in Markdown format.

## When to Use
- Describe when the agent should apply this skill

## How It Works
- Step-by-step instructions for the agent

## Examples
- Provide examples of how the skill should behave"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-mono text-sm"
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        The instructions will be included in the agent context when this skill is selected
                    </p>
                </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-[#0d0d0d] flex items-center justify-between">
                {skill && (
                    <button
                        onClick={handleDelete}
                        className="px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                    >
                        Delete Skill
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
                        disabled={isSaving || !name}
                        className="px-4 py-2 text-sm bg-purple-600 dark:bg-purple-500 text-white rounded-lg hover:bg-purple-700 dark:hover:bg-purple-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isSaving ? 'Saving...' : 'Save Skill'}
                    </button>
                </div>
            </div>
        </div>
    );
}
