'use client'

import { useState, useMemo, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import type { TicketWithStatus, TeamMember, StatusConfig } from '@/lib/schemas';
import { TicketEditor } from './TicketEditor';
import { AgentLauncher } from './AgentLauncher';
import { useBoardState } from '@/context/BoardStateContext';
import { useToast } from '@/context/ToastContext';
import { deleteTicket } from '@/app/actions';

interface BoardTableViewProps {
    statuses: StatusConfig[];
    ownerNames: Record<string, string>;
    teamMembers: TeamMember[];
}

type SortField = 'id' | 'title' | 'priority' | 'owner' | 'created' | 'updated';
type SortDirection = 'asc' | 'desc';

const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };

export function BoardTableView({ statuses, ownerNames, teamMembers }: BoardTableViewProps) {
    const { state, openTerminal, closeTerminal, isTerminalOpen, archiveTicket } = useBoardState();
    const { toast } = useToast();
    const [sortField, setSortField] = useState<SortField>('updated');
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
    const [filterPriority, setFilterPriority] = useState<string>('');
    const [filterOwner, setFilterOwner] = useState<string>('');
    const [selectedTicket, setSelectedTicket] = useState<TicketWithStatus | null>(null);
    const [collapsedStatuses, setCollapsedStatuses] = useState<Set<string>>(new Set());
    const [activeSessions, setActiveSessions] = useState<Set<string>>(new Set());
    const [openActionMenu, setOpenActionMenu] = useState<string | null>(null);
    const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
    const actionMenuRef = useRef<HTMLDivElement>(null);

    // Close action menu when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (actionMenuRef.current && !actionMenuRef.current.contains(event.target as Node)) {
                setOpenActionMenu(null);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Handle opening action menu with position calculation
    function handleOpenActionMenu(ticketId: string, buttonElement: HTMLButtonElement) {
        if (openActionMenu === ticketId) {
            setOpenActionMenu(null);
            setMenuPosition(null);
        } else {
            const rect = buttonElement.getBoundingClientRect();
            setMenuPosition({
                top: rect.bottom + 4,
                left: rect.right - 144, // 144px = menu width (w-36 = 9rem = 144px)
            });
            setOpenActionMenu(ticketId);
        }
    }

    // Get all tickets from context
    const tickets = useMemo(() => {
        return Object.values(state.tickets).flat();
    }, [state.tickets]);

    // Check if terminal is open for any ticket
    const aiPanelTicketId = state.openTerminalTicketId;

    // Check for active AI sessions
    useEffect(() => {
        const checkSessions = async () => {
            try {
                const res = await fetch('/api/active-sessions-internal');
                const data = await res.json();
                const activeIds = new Set<string>(
                    data.activeSessions?.map((s: any) => s.ticketId) || []
                );
                setActiveSessions(activeIds);
            } catch {
                // Ignore errors
            }
        };

        checkSessions();
        const interval = setInterval(checkSessions, 2000);
        return () => clearInterval(interval);
    }, []);

    const priorityColors = {
        critical: 'bg-red-500',
        high: 'bg-orange-500',
        medium: 'bg-yellow-500',
        low: 'bg-gray-400',
    };

    // Group tickets by status and apply filters/sorting within each group
    const groupedTickets = useMemo(() => {
        const groups: Record<string, TicketWithStatus[]> = {};

        // Initialize groups for each status
        for (const status of statuses) {
            groups[status.id] = [];
        }

        // Filter and distribute tickets
        for (const ticket of tickets) {
            if (filterPriority && ticket.priority !== filterPriority) continue;
            if (filterOwner && ticket.owner !== filterOwner) continue;

            if (groups[ticket.status]) {
                groups[ticket.status].push(ticket);
            }
        }

        // Sort tickets within each group
        for (const statusId of Object.keys(groups)) {
            groups[statusId].sort((a, b) => {
                let comparison = 0;

                switch (sortField) {
                    case 'id':
                        comparison = a.id.localeCompare(b.id);
                        break;
                    case 'title':
                        comparison = a.title.localeCompare(b.title);
                        break;
                    case 'priority':
                        comparison = priorityOrder[a.priority] - priorityOrder[b.priority];
                        break;
                    case 'owner':
                        const ownerA = ownerNames[a.owner || ''] || a.owner || 'zzz';
                        const ownerB = ownerNames[b.owner || ''] || b.owner || 'zzz';
                        comparison = ownerA.localeCompare(ownerB);
                        break;
                    case 'created':
                        comparison = new Date(a.metadata.created_at).getTime() - new Date(b.metadata.created_at).getTime();
                        break;
                    case 'updated':
                        comparison = new Date(a.metadata.updated_at).getTime() - new Date(b.metadata.updated_at).getTime();
                        break;
                }

                return sortDirection === 'asc' ? comparison : -comparison;
            });
        }

        return groups;
    }, [tickets, filterPriority, filterOwner, sortField, sortDirection, statuses, ownerNames]);

    const totalFiltered = useMemo(() => {
        return Object.values(groupedTickets).reduce((sum, arr) => sum + arr.length, 0);
    }, [groupedTickets]);

    function handleSort(field: SortField) {
        if (sortField === field) {
            setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('asc');
        }
    }

    function toggleCollapse(statusId: string) {
        setCollapsedStatuses(prev => {
            const next = new Set(prev);
            if (next.has(statusId)) {
                next.delete(statusId);
            } else {
                next.add(statusId);
            }
            return next;
        });
    }

    function SortIcon({ field }: { field: SortField }) {
        if (sortField !== field) {
            return (
                <svg className="w-3 h-3 ml-1 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                </svg>
            );
        }
        return sortDirection === 'asc' ? (
            <svg className="w-3 h-3 ml-1 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
        ) : (
            <svg className="w-3 h-3 ml-1 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
        );
    }

    function formatDate(dateStr: string) {
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        });
    }

    const uniqueOwners = useMemo(() => {
        const owners = new Set<string>();
        tickets.forEach(t => {
            if (t.owner) owners.add(t.owner);
        });
        return Array.from(owners);
    }, [tickets]);

    async function handleArchive(ticketId: string) {
        setOpenActionMenu(null);
        // Find the ticket's current status
        let ticketStatus = 'backlog';
        for (const [status, ticketList] of Object.entries(state.tickets)) {
            if (ticketList.some(t => t.id === ticketId)) {
                ticketStatus = status;
                break;
            }
        }
        try {
            // Use context's archiveTicket which includes undo functionality
            await archiveTicket(ticketId, ticketStatus);
        } catch (error) {
            console.error('Failed to archive ticket:', error);
            toast.error('Failed to archive ticket');
        }
    }

    async function handleDelete(ticketId: string) {
        if (!confirm('Are you sure you want to delete this ticket? This cannot be undone.')) return;
        setOpenActionMenu(null);
        try {
            await deleteTicket(ticketId, state.boardId);
            toast.success('Ticket deleted successfully');
        } catch (error) {
            console.error('Failed to delete ticket:', error);
            toast.error('Failed to delete ticket');
        }
    }

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

            {aiPanelTicketId && (
                <AgentLauncher
                    ticketId={aiPanelTicketId}
                    onClose={() => closeTerminal()}
                />
            )}

            <div className="w-full space-y-4">
                {/* Filters */}
                <div className="w-full bg-white/40 dark:bg-white/5 backdrop-blur-xl rounded-xl border border-white/20 dark:border-white/10 px-4 py-3 flex items-center gap-4 flex-wrap">
                    <span className="text-xs text-gray-500 dark:text-gray-400">Filter by:</span>

                    {/* Priority filter */}
                    <select
                        value={filterPriority}
                        onChange={(e) => setFilterPriority(e.target.value)}
                        className="text-xs px-2 py-1 border border-white/20 dark:border-white/10 rounded-md bg-white/50 dark:bg-white/5 backdrop-blur-sm text-gray-700 dark:text-gray-300"
                    >
                        <option value="">All Priorities</option>
                        <option value="critical">Critical</option>
                        <option value="high">High</option>
                        <option value="medium">Medium</option>
                        <option value="low">Low</option>
                    </select>

                    {/* Owner filter */}
                    <select
                        value={filterOwner}
                        onChange={(e) => setFilterOwner(e.target.value)}
                        className="text-xs px-2 py-1 border border-white/20 dark:border-white/10 rounded-md bg-white/50 dark:bg-white/5 backdrop-blur-sm text-gray-700 dark:text-gray-300"
                    >
                        <option value="">All Owners</option>
                        {uniqueOwners.map(owner => (
                            <option key={owner} value={owner}>{ownerNames[owner] || owner}</option>
                        ))}
                    </select>

                    <span className="text-xs text-gray-400 dark:text-gray-500 ml-auto">
                        {totalFiltered} tickets
                    </span>
                </div>

                {/* Status Sections */}
                {statuses.map((status) => {
                    const statusTickets = groupedTickets[status.id] || [];
                    const isCollapsed = collapsedStatuses.has(status.id);

                    return (
                        <div
                            key={status.id}
                            className="w-full bg-white/40 dark:bg-white/5 backdrop-blur-xl rounded-xl border border-white/20 dark:border-white/10 overflow-hidden"
                        >
                            {/* Status Header */}
                            <button
                                onClick={() => toggleCollapse(status.id)}
                                className="w-full px-4 py-3 flex items-center justify-between hover:bg-white/20 dark:hover:bg-white/5 transition-colors"
                            >
                                <div className="flex items-center gap-3">
                                    <svg
                                        className={`w-4 h-4 text-gray-400 transition-transform ${isCollapsed ? '' : 'rotate-90'}`}
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                    >
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                    </svg>
                                    <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                        {status.name}
                                    </span>
                                    <span className="text-xs text-gray-400 dark:text-gray-500">
                                        {statusTickets.length}
                                    </span>
                                </div>
                            </button>

                            {/* Table */}
                            {!isCollapsed && statusTickets.length > 0 && (
                                <div className="overflow-x-auto border-t border-white/10 dark:border-white/5">
                                    <table className="w-full table-fixed">
                                        <thead>
                                            <tr className="bg-white/20 dark:bg-white/5">
                                                <th
                                                    className="px-4 py-2 text-left cursor-pointer hover:bg-white/30 dark:hover:bg-white/10 w-24"
                                                    onClick={() => handleSort('id')}
                                                >
                                                    <div className="flex items-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                                        ID
                                                        <SortIcon field="id" />
                                                    </div>
                                                </th>
                                                <th
                                                    className="px-4 py-2 text-left cursor-pointer hover:bg-white/30 dark:hover:bg-white/10"
                                                    style={{ width: '40%', minWidth: '200px' }}
                                                    onClick={() => handleSort('title')}
                                                >
                                                    <div className="flex items-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                                        Title
                                                        <SortIcon field="title" />
                                                    </div>
                                                </th>
                                                <th
                                                    className="px-4 py-2 text-left cursor-pointer hover:bg-white/30 dark:hover:bg-white/10 w-24"
                                                    onClick={() => handleSort('priority')}
                                                >
                                                    <div className="flex items-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                                        Priority
                                                        <SortIcon field="priority" />
                                                    </div>
                                                </th>
                                                <th
                                                    className="px-4 py-2 text-left cursor-pointer hover:bg-white/30 dark:hover:bg-white/10 w-32"
                                                    onClick={() => handleSort('owner')}
                                                >
                                                    <div className="flex items-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                                        Owner
                                                        <SortIcon field="owner" />
                                                    </div>
                                                </th>
                                                <th className="px-4 py-2 text-left w-36">
                                                    <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                                        Tags
                                                    </div>
                                                </th>
                                                <th
                                                    className="px-4 py-2 text-left cursor-pointer hover:bg-white/30 dark:hover:bg-white/10 w-28"
                                                    onClick={() => handleSort('updated')}
                                                >
                                                    <div className="flex items-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                                        Updated
                                                        <SortIcon field="updated" />
                                                    </div>
                                                </th>
                                                <th className="px-4 py-2 text-center w-20">
                                                    <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                                        AI
                                                    </div>
                                                </th>
                                                <th className="px-2 py-2 text-center w-12">
                                                    <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">

                                                    </div>
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {statusTickets.map((ticket) => (
                                                <tr
                                                    key={ticket.id}
                                                    className="border-t border-white/5 hover:bg-white/20 dark:hover:bg-white/5 cursor-pointer transition-colors"
                                                    onClick={() => setSelectedTicket(ticket)}
                                                >
                                                    <td className="px-4 py-2.5 w-24">
                                                        <span className="text-xs font-mono text-gray-500 dark:text-gray-400">
                                                            {ticket.id}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-2.5 overflow-hidden">
                                                        <span className="text-sm text-gray-900 dark:text-gray-100 block truncate">
                                                            {ticket.title}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-2.5 w-24">
                                                        <div className="flex items-center gap-2">
                                                            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${priorityColors[ticket.priority]}`}></div>
                                                            <span className="text-xs text-gray-600 dark:text-gray-400 capitalize">
                                                                {ticket.priority}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-2.5 w-32 overflow-hidden">
                                                        <span className="text-xs text-gray-600 dark:text-gray-400 block truncate">
                                                            {ticket.owner ? (ownerNames[ticket.owner] || ticket.owner) : '—'}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-2.5 w-36 overflow-hidden">
                                                        <div className="flex flex-nowrap gap-1 overflow-hidden">
                                                            {ticket.tags.slice(0, 2).map(tag => (
                                                                <span
                                                                    key={tag}
                                                                    className="text-xs px-1.5 py-0.5 rounded bg-white/30 dark:bg-white/10 text-gray-600 dark:text-gray-400 truncate max-w-16"
                                                                >
                                                                    {tag}
                                                                </span>
                                                            ))}
                                                            {ticket.tags.length > 2 && (
                                                                <span className="text-xs text-gray-400 flex-shrink-0">
                                                                    +{ticket.tags.length - 2}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-2.5 w-28">
                                                        <span className="text-xs text-gray-500 dark:text-gray-500">
                                                            {formatDate(ticket.metadata.updated_at)}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-2.5 text-center">
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                openTerminal(ticket.id);
                                                            }}
                                                            className={`inline-flex items-center gap-1 px-2 py-1 rounded-md transition-colors ${
                                                                activeSessions.has(ticket.id)
                                                                    ? 'border-2 border-green-500 text-green-500 hover:bg-green-500 hover:text-white'
                                                                    : 'border border-purple-500 text-purple-500 hover:bg-purple-500 hover:text-white'
                                                            }`}
                                                            title={activeSessions.has(ticket.id) ? 'AI is running' : 'Run AI'}
                                                        >
                                                            {activeSessions.has(ticket.id) ? (
                                                                <span className="flex h-3 w-3 items-center justify-center">
                                                                    <span className="animate-ping absolute inline-flex h-2.5 w-2.5 rounded-full bg-green-400 opacity-75"></span>
                                                                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500"></span>
                                                                </span>
                                                            ) : (
                                                                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                                                                    <path d="M8 5v14l11-7z" />
                                                                </svg>
                                                            )}
                                                            <span className="text-xs font-medium">AI</span>
                                                        </button>
                                                    </td>
                                                    <td className="px-2 py-2.5 text-center">
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleOpenActionMenu(ticket.id, e.currentTarget);
                                                            }}
                                                            className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                                                            title="Actions"
                                                        >
                                                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                                                <circle cx="12" cy="5" r="2" />
                                                                <circle cx="12" cy="12" r="2" />
                                                                <circle cx="12" cy="19" r="2" />
                                                            </svg>
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {!isCollapsed && statusTickets.length === 0 && (
                                <div className="w-full py-12 px-8 flex flex-col items-center justify-center border-t border-white/10 dark:border-white/5">
                                    <svg
                                        className="w-10 h-10 text-gray-300 dark:text-gray-600 mb-3"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                    >
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={1.5}
                                            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                                        />
                                    </svg>
                                    <p className="text-sm text-gray-400 dark:text-gray-500">
                                        No tickets in {status.name.toLowerCase()}
                                    </p>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Action Menu Portal - renders outside table to avoid overflow clipping */}
            {openActionMenu && menuPosition && ReactDOM.createPortal(
                <div
                    ref={actionMenuRef}
                    className="fixed z-[100] w-36 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1"
                    style={{ top: menuPosition.top, left: menuPosition.left }}
                >
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            handleArchive(openActionMenu);
                        }}
                        className="w-full px-3 py-2 text-left text-sm text-amber-600 dark:text-amber-400 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                        </svg>
                        Archive
                    </button>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(openActionMenu);
                        }}
                        className="w-full px-3 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        Delete
                    </button>
                </div>,
                document.body
            )}
        </>
    );
}
