'use client'

import { useState } from 'react';
import { ConversationalSkillEditor } from '@/components/ConversationalSkillEditor';
import type { Skill } from '@/lib/schemas';

interface SkillsClientProps {
    skills: Skill[];
}

export function SkillsClient({ skills }: SkillsClientProps) {
    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const [selectedSkill, setSelectedSkill] = useState<Skill | undefined>();

    function handleNewSkill() {
        setSelectedSkill(undefined);
        setIsEditorOpen(true);
    }

    function handleEditSkill(skill: Skill) {
        setSelectedSkill(skill);
        setIsEditorOpen(true);
    }

    return (
        <>
            <ConversationalSkillEditor
                isOpen={isEditorOpen}
                onClose={() => setIsEditorOpen(false)}
                skill={selectedSkill}
            />

            {/* Header */}
            <div className="border-b border-gray-200/50 dark:border-gray-800/50 bg-white/80 dark:bg-[#0d0d0d]/80 backdrop-blur-md relative z-10">
                <div className="max-w-6xl mx-auto px-8 py-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-1">
                                Skills
                            </h1>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                Reusable AI skill definitions for your agents
                            </p>
                        </div>
                        <button
                            onClick={handleNewSkill}
                            className="px-4 py-2 bg-purple-600 dark:bg-purple-500 text-white text-sm font-medium rounded-lg hover:bg-purple-700 dark:hover:bg-purple-600 transition-colors flex items-center gap-2"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            New Skill
                        </button>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="max-w-6xl mx-auto px-8 py-8 relative z-10">
                {skills.length === 0 ? (
                    <div className="text-center py-12">
                        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-purple-100/80 dark:bg-purple-900/30 backdrop-blur-sm flex items-center justify-center">
                            <svg className="w-8 h-8 text-purple-600 dark:text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                            </svg>
                        </div>
                        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                            No skills yet
                        </h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                            Create your first skill to enhance your AI agents
                        </p>
                        <button
                            onClick={handleNewSkill}
                            className="px-4 py-2 bg-purple-600 dark:bg-purple-500 text-white text-sm font-medium rounded-lg hover:bg-purple-700 dark:hover:bg-purple-600 transition-colors"
                        >
                            Create Skill
                        </button>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 gap-6">
                        {skills.map((skill) => (
                            <div
                                key={skill.id}
                                onClick={() => handleEditSkill(skill)}
                                className="p-6 bg-white/70 dark:bg-[#1a1a1a]/70 backdrop-blur-xl border border-gray-200/50 dark:border-gray-800/50 rounded-xl hover:border-purple-300/50 dark:hover:border-purple-700/50 hover:shadow-lg transition-all duration-200 cursor-pointer group"
                            >
                                <div className="flex items-start gap-4 mb-4">
                                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-400 to-blue-600 flex items-center justify-center flex-shrink-0 shadow-lg">
                                        <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                                        </svg>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1 group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                                            {skill.name}
                                        </h3>
                                        {skill.description && (
                                            <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2">
                                                {skill.description}
                                            </p>
                                        )}
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    {/* Metadata badges */}
                                    <div className="flex flex-wrap items-center gap-2">
                                        {skill.license && (
                                            <span className="px-2.5 py-1 bg-blue-100/80 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full text-xs font-medium">
                                                {skill.license}
                                            </span>
                                        )}
                                        {skill.version && (
                                            <span className="px-2.5 py-1 bg-gray-100/80 dark:bg-gray-800/50 text-gray-700 dark:text-gray-300 rounded-full text-xs font-medium">
                                                v{skill.version}
                                            </span>
                                        )}
                                        {skill.compatibility?.agents && skill.compatibility.agents.length > 0 && (
                                            <span className="px-2.5 py-1 bg-purple-100/80 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-full text-xs font-medium">
                                                {skill.compatibility.agents.length} agent{skill.compatibility.agents.length !== 1 ? 's' : ''}
                                            </span>
                                        )}
                                    </div>

                                    {/* Footer */}
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
            </div>
        </>
    );
}
