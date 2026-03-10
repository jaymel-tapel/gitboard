'use client'

import { useState } from 'react';
import { removeTeamMember, updateTeamMember } from '@/app/actions';
import type { TeamMember } from '@/lib/schemas';

interface EditTeamMemberModalProps {
    member: TeamMember;
    isOpen: boolean;
    onClose: () => void;
}

export function EditTeamMemberModal({ member, isOpen, onClose }: EditTeamMemberModalProps) {
    const [isDeleting, setIsDeleting] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setIsSubmitting(true);

        const formData = new FormData(e.currentTarget);
        await updateTeamMember(member.id, formData);

        setIsSubmitting(false);
        setIsEditing(false);
        window.location.reload();
    }

    async function handleDelete() {
        if (!confirm(`Remove ${member.name} from the team?`)) return;

        setIsDeleting(true);
        await removeTeamMember(member.id);
        setIsDeleting(false);
        onClose();
        window.location.reload();
    }

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
            <div className="bg-white dark:bg-[#1a1a1a] rounded-lg p-6 w-full max-w-lg border border-gray-200 dark:border-gray-800" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                            {isEditing ? 'Edit Team Member' : 'Team Member'}
                        </h2>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{member.id}</p>
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

                {isEditing ? (
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Name
                            </label>
                            <div className="text-sm text-gray-500 dark:text-gray-400">
                                {member.name} (cannot be changed)
                            </div>
                        </div>

                        <div>
                            <label htmlFor="roleTitle" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Role Title
                            </label>
                            <input
                                type="text"
                                id="roleTitle"
                                name="roleTitle"
                                required
                                defaultValue={member.role.title}
                                className="w-full px-3 py-2 border border-gray-200 dark:border-gray-800 rounded-lg bg-white dark:bg-[#0d0d0d] text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-400 dark:focus:ring-gray-600"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label htmlFor="roleLevel" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Level
                                </label>
                                <select
                                    id="roleLevel"
                                    name="roleLevel"
                                    defaultValue={member.role.level}
                                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-800 rounded-lg bg-white dark:bg-[#0d0d0d] text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-400 dark:focus:ring-gray-600"
                                >
                                    <option value="junior">Junior</option>
                                    <option value="mid">Mid</option>
                                    <option value="senior">Senior</option>
                                    <option value="staff">Staff</option>
                                    <option value="principal">Principal</option>
                                    <option value="assistant">Assistant</option>
                                </select>
                            </div>

                            <div>
                                <label htmlFor="wipLimit" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    WIP Limit
                                </label>
                                <input
                                    type="number"
                                    id="wipLimit"
                                    name="wipLimit"
                                    required
                                    min={1}
                                    defaultValue={member.capabilities.wip_limit}
                                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-800 rounded-lg bg-white dark:bg-[#0d0d0d] text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-400 dark:focus:ring-gray-600"
                                />
                            </div>
                        </div>

                        {member.type === 'ai_agent' && (
                            <div>
                                <label htmlFor="cliProfile" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Claude CLI Profile
                                </label>
                                <input
                                    type="text"
                                    id="cliProfile"
                                    name="cliProfile"
                                    defaultValue={member.ai_config?.cli_profile || ''}
                                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-800 rounded-lg bg-white dark:bg-[#0d0d0d] text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-400 dark:focus:ring-gray-600"
                                    placeholder={member.id}
                                />
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                    Run <code className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded">claude auth --profile {member.id}</code> to create
                                </p>
                            </div>
                        )}

                        <div className="flex gap-3 pt-4">
                            <button
                                type="button"
                                onClick={() => setIsEditing(false)}
                                className="flex-1 px-4 py-2 border border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className="flex-1 px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
                            >
                                {isSubmitting ? 'Saving...' : 'Save Changes'}
                            </button>
                        </div>
                    </form>
                ) : (
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Name
                            </label>
                            <div className="text-sm text-gray-900 dark:text-gray-100">
                                {member.name}
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Type
                                </label>
                                <div className="text-sm text-gray-900 dark:text-gray-100">
                                    {member.type === 'ai_agent' ? 'AI Agent' : 'Human'}
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    WIP Limit
                                </label>
                                <div className="text-sm text-gray-900 dark:text-gray-100">
                                    {member.capabilities.wip_limit}
                                </div>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Role
                            </label>
                            <div className="text-sm text-gray-900 dark:text-gray-100">
                                {member.role.title} ({member.role.level})
                            </div>
                        </div>

                        {member.type === 'ai_agent' && member.ai_config?.cli_profile && (
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Claude CLI Profile
                                </label>
                                <div className="text-sm text-gray-900 dark:text-gray-100 font-mono">
                                    {member.ai_config.cli_profile}
                                </div>
                            </div>
                        )}

                        <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-800">
                            <button
                                onClick={handleDelete}
                                disabled={isDeleting}
                                className="px-4 py-2 text-red-600 dark:text-red-400 text-sm font-medium hover:bg-red-50 dark:hover:bg-red-900/10 rounded-lg transition-colors disabled:opacity-50"
                            >
                                {isDeleting ? 'Removing...' : 'Remove'}
                            </button>
                            <div className="flex-1" />
                            <button
                                onClick={() => setIsEditing(true)}
                                className="px-4 py-2 border border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors"
                            >
                                Edit
                            </button>
                            <button
                                onClick={onClose}
                                className="px-4 py-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-sm font-medium rounded-lg hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
