'use client'

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import type { TicketWithStatus, TeamMember, StatusConfig } from '@/lib/schemas';
import { TicketEditor } from './TicketEditor';
import { useBoardState } from '@/context/BoardStateContext';
import { PanScrollContainer } from './PanScrollContainer';
import 'xterm/css/xterm.css';

interface BoardAgentViewProps {
    statuses: StatusConfig[];
    ownerNames: Record<string, string>;
    teamMembers: TeamMember[];
}

interface ActiveSession {
    ticketId: string;
    status: 'running' | 'waiting' | 'paused' | 'error';
    startedAt?: string;
}

interface AgentTerminalCardProps {
    ticket: TicketWithStatus;
    session: ActiveSession;
    ownerName?: string;
    teamMembers: TeamMember[];
    statuses: StatusConfig[];
    onOpenTicket: (ticket: TicketWithStatus) => void;
}

// Priority colors for the indicator dot
const priorityColors: Record<string, string> = {
    critical: 'bg-red-500',
    high: 'bg-orange-500',
    medium: 'bg-yellow-500',
    low: 'bg-gray-400',
};

// Session status colors
const sessionStatusColors: Record<string, { bg: string; text: string; border: string }> = {
    running: { bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500/50' },
    waiting: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/50' },
    paused: { bg: 'bg-gray-500/20', text: 'text-gray-400', border: 'border-gray-500/50' },
    error: { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/50' },
};

// Agent Terminal Card Component
function AgentTerminalCard({ ticket, session, ownerName, teamMembers, statuses, onOpenTicket }: AgentTerminalCardProps) {
    const terminalRef = useRef<HTMLDivElement>(null);
    const xtermRef = useRef<any | null>(null);
    const fitAddonRef = useRef<any | null>(null);
    const socketRef = useRef<any | null>(null);
    const initializedRef = useRef(false);
    const [mounted, setMounted] = useState(false);

    const isAIOwner = ticket.owner?.startsWith('ai-') || ownerName?.includes('(AI)') || ownerName?.toLowerCase().includes('claude');
    const statusColors = sessionStatusColors[session.status] || sessionStatusColors.running;

    // Initialize terminal and socket connection - following AgentLauncher pattern
    useEffect(() => {
        setMounted(true);
        if (!terminalRef.current) return;

        // Prevent double initialization (React Strict Mode)
        if (initializedRef.current) return;
        initializedRef.current = true;

        let term: any;
        let fitAddon: any;
        let inputDisposable: any;

        import('xterm').then(({ Terminal }) => {
            import('xterm-addon-fit').then(({ FitAddon }) => {
                import('socket.io-client').then(({ io }) => {
                    if (!terminalRef.current) return;

                    term = new Terminal({
                        cursorBlink: true,
                        fontSize: 14,
                        fontFamily: 'Menlo, Monaco, "Courier New", monospace',
                        theme: {
                            background: '#0d0d0d',
                            foreground: '#e5e5e5',
                            cursor: '#a855f7',
                            selectionBackground: '#a855f740',
                        },
                        cols: 120,
                        rows: 24,
                    });

                    fitAddon = new FitAddon();
                    term.loadAddon(fitAddon);
                    term.open(terminalRef.current!);
                    fitAddon.fit();

                    xtermRef.current = term;
                    fitAddonRef.current = fitAddon;

                    // Connect to existing PTY session (resume mode to attach to running PTY)
                    const socket = io({
                        query: {
                            ticketId: ticket.id,
                            resume: 'true',
                        }
                    });

                    socketRef.current = socket;

                    socket.on('connect', () => {
                        term.writeln('\x1b[32m✓ Connected\x1b[0m\r\n');
                    });

                    socket.on('output', (data: string) => {
                        term.write(data);
                    });

                    socket.on('disconnect', () => {
                        term.writeln('\r\n\x1b[33m[Connection closed]\x1b[0m\r\n');
                    });

                    // Handle terminal input - send to socket
                    inputDisposable = term.onData((data: string) => {
                        socket.emit('input', data);
                    });

                    // Handle resize
                    const handleResize = () => {
                        fitAddon.fit();
                        socket.emit('resize', { cols: term.cols, rows: term.rows });
                    };
                    window.addEventListener('resize', handleResize);
                });
            });
        });

        return () => {
            if (inputDisposable) inputDisposable.dispose();
            if (socketRef.current) {
                socketRef.current.disconnect();
                socketRef.current = null;
            }
            if (xtermRef.current) {
                xtermRef.current.dispose();
                xtermRef.current = null;
            }
            fitAddonRef.current = null;
            initializedRef.current = false;
        };
    }, [ticket.id]);

    // Refit terminal when visible
    useEffect(() => {
        if (mounted && fitAddonRef.current) {
            const timer = setTimeout(() => {
                fitAddonRef.current?.fit();
            }, 200);
            return () => clearTimeout(timer);
        }
    }, [mounted]);

    return (
        <div className="flex-shrink-0 w-1/2 min-w-[700px] h-full max-h-[calc(100vh-200px)] bg-[#0d0d0d] rounded-xl border border-gray-700 overflow-hidden flex flex-col shadow-xl">
            {/* Card Header - Ticket Info */}
            <div className="px-4 py-3 bg-[#1a1a1a] border-b border-gray-700">
                {/* Top row: ID, Priority, Status */}
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-gray-400">
                            {ticket.id}
                        </span>
                        <div className={`w-2 h-2 rounded-full ${priorityColors[ticket.priority]}`} title={ticket.priority} />
                    </div>
                    {/* Session status indicator */}
                    <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${statusColors.bg} ${statusColors.text} border ${statusColors.border}`}>
                        {session.status === 'running' && (
                            <span className="flex h-2 w-2 items-center justify-center">
                                <span className="animate-ping absolute inline-flex h-1.5 w-1.5 rounded-full bg-green-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-1 w-1 bg-green-500"></span>
                            </span>
                        )}
                        {session.status === 'waiting' && (
                            <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                            </svg>
                        )}
                        {session.status === 'paused' && (
                            <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                            </svg>
                        )}
                        {session.status === 'error' && (
                            <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
                            </svg>
                        )}
                        <span className="capitalize">{session.status}</span>
                    </div>
                </div>

                {/* Title */}
                <h3 className="text-sm font-medium text-gray-100 line-clamp-1 mb-2">
                    {ticket.title}
                </h3>

                {/* Tags */}
                <div className="flex flex-wrap gap-1">
                    {ticket.tags.slice(0, 3).map((tag) => (
                        <span
                            key={tag}
                            className="text-xs px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 truncate max-w-[80px]"
                        >
                            {tag}
                        </span>
                    ))}
                    {ticket.tags.length > 3 && (
                        <span className="text-xs text-gray-500">
                            +{ticket.tags.length - 3}
                        </span>
                    )}
                </div>
            </div>

            {/* Terminal Area */}
            <div ref={terminalRef} className="flex-1 min-h-0 overflow-hidden p-3" />

            {/* Card Footer */}
            <div className="flex-shrink-0 z-10 px-4 py-3 bg-[#1a1a1a] border-t border-gray-700 flex items-center justify-between">
                {/* Owner */}
                <div className="flex items-center gap-2">
                    {ownerName ? (
                        <>
                            <div className={`w-6 h-6 rounded-full ${isAIOwner ? 'bg-gradient-to-br from-purple-400 to-purple-600' : 'bg-gradient-to-br from-gray-400 to-gray-600'} flex items-center justify-center text-white text-[10px] font-medium`}>
                                {isAIOwner ? (
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                    </svg>
                                ) : (
                                    ownerName.substring(0, 2).toUpperCase()
                                )}
                            </div>
                            <span className="text-xs text-gray-400">
                                {ownerName}
                            </span>
                        </>
                    ) : (
                        <span className="text-xs text-gray-500">
                            Unassigned
                        </span>
                    )}
                </div>
                <button
                    onClick={() => onOpenTicket(ticket)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-medium transition-colors"
                >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    Open Ticket
                </button>
            </div>
        </div>
    );
}

// Main Board Agent View Component
export function BoardAgentView({ statuses, ownerNames, teamMembers }: BoardAgentViewProps) {
    const { state } = useBoardState();
    const [activeSessions, setActiveSessions] = useState<ActiveSession[]>([]);
    const [selectedTicket, setSelectedTicket] = useState<TicketWithStatus | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<string>('');

    // Get all tickets from context
    const allTickets = useMemo(() => {
        return Object.values(state.tickets).flat();
    }, [state.tickets]);

    // Poll for active sessions
    useEffect(() => {
        const checkSessions = async () => {
            try {
                const res = await fetch('/api/active-sessions-internal');
                const data = await res.json();
                setActiveSessions(data.activeSessions || []);
                setIsLoading(false);
            } catch (err) {
                console.error('Failed to fetch active sessions:', err);
                setIsLoading(false);
            }
        };

        checkSessions();
        const interval = setInterval(checkSessions, 2000);
        return () => clearInterval(interval);
    }, []);

    // Create a map of ticketId -> session for quick lookup
    const sessionMap = useMemo(() => {
        const map = new Map<string, ActiveSession>();
        activeSessions.forEach(session => {
            map.set(session.ticketId, session);
        });
        return map;
    }, [activeSessions]);

    // Group tickets by status
    const ticketsByStatus = useMemo(() => {
        const groups: Record<string, TicketWithStatus[]> = {};

        // Initialize all statuses
        statuses.forEach(status => {
            groups[status.id] = [];
        });

        // Filter to only tickets with active sessions and group by status
        allTickets.forEach(ticket => {
            if (sessionMap.has(ticket.id) && groups[ticket.status]) {
                groups[ticket.status].push(ticket);
            }
        });

        // Sort within each group by position
        Object.keys(groups).forEach(statusId => {
            groups[statusId].sort((a, b) => {
                const posA = (a.metadata as any)?.position ?? 999;
                const posB = (b.metadata as any)?.position ?? 999;
                return posA - posB;
            });
        });

        return groups;
    }, [allTickets, sessionMap, statuses]);

    // Count of active sessions per status
    const sessionCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        statuses.forEach(status => {
            counts[status.id] = ticketsByStatus[status.id]?.length || 0;
        });
        return counts;
    }, [ticketsByStatus, statuses]);

    // Total active sessions
    const totalSessions = useMemo(() => {
        return Object.values(sessionCounts).reduce((a, b) => a + b, 0);
    }, [sessionCounts]);

    // Set default active tab to first status with sessions, or first status
    useEffect(() => {
        if (!activeTab && statuses.length > 0) {
            const firstWithSessions = statuses.find(s => sessionCounts[s.id] > 0);
            setActiveTab(firstWithSessions?.id || statuses[0].id);
        }
    }, [statuses, sessionCounts, activeTab]);

    const handleOpenTicket = useCallback((ticket: TicketWithStatus) => {
        setSelectedTicket(ticket);
    }, []);

    // Loading state
    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                    <p className="text-sm text-gray-500 dark:text-gray-400">Loading active sessions...</p>
                </div>
            </div>
        );
    }

    // Get tickets for current tab
    const currentTickets = ticketsByStatus[activeTab] || [];

    return (
        <>
            {selectedTicket && (
                <TicketEditor
                    isOpen={true}
                    onClose={() => setSelectedTicket(null)}
                    ticket={selectedTicket}
                    teamMembers={teamMembers}
                    statuses={statuses}
                />
            )}

            <div className="h-full overflow-hidden flex flex-col">
                {/* Tabs - styled like BoardSelector */}
                <div className="flex-shrink-0 px-8 pt-4">
                    <div className="flex items-center gap-1">
                        {statuses.map((status) => {
                            const count = sessionCounts[status.id];
                            const isActive = activeTab === status.id;

                            return (
                                <button
                                    key={status.id}
                                    onClick={() => setActiveTab(status.id)}
                                    className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                                        isActive
                                            ? 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                                            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/50'
                                    }`}
                                >
                                    {status.name}
                                    {count > 0 && (
                                        <span className="text-xs px-1.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400">
                                            {count}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Content - using PanScrollContainer like Kanban */}
                {currentTickets.length === 0 ? (
                    <div className="flex-1 flex items-center justify-center">
                        <div className="flex flex-col items-center gap-4 max-w-md text-center">
                            <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                                <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                            </div>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                No active sessions in this column
                            </p>
                        </div>
                    </div>
                ) : (
                    <PanScrollContainer className="flex-1 min-h-0">
                        <div className="flex gap-4 h-full pb-6">
                            {currentTickets.map((ticket) => {
                                const session = sessionMap.get(ticket.id);
                                if (!session) return null;

                                return (
                                    <AgentTerminalCard
                                        key={ticket.id}
                                        ticket={ticket}
                                        session={session}
                                        ownerName={ownerNames[ticket.owner || '']}
                                        teamMembers={teamMembers}
                                        statuses={statuses}
                                        onOpenTicket={handleOpenTicket}
                                    />
                                );
                            })}
                        </div>
                    </PanScrollContainer>
                )}
            </div>
        </>
    );
}
