'use client'

import { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { addTeamMemberFromForm } from '@/app/actions';

const AI_PRESETS = {
    backend: {
        title: 'Backend Engineer',
        level: 'senior',
        areas: ['backend', 'api', 'database', 'testing'],
        skills: ['typescript', 'node.js', 'postgresql', 'rest-api'],
    },
    frontend: {
        title: 'Frontend Engineer',
        level: 'senior',
        areas: ['frontend', 'ui', 'ux', 'design'],
        skills: ['react', 'typescript', 'tailwind', 'next.js'],
    },
    qa: {
        title: 'QA Engineer',
        level: 'senior',
        areas: ['testing', 'qa', 'automation', 'ci-cd'],
        skills: ['playwright', 'vitest', 'testing', 'automation'],
    },
    fullstack: {
        title: 'Full-Stack Engineer',
        level: 'senior',
        areas: ['backend', 'frontend', 'architecture', 'devops'],
        skills: ['typescript', 'react', 'node.js', 'docker'],
    },
    devops: {
        title: 'DevOps Engineer',
        level: 'senior',
        areas: ['devops', 'infrastructure', 'ci-cd', 'monitoring'],
        skills: ['docker', 'kubernetes', 'terraform', 'github-actions'],
    },
};

export function AddTeamMemberButton() {
    const [isOpen, setIsOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [memberType, setMemberType] = useState<'human' | 'ai_agent'>('human');
    const [aiPreset, setAiPreset] = useState<keyof typeof AI_PRESETS>('backend');
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setIsSubmitting(true);

        const formData = new FormData(e.currentTarget);
        await addTeamMemberFromForm(formData);

        setIsSubmitting(false);
        setIsOpen(false);
        window.location.reload();
    }

    function handlePresetChange(preset: keyof typeof AI_PRESETS) {
        setAiPreset(preset);
        const presetData = AI_PRESETS[preset];

        // Update form fields
        const form = document.querySelector('form') as HTMLFormElement;
        if (form) {
            (form.elements.namedItem('roleTitle') as HTMLInputElement).value = presetData.title;
            (form.elements.namedItem('roleLevel') as HTMLSelectElement).value = presetData.level;
        }
    }

    const panelContent = mounted ? (
        <>
            {/* Overlay */}
            {isOpen && ReactDOM.createPortal(
                <div
                    className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[100]"
                    onClick={() => setIsOpen(false)}
                />,
                document.body
            )}

            {/* Panel */}
            {ReactDOM.createPortal(
                <div className={`fixed top-0 right-0 h-screen w-[500px] bg-white/70 dark:bg-[#0d0d0d]/70 backdrop-blur-xl border-l border-gray-200/50 dark:border-gray-700/50 z-[110] flex flex-col transform transition-all duration-300 ease-in-out ${isOpen ? 'translate-x-0 shadow-2xl' : 'translate-x-full shadow-none'}`}>
                    {/* Header */}
                    <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200/50 dark:border-gray-700/50">
                        <div>
                            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Add Team Member</h2>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Add a human or AI agent to your team</p>
                        </div>
                        <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-gray-600">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    {/* Content */}
                    <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6" key={isOpen ? 'open' : 'closed'}>
                        {/* Member Type Selection */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Member Type</label>
                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    type="button"
                                    onClick={() => setMemberType('human')}
                                    className={`px-4 py-3 rounded-lg border-2 transition-all ${memberType === 'human'
                                        ? 'border-purple-600 bg-purple-50 dark:bg-purple-900/20'
                                        : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700'
                                        }`}
                                >
                                    <div className="flex items-center gap-2">
                                        <svg className="w-5 h-5 text-gray-600 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                        </svg>
                                        <div className="text-left">
                                            <div className="text-sm font-medium text-gray-900 dark:text-gray-100">Human</div>
                                            <div className="text-xs text-gray-500 dark:text-gray-400">Team member</div>
                                        </div>
                                    </div>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setMemberType('ai_agent')}
                                    className={`px-4 py-3 rounded-lg border-2 transition-all ${memberType === 'ai_agent'
                                        ? 'border-purple-600 bg-purple-50 dark:bg-purple-900/20'
                                        : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700'
                                        }`}
                                >
                                    <div className="flex items-center gap-2">
                                        <svg className="w-5 h-5 text-purple-600 dark:text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                        </svg>
                                        <div className="text-left">
                                            <div className="text-sm font-medium text-gray-900 dark:text-gray-100">AI Agent</div>
                                            <div className="text-xs text-gray-500 dark:text-gray-400">Claude-powered</div>
                                        </div>
                                    </div>
                                </button>
                            </div>
                            <input type="hidden" name="type" value={memberType} />
                        </div>

                        {/* Name */}
                        <div>
                            <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Name
                            </label>
                            <input
                                type="text"
                                id="name"
                                name="name"
                                required
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                                placeholder={memberType === 'ai_agent' ? 'Backend Specialist' : 'John Doe'}
                            />
                        </div>

                        {/* AI Presets */}
                        {memberType === 'ai_agent' && (
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    AI Specialization Preset
                                </label>
                                <div className="grid grid-cols-2 gap-2">
                                    {Object.entries(AI_PRESETS).map(([key, preset]) => (
                                        <button
                                            key={key}
                                            type="button"
                                            onClick={() => handlePresetChange(key as keyof typeof AI_PRESETS)}
                                            className={`px-3 py-2 text-sm rounded-lg border transition-colors ${aiPreset === key
                                                ? 'bg-purple-600 text-white border-purple-600'
                                                : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-700 hover:border-purple-400'
                                                }`}
                                        >
                                            {preset.title}
                                        </button>
                                    ))}
                                </div>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                                    Presets auto-fill role and skills. You can customize after.
                                </p>
                            </div>
                        )}

                        {/* Role Title */}
                        <div>
                            <label htmlFor="roleTitle" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Role Title
                            </label>
                            <input
                                type="text"
                                id="roleTitle"
                                name="roleTitle"
                                required
                                defaultValue={memberType === 'ai_agent' ? AI_PRESETS[aiPreset].title : ''}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                                placeholder="Software Engineer"
                            />
                        </div>

                        {/* Level and WIP Limit */}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label htmlFor="roleLevel" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Level
                                </label>
                                <select
                                    id="roleLevel"
                                    name="roleLevel"
                                    defaultValue={memberType === 'ai_agent' ? 'senior' : 'mid'}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                                >
                                    <option value="junior">Junior</option>
                                    <option value="mid">Mid</option>
                                    <option value="senior">Senior</option>
                                    <option value="staff">Staff</option>
                                    <option value="principal">Principal</option>
                                    {memberType === 'ai_agent' && <option value="assistant">Assistant</option>}
                                </select>
                            </div>

                            <div>
                                <label htmlFor="wipLimit" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    WIP Limit
                                </label>
                                <input
                                    type="number"
                                    id="wipLimit"
                                    name="wipLimit"
                                    defaultValue={memberType === 'ai_agent' ? 5 : 3}
                                    min={1}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                                />
                            </div>
                        </div>

                        {/* Claude CLI Profile (AI only) */}
                        {memberType === 'ai_agent' && (
                            <div>
                                <label htmlFor="cliProfile" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Claude CLI Profile
                                </label>
                                <input
                                    type="text"
                                    id="cliProfile"
                                    name="cliProfile"
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                                    placeholder="ai-backend (leave empty to use member ID)"
                                />
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                    Run <code className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded">claude auth --profile ai-backend</code> to create
                                </p>
                            </div>
                        )}

                        {/* Submit */}
                        <div className="flex gap-3 pt-4">
                            <button
                                type="button"
                                onClick={() => setIsOpen(false)}
                                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-900"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
                            >
                                {isSubmitting ? 'Adding...' : 'Add Member'}
                            </button>
                        </div>
                    </form>
                </div>,
                document.body
            )}
        </>
    ) : null;

    return (
        <>
            <button
                onClick={() => setIsOpen(true)}
                className="px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-2"
            >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Member
            </button>
            {panelContent}
        </>
    );
}
