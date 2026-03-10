import type { Metadata } from 'next';
import { getTeam, getConfig } from '../actions';
import { AddTeamMemberButton } from '@/components/AddTeamMemberButton';
import { TeamMemberCard } from '@/components/TeamMemberCard';
import { formatPageTitle } from '@/lib/title-utils';

// Force dynamic rendering since we read from filesystem
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
    const config = await getConfig();
    return {
        title: formatPageTitle('Team', config.project.name),
    };
}

export default async function TeamPage() {
    const team = await getTeam();

    const humans = team.team.filter((m) => m.type === 'human');
    const aiAgents = team.team.filter((m) => m.type === 'ai_agent');

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 via-purple-50/30 to-blue-50/20 dark:from-[#0a0a0a] dark:via-purple-950/10 dark:to-blue-950/5 relative">
            {/* Gradient waves background */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-1/2 -left-1/4 w-96 h-96 bg-purple-400/10 dark:bg-purple-600/5 rounded-full blur-3xl"></div>
                <div className="absolute top-1/4 -right-1/4 w-[500px] h-[500px] bg-blue-400/10 dark:bg-blue-600/5 rounded-full blur-3xl"></div>
                <div className="absolute -bottom-1/4 left-1/3 w-[600px] h-[600px] bg-purple-300/10 dark:bg-purple-700/5 rounded-full blur-3xl"></div>
            </div>

            {/* Header */}
            <div className="border-b border-gray-200/50 dark:border-gray-800/50 bg-white/80 dark:bg-[#0d0d0d]/80 backdrop-blur-md relative z-10">
                <div className="max-w-6xl mx-auto px-8 py-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-1">
                                Team
                            </h1>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                {team.team.length} members
                            </p>
                        </div>
                        <AddTeamMemberButton />
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="max-w-6xl mx-auto px-8 py-8 relative z-10">
                {/* Team Members */}
                {humans.length > 0 && (
                    <div className="mb-12">
                        <h2 className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-4">
                            Team Members ({humans.length})
                        </h2>
                        <div className="grid grid-cols-3 gap-4">
                            {humans.map((member) => (
                                <TeamMemberCard key={member.id} member={member} />
                            ))}
                        </div>
                    </div>
                )}

                {/* AI Agents */}
                {aiAgents.length > 0 && (
                    <div>
                        <h2 className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-4">
                            AI Agents ({aiAgents.length})
                        </h2>
                        <div className="grid grid-cols-3 gap-4">
                            {aiAgents.map((member) => (
                                <TeamMemberCard key={member.id} member={member} />
                            ))}
                        </div>
                    </div>
                )}

                {team.team.length === 0 && (
                    <div className="text-center py-12">
                        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-purple-100/80 dark:bg-purple-900/30 backdrop-blur-sm flex items-center justify-center">
                            <svg className="w-8 h-8 text-purple-600 dark:text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                            </svg>
                        </div>
                        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                            No team members yet
                        </h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                            Add team members to start assigning tickets
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
