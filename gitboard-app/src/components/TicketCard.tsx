'use client'

import { useState, useEffect } from 'react';
import type { TicketWithStatus, TeamMember } from '@/lib/schemas';
import { TicketEditor } from './TicketEditor';
import { AgentLauncher } from './AgentLauncher';
import { useBoardState } from '@/context/BoardStateContext';

interface TicketCardProps {
    ticket: TicketWithStatus;
    status: string;
    ownerName?: string;
    teamMembers?: TeamMember[];
}

export function TicketCard({ ticket, status, ownerName, teamMembers = [] }: TicketCardProps) {
    const { isTerminalOpen, openTerminal, closeTerminal } = useBoardState();
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [hasActiveSession, setHasActiveSession] = useState(false);
    const [sessionStatus, setSessionStatus] = useState<'running' | 'waiting' | 'paused' | 'error'>('running');

    // Check if the terminal is open for this ticket via centralized state
    const showAIPanel = isTerminalOpen(ticket.id);

    const priorityColors = {
        critical: 'bg-red-500',
        high: 'bg-orange-500',
        medium: 'bg-yellow-500',
        low: 'bg-gray-400',
    };

    function handleDragStart(e: React.DragEvent) {
        setIsDragging(true);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('ticketId', ticket.id);
        e.dataTransfer.setData('fromStatus', status);
    }

    function handleDragEnd() {
        setIsDragging(false);
    }

    function handleClick(e: React.MouseEvent) {
        if (isDragging || (e.target as HTMLElement).closest('.ai-execute-btn')) return;
        setIsEditOpen(true);
    }

    const isAIOwner = ticket.owner?.startsWith('ai-') || ownerName?.includes('(AI)') || ownerName?.toLowerCase().includes('claude');

    useEffect(() => {
        const checkSession = async () => {
            try {
                const res = await fetch('/api/active-sessions-internal');
                const data = await res.json();
                const session = data.activeSessions?.find((s: any) => s.ticketId === ticket.id);
                setHasActiveSession(!!session);
                if (session?.status) {
                    setSessionStatus(session.status);
                }
            } catch (err) {
                // Ignore errors
            }
        };

        checkSession();
        const interval = setInterval(checkSession, 2000);
        return () => clearInterval(interval);
    }, [ticket.id]);

    return (
        <>
            <TicketEditor
                isOpen={isEditOpen}
                onClose={() => setIsEditOpen(false)}
                ticket={ticket}
                teamMembers={teamMembers}
            />
            {showAIPanel && (
                <AgentLauncher
                    ticketId={ticket.id}
                    onClose={() => closeTerminal()}
                />
            )}

            <div
                draggable
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onClick={handleClick}
                className={`group p-4 rounded-lg border border-gray-200/50 dark:border-gray-700/50 bg-white/70 dark:bg-[#1a1a1a]/70 backdrop-blur-md hover:border-gray-300/60 dark:hover:border-gray-600/60 hover:shadow-lg transition-all cursor-grab active:cursor-grabbing ${isDragging ? 'opacity-50' : ''
                    }`}
            >
                {/* Header: ID and Priority */}
                <div className="flex items-center gap-2 mb-3">
                    <span className="text-xs font-mono text-gray-400 dark:text-gray-600">
                        {ticket.id}
                    </span>
                    <div className={`w-1.5 h-1.5 rounded-full ${priorityColors[ticket.priority]}`} title={ticket.priority} />
                </div>

                {/* Title */}
                <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3 line-clamp-2 leading-relaxed">
                    {ticket.title}
                </h3>

                {/* Tags */}
                {ticket.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-3">
                        {ticket.tags.slice(0, 3).map((tag) => (
                            <span
                                key={tag}
                                className="text-xs px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
                            >
                                {tag}
                            </span>
                        ))}
                        {ticket.tags.length > 3 && (
                            <span className="text-xs px-2 py-0.5 text-gray-400 dark:text-gray-600">
                                +{ticket.tags.length - 3}
                            </span>
                        )}
                    </div>
                )}

                {/* Footer: Owner and AI Button */}
                <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-800">
                    {/* Owner */}
                    <div className="flex items-center gap-2">
                        {ownerName ? (
                            <>
                                <div className={`w-5 h-5 rounded-full ${isAIOwner ? 'bg-gradient-to-br from-purple-400 to-purple-600' : 'bg-gradient-to-br from-gray-400 to-gray-600'} flex items-center justify-center text-white text-[10px] font-medium`}>
                                    {isAIOwner ? (
                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                        </svg>
                                    ) : (
                                        ownerName.substring(0, 2).toUpperCase()
                                    )}
                                </div>
                                <span className="text-xs text-gray-600 dark:text-gray-400">
                                    {ownerName}
                                </span>
                            </>
                        ) : (
                            <span className="text-xs text-gray-400 dark:text-gray-600">
                                Unassigned
                            </span>
                        )}
                    </div>

                    {/* AI Run Button */}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            openTerminal(ticket.id);
                        }}
                        className={`ai-execute-btn flex items-center gap-1.5 px-2 py-1 rounded-md transition-colors group/btn ${hasActiveSession
                            ? sessionStatus === 'waiting'
                                ? 'border-2 border-yellow-500 dark:border-yellow-400 text-yellow-600 dark:text-yellow-400 hover:bg-yellow-500 dark:hover:bg-yellow-400 hover:text-white'
                                : sessionStatus === 'paused'
                                    ? 'border-2 border-gray-400 dark:border-gray-500 text-gray-500 dark:text-gray-400 hover:bg-gray-400 dark:hover:bg-gray-500 hover:text-white'
                                    : sessionStatus === 'error'
                                        ? 'border-2 border-red-500 dark:border-red-400 text-red-600 dark:text-red-400 hover:bg-red-500 dark:hover:bg-red-400 hover:text-white'
                                        : 'border-2 border-green-600 dark:border-green-500 text-green-600 dark:text-green-500 hover:bg-green-600 dark:hover:bg-green-500 hover:text-white'
                            : 'border border-purple-600 dark:border-purple-500 text-purple-600 dark:text-purple-500 hover:bg-purple-600 dark:hover:bg-purple-500 hover:text-white'
                            }`}
                        title={hasActiveSession
                            ? sessionStatus === 'waiting'
                                ? 'AI is waiting for input'
                                : sessionStatus === 'paused'
                                    ? 'AI has finished and is paused'
                                    : sessionStatus === 'error'
                                        ? 'AI encountered an error'
                                        : 'AI is running on this ticket'
                            : 'Run AI on this ticket'}
                    >
                        {hasActiveSession ? (
                            sessionStatus === 'waiting' ? (
                                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                                </svg>
                            ) : sessionStatus === 'paused' ? (
                                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                                </svg>
                            ) : sessionStatus === 'error' ? (
                                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
                                </svg>
                            ) : (
                                <span className="flex h-3.5 w-3.5 items-center justify-center">
                                    <span className="animate-ping absolute inline-flex h-3 w-3 rounded-full bg-green-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                                </span>
                            )
                        ) : (
                            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M8 5v14l11-7z" />
                            </svg>
                        )}
                        <span className="text-xs font-medium">AI</span>
                    </button>
                </div>
            </div>
        </>
    );
}
