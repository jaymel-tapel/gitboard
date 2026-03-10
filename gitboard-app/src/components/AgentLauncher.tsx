'use client'

import { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import 'xterm/css/xterm.css';
import { BranchSelector } from './BranchSelector';
import ContextSelector, { TicketSectionSelections, DEFAULT_TICKET_SECTIONS } from './ContextSelector';
import type { Ticket } from '@/lib/schemas';
import { useBoardState } from '@/context/BoardStateContext';

interface ExecutionOptions {
    skipPermissions: boolean;
    includeDocsPages: string[];
    includeRepoFiles: string[];
    includeUrls: string[];
    includeSkills: string[];
    includeMCPs: string[];
    includeArtifacts: string[]; // Array of artifact IDs to include as context from previous pipeline stages
    includeRelatedTickets: boolean;
    executionMode: 'normal' | 'plan-only';
    executeImmediately: boolean;
    baseBranch?: string;
    mergeBranch?: string;
    autoMerge: boolean;
    autoPush: boolean;
    autoUpdateTicket: boolean;
    autoMoveTicket: boolean;
    targetColumn: string;
}

interface WorktreeStatus {
    ticketId: string;
    branchName: string;
    branchExists: boolean;
    worktreePath: string;
    worktreeExists: boolean;
    status: 'ready' | 'needs-worktree' | 'needs-branch';
}

interface TicketLink {
    id: string;
    title: string;
}

interface AgentLauncherProps {
    ticketId: string;
    agentId?: string;
    onClose: () => void;
}

// AI Provider options
const AI_PROVIDERS = [
    { id: 'claude-code', name: 'Claude Code' },
    { id: 'gemini-cli', name: 'Gemini CLI' },
    { id: 'cursor-cli', name: 'Cursor CLI' },
] as const;

type AIProvider = typeof AI_PROVIDERS[number]['id'];

export function AgentLauncher({ ticketId, onClose }: AgentLauncherProps) {
    const [isRunning, setIsRunning] = useState(false);
    const [aiAgents, setAiAgents] = useState<any[]>([]);
    const [selectedAgent, setSelectedAgent] = useState<string>('');
    const [selectedProvider, setSelectedProvider] = useState<AIProvider>('claude-code');
    const [createNewBranch, setCreateNewBranch] = useState(true);
    const [mounted, setMounted] = useState(false);
    const terminalRef = useRef<HTMLDivElement>(null);
    const xtermRef = useRef<any | null>(null);
    const fitAddonRef = useRef<any | null>(null);
    const socketRef = useRef<any | null>(null);

    // Worktree-related state
    const [worktreeStatus, setWorktreeStatus] = useState<WorktreeStatus | null>(null);
    const [showBranchSelector, setShowBranchSelector] = useState(false);
    const [worktreeLoading, setWorktreeLoading] = useState(true);

    // Claude session state
    const [claudeSessionExists, setClaudeSessionExists] = useState(false);
    const [shouldResumeSession, setShouldResumeSession] = useState(false);
    const [sessionUUID, setSessionUUID] = useState<string | null>(null);

    // Base branch selector state
    const [branches, setBranches] = useState<string[]>([]);
    const [branchesLoading, setBranchesLoading] = useState(true);
    const [branchesError, setBranchesError] = useState<string | null>(null);
    const [showMainWarning, setShowMainWarning] = useState(false);

    const [executionOptions, setExecutionOptions] = useState<ExecutionOptions>({
        skipPermissions: true,
        includeDocsPages: [],
        includeRepoFiles: [],
        includeUrls: [],
        includeSkills: [],
        includeMCPs: [],
        includeArtifacts: [],
        includeRelatedTickets: false,
        executionMode: 'normal',
        executeImmediately: true,
        baseBranch: 'main',
        mergeBranch: 'main',
        autoMerge: false,
        autoPush: false,
        autoUpdateTicket: true,
        autoMoveTicket: false,
        targetColumn: 'done',
    });

    const [relatedTickets, setRelatedTickets] = useState<TicketLink[]>([]);

    // Ticket data for context
    const [ticket, setTicket] = useState<Ticket | null>(null);
    const [ticketLoading, setTicketLoading] = useState(true);
    const [selectedTicketSections, setSelectedTicketSections] = useState<TicketSectionSelections>(DEFAULT_TICKET_SECTIONS);

    // Get board statuses and pipeline context from board state
    const { state: boardState, getTicketById } = useBoardState();
    const statuses = boardState.statuses;
    const pipelineAgentId = boardState.openTerminalAgentId;
    const pipelineMode = boardState.openTerminalPipelineMode;

    // Get the ticket's current status and calculate next pipeline column
    const currentTicket = getTicketById(ticketId);
    const currentStatus = currentTicket?.status;
    const currentStatusIndex = statuses.findIndex(s => s.id === currentStatus);
    const currentStatusConfig = currentStatusIndex >= 0 ? statuses[currentStatusIndex] : null;
    const nextStatus = currentStatusIndex >= 0 && currentStatusIndex < statuses.length - 1
        ? statuses[currentStatusIndex + 1]
        : null;

    // Get pipeline settings from current column (if configured)
    const pipelineSettings = currentStatusConfig?.pipelineSettings;

    useEffect(() => {
        setMounted(true);
    }, []);

    // Fetch worktree status for the ticket
    useEffect(() => {
        if (!ticketId) return;

        setWorktreeLoading(true);
        fetch(`/api/worktree-status?ticketId=${ticketId}`)
            .then(res => res.json())
            .then(data => {
                setWorktreeStatus(data);
                setWorktreeLoading(false);
                if (data.status === 'ready') {
                    setShouldResumeSession(true);
                }
            })
            .catch(err => {
                console.error('Failed to fetch worktree status:', err);
                setWorktreeLoading(false);
            });
    }, [ticketId]);

    // Check for existing Claude session
    useEffect(() => {
        if (!ticketId) return;

        fetch(`/api/claude-session?ticketId=${ticketId}`)
            .then(res => res.json())
            .then(data => {
                setClaudeSessionExists(data.exists);
                if (data.sessionUUID) {
                    setSessionUUID(data.sessionUUID);
                }
            })
            .catch(err => console.error('Failed to check claude session:', err));
    }, [ticketId]);

    // Check for active PTY session on mount - this persists across browser refresh
    // If active PTY found, auto-connect to it
    useEffect(() => {
        if (!ticketId || !selectedAgent) return;

        fetch('/api/active-sessions-internal')
            .then(res => res.json())
            .then(data => {
                const hasActivePty = data.activeSessions?.some((s: { ticketId: string }) => s.ticketId === ticketId);
                if (hasActivePty) {
                    // An active PTY exists for this ticket - auto-connect to it
                    setShouldResumeSession(true);
                    setIsRunning(true);
                }
            })
            .catch(err => console.error('Failed to check active PTY sessions:', err));
    }, [ticketId, selectedAgent]);

    // Fetch AI agents
    useEffect(() => {
        fetch('/api/agents')
            .then(res => res.json())
            .then(data => {
                const agents = data.agents || [];
                setAiAgents(agents);
                if (agents.length > 0) {
                    // If pipeline mode with assigned agent, use that; otherwise use first agent
                    const targetAgentId = pipelineAgentId || agents[0].id;
                    const targetAgent = agents.find((a: { id: string }) => a.id === targetAgentId) || agents[0];
                    setSelectedAgent(targetAgent.id);
                    // Populate default context from the selected agent
                    setExecutionOptions(prev => ({
                        ...prev,
                        includeDocsPages: targetAgent.defaultDocsPages || [],
                        includeRepoFiles: targetAgent.defaultRepoFiles || [],
                        includeUrls: targetAgent.defaultUrls || [],
                        includeSkills: targetAgent.defaultSkills || [],
                        includeMCPs: targetAgent.defaultMCPs || [],
                    }));
                }
            })
            .catch(err => console.error('Failed to fetch agents:', err));
    }, [pipelineAgentId]);

    // Update context when agent selection changes
    useEffect(() => {
        if (!selectedAgent || aiAgents.length === 0) return;
        const agent = aiAgents.find(a => a.id === selectedAgent);
        if (agent) {
            setExecutionOptions(prev => ({
                ...prev,
                includeDocsPages: agent.defaultDocsPages || [],
                includeRepoFiles: agent.defaultRepoFiles || [],
                includeUrls: agent.defaultUrls || [],
                includeSkills: agent.defaultSkills || [],
                includeMCPs: agent.defaultMCPs || [],
            }));
        }
    }, [selectedAgent, aiAgents]);

    // Fetch branches
    useEffect(() => {
        fetch('/api/branches')
            .then(res => res.json())
            .then(data => {
                setBranches(data.branches || []);
                // Use currentBranch (checked-out branch) instead of defaultBranch for better UX
                const currentBranch = data.currentBranch || data.defaultBranch || 'main';
                setExecutionOptions(prev => ({
                    ...prev,
                    baseBranch: currentBranch,
                    mergeBranch: currentBranch,
                }));
                setBranchesLoading(false);
            })
            .catch(err => {
                console.error('Failed to fetch branches:', err);
                setBranchesError('Failed to load branches');
                setBranchesLoading(false);
            });
    }, []);

    // Fetch ticket data
    useEffect(() => {
        if (!ticketId) return;

        setTicketLoading(true);
        fetch(`/api/tickets?ticketId=${ticketId}`)
            .then(res => res.json())
            .then(data => {
                setTicket(data.ticket || null);
                setTicketLoading(false);
            })
            .catch(err => {
                console.error('Failed to fetch ticket:', err);
                setTicketLoading(false);
            });
    }, [ticketId]);

    // Fetch related tickets
    useEffect(() => {
        if (!ticketId) return;

        fetch(`/api/tickets/${ticketId}/links`)
            .then(res => res.json())
            .then(data => {
                const links = data.links || {};
                const related = [
                    ...(links.related_tickets || []),
                    ...(links.blocks || []),
                    ...(links.blocked_by || []),
                ].map((id: string) => ({ id, title: id }));
                setRelatedTickets(related);
            })
            .catch(err => console.error('Failed to fetch ticket links:', err));
    }, [ticketId]);

    // Pipeline mode: Auto-fetch and select all artifacts from previous stages
    useEffect(() => {
        if (!ticketId || !pipelineMode) return;

        console.log('🔗 Pipeline mode: Auto-fetching artifacts for', ticketId);

        fetch(`/api/ticket-artifacts/${ticketId}`)
            .then(res => {
                if (!res.ok) throw new Error('Failed to fetch artifacts');
                return res.json();
            })
            .then(data => {
                const artifacts = data.artifacts || [];
                if (artifacts.length > 0) {
                    // Auto-select all artifacts in pipeline mode
                    const artifactIds = artifacts.map((a: { id: string }) => a.id);
                    console.log('🔗 Pipeline mode: Auto-selecting', artifactIds.length, 'artifacts');
                    setExecutionOptions(prev => ({
                        ...prev,
                        includeArtifacts: artifactIds,
                    }));
                }
            })
            .catch(err => console.error('Failed to fetch artifacts for pipeline:', err));
    }, [ticketId, pipelineMode]);

    // Pipeline mode: Apply column's pipeline settings and configure target column
    useEffect(() => {
        if (!pipelineMode) return;

        console.log('🔗 Pipeline mode: Applying column settings', pipelineSettings);

        // Apply createNewBranch setting from column config
        if (pipelineSettings?.createNewBranch !== undefined) {
            setCreateNewBranch(pipelineSettings.createNewBranch);
        }

        setExecutionOptions(prev => {
            const updates: Partial<typeof prev> = {};

            // Apply pipeline settings from column configuration (if available)
            if (pipelineSettings) {
                if (pipelineSettings.skipPermissions !== undefined) updates.skipPermissions = pipelineSettings.skipPermissions;
                if (pipelineSettings.executionMode !== undefined) updates.executionMode = pipelineSettings.executionMode;
                if (pipelineSettings.autoMerge !== undefined) updates.autoMerge = pipelineSettings.autoMerge;
                if (pipelineSettings.autoPush !== undefined) updates.autoPush = pipelineSettings.autoPush;
                if (pipelineSettings.autoUpdateTicket !== undefined) updates.autoUpdateTicket = pipelineSettings.autoUpdateTicket;
                if (pipelineSettings.includeRelatedTickets !== undefined) updates.includeRelatedTickets = pipelineSettings.includeRelatedTickets;
                if (pipelineSettings.baseBranch) updates.baseBranch = pipelineSettings.baseBranch;

                // Merge default context arrays with existing
                if (pipelineSettings.defaultDocsPages?.length) {
                    updates.includeDocsPages = [...new Set([...prev.includeDocsPages, ...pipelineSettings.defaultDocsPages])];
                }
                if (pipelineSettings.defaultRepoFiles?.length) {
                    updates.includeRepoFiles = [...new Set([...prev.includeRepoFiles, ...pipelineSettings.defaultRepoFiles])];
                }
                if (pipelineSettings.defaultUrls?.length) {
                    updates.includeUrls = [...new Set([...prev.includeUrls, ...pipelineSettings.defaultUrls])];
                }
                if (pipelineSettings.defaultSkills?.length) {
                    updates.includeSkills = [...new Set([...prev.includeSkills, ...pipelineSettings.defaultSkills])];
                }
                if (pipelineSettings.defaultMCPs?.length) {
                    updates.includeMCPs = [...new Set([...prev.includeMCPs, ...pipelineSettings.defaultMCPs])];
                }
            }

            // Always set target to next column in pipeline (unless at end)
            if (nextStatus) {
                updates.autoMoveTicket = pipelineSettings?.autoMoveTicket ?? true;
                updates.targetColumn = nextStatus.id;
                console.log('🔗 Pipeline mode: Target column set to', nextStatus.id);
            }

            return { ...prev, ...updates };
        });
    }, [pipelineMode, pipelineSettings, nextStatus]);

    // Pipeline mode: Auto-start the terminal once everything is ready
    useEffect(() => {
        if (!pipelineMode || !selectedAgent || !mounted || isRunning || worktreeLoading) return;

        // Give a brief delay to ensure all state is settled
        const timeout = setTimeout(() => {
            console.log('🚀 Pipeline mode: Auto-starting terminal for agent', selectedAgent);
            setShouldResumeSession(false); // Start fresh session for pipeline
            setIsRunning(true);
        }, 500);

        return () => clearTimeout(timeout);
    }, [pipelineMode, selectedAgent, mounted, isRunning, worktreeLoading]);

    // Terminal setup effect
    useEffect(() => {
        if (!isRunning || !terminalRef.current) return;

        let term: any;
        let fitAddon: any;

        import('xterm').then(({ Terminal }) => {
            import('xterm-addon-fit').then(({ FitAddon }) => {
                import('socket.io-client').then(({ io }) => {
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
                        rows: 30,
                    });

                    fitAddon = new FitAddon();
                    term.loadAddon(fitAddon);
                    term.open(terminalRef.current!);
                    fitAddon.fit();

                    xtermRef.current = term;
                    fitAddonRef.current = fitAddon;

                    const selectedAgentData = aiAgents.find(a => a.id === selectedAgent);
                    const systemPromptPath = selectedAgentData?.systemPrompt || '';

                    const socket = io({
                        query: {
                            ticketId: ticketId,
                            agentId: selectedAgent,
                            provider: selectedProvider,
                            resume: shouldResumeSession ? 'true' : 'false',
                            sessionUUID: sessionUUID || '',
                            skipPermissions: executionOptions.skipPermissions ? 'true' : 'false',
                            executionMode: executionOptions.executionMode,
                            executeImmediately: executionOptions.executeImmediately ? 'true' : 'false',
                            includeDocsPages: executionOptions.includeDocsPages.join(','),
                            includeRepoFiles: executionOptions.includeRepoFiles.join(','),
                            includeUrls: executionOptions.includeUrls.join(','),
                            includeSkills: executionOptions.includeSkills.join(','),
                            includeMCPs: executionOptions.includeMCPs.join(','),
                            includeArtifacts: executionOptions.includeArtifacts.join(','),
                            includeRelatedTickets: executionOptions.includeRelatedTickets ? 'true' : 'false',
                            baseBranch: executionOptions.baseBranch || '',
                            mergeBranch: executionOptions.mergeBranch || executionOptions.baseBranch || '',
                            createNewBranch: createNewBranch ? 'true' : 'false',
                            autoMerge: executionOptions.autoMerge ? 'true' : 'false',
                            autoUpdateTicket: executionOptions.autoUpdateTicket ? 'true' : 'false',
                            autoMoveTicket: executionOptions.autoMoveTicket ? 'true' : 'false',
                            targetColumn: executionOptions.targetColumn || 'done',
                            // Ticket sections for context
                            includeTicketTitle: selectedTicketSections.title ? 'true' : 'false',
                            includeTicketDescription: selectedTicketSections.description ? 'true' : 'false',
                            includeTicketImplementationSteps: selectedTicketSections.implementationSteps ? 'true' : 'false',
                            includeTicketAcceptanceCriteria: selectedTicketSections.acceptanceCriteria ? 'true' : 'false',
                            includeTicketNotes: selectedTicketSections.notes ? 'true' : 'false',
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

                    const disposable = term.onData((data: string) => {
                        socket.emit('input', data);
                    });

                    const handleResize = () => {
                        fitAddon.fit();
                        socket.emit('resize', { cols: term.cols, rows: term.rows });
                    };
                    window.addEventListener('resize', handleResize);

                    // ResizeObserver for container size changes
                    let resizeObserver: ResizeObserver | null = null;
                    if (terminalRef.current) {
                        resizeObserver = new ResizeObserver(() => {
                            fitAddon.fit();
                            socket.emit('resize', { cols: term.cols, rows: term.rows });
                        });
                        resizeObserver.observe(terminalRef.current);
                    }

                    return () => {
                        disposable.dispose();
                        window.removeEventListener('resize', handleResize);
                        resizeObserver?.disconnect();
                        socket.disconnect();
                        socketRef.current = null;
                        term.dispose();
                    };
                });
            });
        });
    }, [isRunning, ticketId, selectedAgent, selectedProvider, createNewBranch, aiAgents, executionOptions, shouldResumeSession, relatedTickets.length, worktreeStatus, selectedTicketSections]);

    function handleStart() {
        if (!selectedAgent) {
            alert('Please select an AI agent');
            return;
        }
        setIsRunning(true);
    }

    function handleResumeSession() {
        setShouldResumeSession(true);
        handleStart();
    }

    function handleStartNewSession() {
        setShouldResumeSession(false);
        handleStart();
    }

    function handleBranchSelect(baseBranch: string) {
        setShowBranchSelector(false);
        setExecutionOptions(prev => ({ ...prev, baseBranch }));
        setIsRunning(true);
    }

    function handleBranchSelectorCancel() {
        setShowBranchSelector(false);
    }

    if (!mounted) return null;

    return (
        <>
            {/* Branch Selector Modal */}
            {showBranchSelector && (
                <BranchSelector
                    ticketId={ticketId}
                    onSelect={handleBranchSelect}
                    onCancel={handleBranchSelectorCancel}
                />
            )}

            {/* Backdrop */}
            {ReactDOM.createPortal(
                <div
                    className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100]"
                    onClick={onClose}
                />,
                document.body
            )}

            {/* Centered Modal */}
            {ReactDOM.createPortal(
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
                    <div
                        className="w-full h-full bg-white dark:bg-[#0d0d0d] border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl flex flex-col overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#1a1a1a]">
                            <div>
                                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                                    Agent Launcher
                                    {pipelineMode && (
                                        <span className="ml-2 px-2 py-0.5 text-xs font-medium bg-purple-100 dark:bg-purple-600/30 text-purple-700 dark:text-purple-300 rounded-full">
                                            Pipeline
                                        </span>
                                    )}
                                </h2>
                                <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
                                    {ticketId}
                                    {pipelineMode && pipelineAgentId && (
                                        <span className="ml-2 text-purple-600 dark:text-purple-400">
                                            → {aiAgents.find(a => a.id === pipelineAgentId)?.name || pipelineAgentId}
                                        </span>
                                    )}
                                </p>
                            </div>
                            <button
                                onClick={onClose}
                                className="text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-300 p-1"
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {/* Body - Two Column Layout (55/45 split) */}
                        <div className="flex-1 flex overflow-hidden">
                            {/* Left Panel - Terminal (55%) - kept dark for terminal readability */}
                            <div className="w-1/2 flex flex-col overflow-hidden bg-[#0d0d0d]">
                                {isRunning && (
                                    <div ref={terminalRef} className="flex-1 p-4 overflow-hidden" />
                                )}
                            </div>

                            {/* Right Panel - ContextSelector with Settings tab (45%) - ALWAYS visible */}
                            <div className="w-1/2 border-l border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden bg-white dark:bg-[#0d0d0d]">
                                <ContextSelector
                                    selectedDocsPages={executionOptions.includeDocsPages}
                                    onDocsSelectionChange={(pages) => setExecutionOptions(prev => ({
                                        ...prev,
                                        includeDocsPages: pages,
                                    }))}
                                    selectedRepoFiles={executionOptions.includeRepoFiles}
                                    onRepoFilesSelectionChange={(files) => setExecutionOptions(prev => ({
                                        ...prev,
                                        includeRepoFiles: files,
                                    }))}
                                    selectedUrls={executionOptions.includeUrls}
                                    onUrlsSelectionChange={(urls) => setExecutionOptions(prev => ({
                                        ...prev,
                                        includeUrls: urls,
                                    }))}
                                    selectedSkills={executionOptions.includeSkills}
                                    onSkillsSelectionChange={(skills) => setExecutionOptions(prev => ({
                                        ...prev,
                                        includeSkills: skills,
                                    }))}
                                    selectedMCPs={executionOptions.includeMCPs}
                                    onMCPsSelectionChange={(mcps) => setExecutionOptions(prev => ({
                                        ...prev,
                                        includeMCPs: mcps,
                                    }))}
                                    selectedArtifacts={executionOptions.includeArtifacts}
                                    onArtifactsSelectionChange={(artifacts) => setExecutionOptions(prev => ({
                                        ...prev,
                                        includeArtifacts: artifacts,
                                    }))}
                                    ticket={ticket}
                                    selectedTicketSections={selectedTicketSections}
                                    onTicketSectionsChange={setSelectedTicketSections}
                                    maxHeight="max-h-[calc(100vh-180px)]"
                                    className="flex-1 p-4"
                                    // Settings tab props
                                    ticketId={ticketId}
                                    selectedProvider={selectedProvider}
                                    onProviderChange={(provider) => setSelectedProvider(provider as AIProvider)}
                                    selectedAgent={selectedAgent}
                                    onAgentChange={setSelectedAgent}
                                    aiAgents={aiAgents}
                                    createNewBranch={createNewBranch}
                                    onCreateNewBranchChange={setCreateNewBranch}
                                    worktreeStatus={worktreeStatus}
                                    worktreeLoading={worktreeLoading}
                                    branches={branches}
                                    branchesLoading={branchesLoading}
                                    executionOptions={executionOptions}
                                    onExecutionOptionsChange={setExecutionOptions}
                                    claudeSessionExists={claudeSessionExists}
                                    shouldResumeSession={shouldResumeSession}
                                    onShouldResumeSessionChange={setShouldResumeSession}
                                    relatedTickets={relatedTickets}
                                    statuses={statuses}
                                    isRunning={isRunning}
                                />
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="px-6 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#1a1a1a] flex items-center justify-between">
                            <button
                                onClick={onClose}
                                className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                            >
                                Close
                            </button>
                            <div className="text-xs text-gray-500 dark:text-gray-500">
                                {isRunning && (
                                    <span>
                                        Instructions didn't paste?{' '}
                                        <button
                                            onClick={() => {
                                                if (socketRef.current) {
                                                    socketRef.current.emit('paste-instructions');
                                                }
                                            }}
                                            className="text-purple-600 dark:text-purple-400 hover:text-purple-500 dark:hover:text-purple-300 underline"
                                        >
                                            Click to trigger manually
                                        </button>
                                    </span>
                                )}
                            </div>
                            {isRunning ? (
                                /* Stop Session Button - shown when running */
                                <button
                                    onClick={async () => {
                                        try {
                                            await fetch(`/api/kill-pty-internal?ticketId=${ticketId}`, {
                                                method: 'POST',
                                            });
                                        } catch (err) {
                                            console.error('Failed to stop PTY:', err);
                                        }
                                        setIsRunning(false);
                                    }}
                                    className="px-6 py-2 rounded-lg transition-colors text-sm font-medium bg-red-600 hover:bg-red-700 text-white"
                                >
                                    ⏹ Stop Session
                                </button>
                            ) : (claudeSessionExists || worktreeStatus?.branchExists) ? (
                                /* Two buttons side-by-side when session exists */
                                <div className="flex gap-2">
                                    <button
                                        onClick={handleResumeSession}
                                        disabled={!selectedAgent || aiAgents.length === 0}
                                        className="px-6 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white"
                                    >
                                        ▶ Resume Session
                                    </button>
                                    <button
                                        onClick={handleStartNewSession}
                                        disabled={!selectedAgent || aiAgents.length === 0}
                                        className="px-6 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium bg-purple-600 hover:bg-purple-700 text-white"
                                    >
                                        ▶ Start New Session
                                    </button>
                                </div>
                            ) : (
                                /* Single Start Session button when no existing session */
                                <button
                                    onClick={handleStart}
                                    disabled={!selectedAgent || aiAgents.length === 0}
                                    className="px-6 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium bg-purple-600 hover:bg-purple-700 text-white"
                                >
                                    ▶ Start Session
                                </button>
                            )}
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </>
    );
}
