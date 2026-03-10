'use client'

import { useState } from 'react';
import { EditTeamMemberModal } from './EditTeamMemberModal';
import type { TeamMember } from '@/lib/schemas';

interface TeamMemberCardProps {
    member: TeamMember;
}

export function TeamMemberCard({ member }: TeamMemberCardProps) {
    const [isEditOpen, setIsEditOpen] = useState(false);

    return (
        <>
            <div
                onClick={() => setIsEditOpen(true)}
                className="p-5 bg-white/70 dark:bg-[#1a1a1a]/70 backdrop-blur-xl border border-gray-200/50 dark:border-gray-800/50 rounded-xl hover:border-purple-300/50 dark:hover:border-purple-700/50 hover:shadow-lg transition-all duration-200 cursor-pointer group"
            >
                <div className="flex items-start gap-3 mb-4">
                    {member.type === 'ai_agent' ? (
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-400 to-purple-600 flex items-center justify-center shadow-lg">
                            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                            </svg>
                        </div>
                    ) : (
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-400 to-gray-600 flex items-center justify-center text-white font-medium shadow-lg">
                            {member.name.substring(0, 2).toUpperCase()}
                        </div>
                    )}
                    <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                            {member.name}
                        </h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                            {member.role.title}
                        </p>
                    </div>
                </div>
                <div className="space-y-2 pt-3 border-t border-gray-200/50 dark:border-gray-800/50">
                    <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-500 dark:text-gray-400">Status</span>
                        <span className="px-2 py-0.5 bg-green-100/80 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-full font-medium">
                            {member.availability.status}
                        </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-500 dark:text-gray-400">WIP Limit</span>
                        <span className="text-gray-900 dark:text-gray-100 font-medium">
                            {member.capabilities.wip_limit}
                        </span>
                    </div>
                </div>
            </div>

            <EditTeamMemberModal
                member={member}
                isOpen={isEditOpen}
                onClose={() => setIsEditOpen(false)}
            />
        </>
    );
}
