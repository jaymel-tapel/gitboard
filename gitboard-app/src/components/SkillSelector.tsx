'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { Skill } from '@/lib/schemas';

interface SkillSelectorProps {
    selectedSkills: string[];
    onSelectionChange: (skills: string[]) => void;
    className?: string;
    maxHeight?: string;
}

/**
 * SkillSelector - A component for browsing and selecting skills for context
 * Similar pattern to DocsPageSelector for consistency
 */
export default function SkillSelector({
    selectedSkills,
    onSelectionChange,
    className = '',
    maxHeight = 'max-h-96',
}: SkillSelectorProps) {
    const [skills, setSkills] = useState<Skill[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Fetch skills on mount
    useEffect(() => {
        fetch('/api/skills')
            .then(res => res.json())
            .then(data => {
                setSkills(data.skills || []);
                setLoading(false);
            })
            .catch(err => {
                console.error('Failed to fetch skills:', err);
                setError('Failed to load skills');
                setLoading(false);
            });
    }, []);

    // Toggle individual skill selection
    const toggleSkill = useCallback((skillId: string) => {
        const isSelected = selectedSkills.includes(skillId);
        if (isSelected) {
            onSelectionChange(selectedSkills.filter(id => id !== skillId));
        } else {
            onSelectionChange([...selectedSkills, skillId]);
        }
    }, [selectedSkills, onSelectionChange]);

    // Filter skills based on search query
    const filteredSkills = useMemo(() => {
        return skills.filter(skill =>
            skill.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (skill.description?.toLowerCase().includes(searchQuery.toLowerCase()))
        );
    }, [skills, searchQuery]);

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
                placeholder="Search skills..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-[#0d0d0d] border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 mb-2 flex-shrink-0"
            />
            <div className="flex-1 overflow-y-auto p-2 bg-white dark:bg-[#0d0d0d] border border-gray-200 dark:border-gray-700 rounded-lg min-h-0 scrollbar-thin">
                {skills.length === 0 ? (
                    <div className="text-center py-6">
                        <svg className="w-10 h-10 mx-auto mb-2 text-gray-400 dark:text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                        </svg>
                        <p className="text-xs text-gray-500">No skills yet</p>
                        <a
                            href="/skills"
                            className="text-xs text-purple-600 dark:text-purple-400 hover:text-purple-500 dark:hover:text-purple-300 mt-1 inline-block"
                        >
                            Create your first skill
                        </a>
                    </div>
                ) : filteredSkills.length === 0 ? (
                    <p className="text-xs text-gray-500 text-center py-2">No matching skills found</p>
                ) : (
                    <div className="space-y-1">
                        {filteredSkills.map((skill) => {
                            const isSelected = selectedSkills.includes(skill.id);
                            return (
                                <label
                                    key={skill.id}
                                    className={`flex items-start gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                                        isSelected
                                            ? 'bg-purple-50 dark:bg-purple-500/10 border border-purple-300 dark:border-purple-500/50'
                                            : 'hover:bg-gray-100 dark:hover:bg-gray-800 border border-transparent'
                                    }`}
                                >
                                    <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={() => toggleSkill(skill.id)}
                                        className="mt-1 w-4 h-4 rounded border-gray-400 dark:border-gray-600 bg-gray-100 dark:bg-gray-800 text-purple-600 focus:ring-purple-500 focus:ring-offset-0"
                                    />
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{skill.name}</span>
                                            {skill.version && (
                                                <span className="text-xs text-gray-500">v{skill.version}</span>
                                            )}
                                        </div>
                                        {skill.description && (
                                            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{skill.description}</p>
                                        )}
                                        {/* Compatibility badges */}
                                        {(skill.compatibility?.agents?.length > 0 || skill.compatibility?.providers?.length > 0) && (
                                            <div className="flex flex-wrap gap-1 mt-1.5">
                                                {skill.compatibility?.agents?.map((agent) => (
                                                    <span
                                                        key={agent}
                                                        className="px-1.5 py-0.5 text-[10px] bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 rounded"
                                                    >
                                                        {agent}
                                                    </span>
                                                ))}
                                                {skill.compatibility?.providers?.map((provider) => (
                                                    <span
                                                        key={provider}
                                                        className="px-1.5 py-0.5 text-[10px] bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded"
                                                    >
                                                        {provider}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </label>
                            );
                        })}
                    </div>
                )}
            </div>
            {selectedSkills.length > 0 && (
                <p className="text-xs text-purple-600 dark:text-purple-400 mt-2 flex-shrink-0">
                    {selectedSkills.length} skill{selectedSkills.length !== 1 ? 's' : ''} selected
                </p>
            )}
        </div>
    );
}
