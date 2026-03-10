'use client'

import { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import 'xterm/css/xterm.css';
import { BranchSelector } from './BranchSelector';
import RepoFileSelector from './RepoFileSelector';

interface ExecutionOptions {
    skipPermissions: boolean;
    includeDocsPages: string[];
    includeRepoFiles: string[];
    includeRelatedTickets: boolean;
    executionMode: 'normal' | 'plan-only';
    executeImmediately: boolean;
    baseBranch?: string; // For creating new branches
    mergeBranch?: string; // Target branch for merging back
}

interface WorktreeStatus {
    ticketId: string;
    branchName: string;
    branchExists: boolean;
    worktreePath: string;
    worktreeExists: boolean;
    status: 'ready' | 'needs-worktree' | 'needs-branch';
}

interface DocsPage {
    slug: string;
    folder: string;
    title: string;
    path: string;
}

interface TicketLink {
    id: string;
    title: string;
}

interface InteractiveTerminalProps {
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

export function InteractiveTerminal({ ticketId, onClose }: InteractiveTerminalProps) {
    const [isRunning, setIsRunning] = useState(false);
    const [hasExistingSession, setHasExistingSession] = useState(false);
    const [aiAgents, setAiAgents] = useState<any[]>([]);
    const [selectedAgent, setSelectedAgent] = useState<string>('');
    const [selectedProvider, setSelectedProvider] = useState<AIProvider>('claude-code');
    const [createNewBranch, setCreateNewBranch] = useState(false);
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

    const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
    const [executionOptions, setExecutionOptions] = useState<ExecutionOptions>({
        skipPermissions: true,
        includeDocsPages: [],
        includeRepoFiles: [],
        includeUrls: [],
        includeSkills: [],
        includeMCPs: [],
        includeRelatedTickets: false,
        executionMode: 'normal',
        executeImmediately: true,
        baseBranch: 'main', // Default to main
        mergeBranch: 'main', // Default merge target (same as base)
        autoMerge: false,
        autoPush: false,
        autoUpdateTicket: false,
        autoMoveTicket: false,
        targetColumn: 'done',
    });

    const [docsPages, setDocsPages] = useState<DocsPage[]>([]);
    const [docsFolders, setDocsFolders] = useState<string[]>([]);
    const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
    const [relatedTickets, setRelatedTickets] = useState<TicketLink[]>([]);
    const [docsSearchQuery, setDocsSearchQuery] = useState('');

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
                // If worktree is ready, default to resume mode (don't paste instructions again)
                if (data.status === 'ready') {
                    setShouldResumeSession(true);
                }
            })
            .catch(err => {
                console.error('Failed to fetch worktree status:', err);
                // Default to needs-branch if we can't check
                setWorktreeStatus({
                    ticketId,
                    branchName: ticketId,
                    branchExists: false,
                    worktreePath: '',
                    worktreeExists: false,
                    status: 'needs-branch'
                });
                setWorktreeLoading(false);
            });
    }, [ticketId]);

    // Check if a Claude session exists for this ticket (for resume functionality)
    useEffect(() => {
        if (!ticketId) return;

        fetch(`/api/claude-sessions?ticketId=${ticketId}`)
            .then(res => res.json())
            .then(data => {
                setClaudeSessionExists(data.sessionExists || false);
                // Store session UUID for direct resume
                if (data.latestSession?.sessionId) {
                    setSessionUUID(data.latestSession.sessionId);
                }
                // Auto-select resume if session exists
                if (data.sessionExists) {
                    setShouldResumeSession(true);
                }
            })
            .catch(err => {
                console.error('Failed to check Claude session:', err);
                setClaudeSessionExists(false);
            });
    }, [ticketId]);

    useEffect(() => {
        fetch('/api/agents')
            .then(res => res.json())
            .then(data => {
                setAiAgents(data.agents || []);
                if (data.agents?.length > 0) {
                    setSelectedAgent(data.agents[0].id);
                }
            })
            .catch(err => console.error('Failed to fetch agents:', err));
    }, []);

    useEffect(() => {
        fetch('/api/docs')
            .then(res => res.json())
            .then(data => {
                setDocsPages(data.docsPages || []);
                setDocsFolders(data.folders || []);
                setExpandedFolders(new Set(data.folders || []));
            })
            .catch(err => console.error('Failed to fetch docs pages:', err));
    }, []);

    // Fetch branches for base branch selector
    useEffect(() => {
        setBranchesLoading(true);
        setBranchesError(null);
        fetch('/api/branches')
            .then(res => res.json())
            .then(data => {
                setBranches(data.branches || []);
                // Set default branch from git if available, otherwise keep 'main'
                const defaultBranch = data.defaultBranch || 'main';
                setExecutionOptions(prev => ({
                    ...prev,
                    baseBranch: defaultBranch,
                    mergeBranch: defaultBranch, // Default merge target same as base
                }));
                // Show warning if default is main
                if (defaultBranch === 'main') {
                    setShowMainWarning(true);
                }
                setBranchesLoading(false);
            })
            .catch(err => {
                console.error('Failed to fetch branches:', err);
                setBranchesError('Failed to load branches');
                setBranchesLoading(false);
            });
    }, []);

    useEffect(() => {
        if (ticketId) {
            fetch(`/api/tickets?ticketId=${ticketId}`)
                .then(res => res.json())
                .then(data => {
                    if (data.ticket?.links) {
                        const links = data.ticket.links;
                        const related: TicketLink[] = [];

                        if (links.blocked_by?.length > 0) {
                            links.blocked_by.forEach((id: string) => {
                                related.push({ id, title: `Blocked by: ${id}` });
                            });
                        }
                        if (links.blocks?.length > 0) {
                            links.blocks.forEach((id: string) => {
                                related.push({ id, title: `Blocks: ${id}` });
                            });
                        }
                        if (links.related_tickets?.length > 0) {
                            links.related_tickets.forEach((id: string) => {
                                related.push({ id, title: `Related: ${id}` });
                            });
                        }

                        setRelatedTickets(related);
                    }
                })
                .catch(err => console.error('Failed to fetch ticket links:', err));
        }
    }, [ticketId]);

    useEffect(() => {
        const checkActiveSession = async () => {
            try {
                const res = await fetch('/api/active-sessions-internal');
                const data = await res.json();
                const hasActive = data.activeSessions?.some((s: any) => s.ticketId === ticketId);

                if (hasActive && !isRunning) {
                    setIsRunning(true);
                }
            } catch (err) {
                console.error('Failed to check active sessions:', err);
            }
        };

        checkActiveSession();
    }, [ticketId]);

    useEffect(() => {
        if (!isRunning || !terminalRef.current) return;

        Promise.all([
            import('xterm'),
            import('xterm-addon-fit'),
            import('socket.io-client'),
        ]).then(([{ Terminal }, { FitAddon }, { io }]) => {
            const term = new Terminal({
                cursorBlink: true,
                fontSize: 14,
                fontFamily: 'Menlo, Monaco, "Courier New", monospace',
                theme: {
                    background: '#0d0d0d',
                    foreground: '#f0f0f0',
                    cursor: '#f0f0f0',
                },
                rows: 30,
            });

            const fitAddon = new FitAddon();
            term.loadAddon(fitAddon);
            term.open(terminalRef.current!);
            fitAddon.fit();

            xtermRef.current = term;
            fitAddonRef.current = fitAddon;

            term.writeln('\x1b[1;32m🤖 GitBoard Interactive Terminal\x1b[0m');
            term.writeln('\x1b[90m━'.repeat(60) + '\x1b[0m');
            term.writeln(`\x1b[1mTicket:\x1b[0m ${ticketId}`);
            const providerDisplay = AI_PROVIDERS.find(p => p.id === selectedProvider)?.name || selectedProvider;
            term.writeln(`\x1b[1mProvider:\x1b[0m ${providerDisplay}`);
            if (selectedAgent) {
                const agent = aiAgents.find(a => a.id === selectedAgent);
                term.writeln(`\x1b[1mSystem Prompt:\x1b[0m ${agent?.name || selectedAgent}`);
            }
            term.writeln(`\x1b[1mMode:\x1b[0m ${executionOptions.executionMode === 'plan-only' ? 'Plan Mode (--plan)' : 'Normal'}`);
            term.writeln(`\x1b[1mPermissions:\x1b[0m ${executionOptions.skipPermissions ? 'Skip prompts' : 'With prompts'}`);
            // Show worktree/branch info
            if (createNewBranch) {
                term.writeln(`\x1b[1mBranch:\x1b[0m ${ticketId} \x1b[33m(new)\x1b[0m`);
                term.writeln(`\x1b[1mBased on:\x1b[0m ${executionOptions.baseBranch || 'main'}`);
                term.writeln(`\x1b[1mMerge to:\x1b[0m ${executionOptions.mergeBranch || executionOptions.baseBranch || 'main'}`);
            } else if (worktreeStatus) {
                term.writeln(`\x1b[1mBranch:\x1b[0m ${worktreeStatus.branchName}${worktreeStatus.branchExists ? '' : ' \x1b[33m(new)\x1b[0m'}`);
                if (executionOptions.baseBranch) {
                    term.writeln(`\x1b[1mBased on:\x1b[0m ${executionOptions.baseBranch}`);
                    term.writeln(`\x1b[1mMerge to:\x1b[0m ${executionOptions.mergeBranch || executionOptions.baseBranch}`);
                }
                term.writeln(`\x1b[1mWorktree:\x1b[0m ${worktreeStatus.worktreeExists ? 'exists' : '\x1b[33mcreating...\x1b[0m'}`);
            }
            if (executionOptions.includeDocsPages.length > 0) {
                term.writeln(`\x1b[1mDocs context:\x1b[0m ${executionOptions.includeDocsPages.length} pages`);
            }
            if (executionOptions.includeRelatedTickets && relatedTickets.length > 0) {
                term.writeln(`\x1b[1mRelated tickets:\x1b[0m ${relatedTickets.length} tickets`);
            }
            term.writeln('\x1b[90m━'.repeat(60) + '\x1b[0m');
            term.writeln('');
            term.writeln('\x1b[33mConnecting to shell...\x1b[0m');
            term.writeln('');

            const socket = io({
                query: {
                    ticketId: ticketId,
                    agentId: selectedAgent,
                    provider: selectedProvider,
                    resume: shouldResumeSession ? 'true' : 'false',
                    sessionUUID: sessionUUID || '', // For direct resume
                    skipPermissions: executionOptions.skipPermissions ? 'true' : 'false',
                    executionMode: executionOptions.executionMode,
                    executeImmediately: executionOptions.executeImmediately ? 'true' : 'false',
                    includeDocsPages: JSON.stringify(executionOptions.includeDocsPages),
                    includeRepoFiles: JSON.stringify(executionOptions.includeRepoFiles),
                    includeRelatedTickets: executionOptions.includeRelatedTickets ? 'true' : 'false',
                    // Worktree parameters
                    baseBranch: executionOptions.baseBranch || '',
                    mergeBranch: executionOptions.mergeBranch || executionOptions.baseBranch || '',
                    createNewBranch: createNewBranch ? 'true' : 'false',
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

            const disposable = term.onData((data) => {
                socket.emit('input', data);
            });

            const handleResize = () => {
                fitAddon.fit();
                socket.emit('resize', { cols: term.cols, rows: term.rows });
            };
            window.addEventListener('resize', handleResize);

            return () => {
                disposable.dispose();
                window.removeEventListener('resize', handleResize);
                socket.disconnect();
                socketRef.current = null;
                term.dispose();
            };
        });
    }, [isRunning, ticketId, selectedAgent, selectedProvider, createNewBranch, aiAgents, executionOptions, shouldResumeSession, relatedTickets.length, worktreeStatus]);

    function handleStart() {
        if (!selectedAgent) {
            alert('Please select an AI agent');
            return;
        }

        // baseBranch is already set via the dropdown selector
        // No need to override here - the user's selection is preserved

        // Proceed directly without showing modal
        setIsRunning(true);
    }

    function handleBranchSelect(baseBranch: string) {
        setShowBranchSelector(false);
        setExecutionOptions(prev => ({ ...prev, baseBranch }));
        setIsRunning(true);
    }

    function handleBranchSelectorCancel() {
        setShowBranchSelector(false);
    }

    function toggleDocsPage(path: string) {
        setExecutionOptions(prev => {
            const isSelected = prev.includeDocsPages.includes(path);
            return {
                ...prev,
                includeDocsPages: isSelected
                    ? prev.includeDocsPages.filter(p => p !== path)
                    : [...prev.includeDocsPages, path],
            };
        });
    }

    function toggleFolder(folder: string) {
        setExpandedFolders(prev => {
            const newSet = new Set(prev);
            if (newSet.has(folder)) {
                newSet.delete(folder);
            } else {
                newSet.add(folder);
            }
            return newSet;
        });
    }

    function selectAllInFolder(folder: string) {
        const folderPages = docsPages.filter(p => p.folder === folder);
        setExecutionOptions(prev => {
            const currentPaths = new Set(prev.includeDocsPages);
            const folderPaths = folderPages.map(p => p.path);
            const allSelected = folderPaths.every(path => currentPaths.has(path));

            if (allSelected) {
                return {
                    ...prev,
                    includeDocsPages: prev.includeDocsPages.filter(p => !folderPaths.includes(p)),
                };
            } else {
                const newPaths = new Set([...prev.includeDocsPages, ...folderPaths]);
                return {
                    ...prev,
                    includeDocsPages: Array.from(newPaths),
                };
            }
        });
    }

    const filteredDocsPages = docsPages.filter(page =>
        page.title.toLowerCase().includes(docsSearchQuery.toLowerCase()) ||
        page.path.toLowerCase().includes(docsSearchQuery.toLowerCase())
    );

    const rootPages = filteredDocsPages.filter(p => !p.folder);
    const pagesByFolder = docsFolders.reduce((acc, folder) => {
        acc[folder] = filteredDocsPages.filter(p => p.folder === folder);
        return acc;
    }, {} as Record<string, DocsPage[]>);

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

            {ReactDOM.createPortal(
                <div
                    className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[100]"
                    onClick={onClose}
                />,
                document.body
            )}

            {ReactDOM.createPortal(
                <div className="fixed top-0 right-0 h-screen w-[800px] bg-[#0d0d0d]/70 backdrop-blur-xl border-l border-gray-700/50 shadow-2xl z-[110] flex flex-col">
                    <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700/50 bg-[#1a1a1a]/70">
                        <div>
                            <h2 className="text-lg font-semibold text-gray-100 font-mono">
                                {isRunning ? 'Terminal' : 'AI Work Session'}
                            </h2>
                            <p className="text-sm text-gray-400 mt-1 font-mono">
                                {ticketId}
                            </p>
                        </div>
                        <button
                            onClick={onClose}
                            className="text-gray-400 hover:text-gray-300"
                        >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    <div className="px-6 py-4 border-b border-gray-700/50">
                        {/* Claude Session Indicator */}
                        {!isRunning && claudeSessionExists && (
                            <div className="mb-4 p-3 rounded-lg border border-blue-500/30 bg-blue-500/10">
                                <div className="flex items-center gap-2 text-blue-400">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    <span className="text-sm">
                                        Previous session found - {shouldResumeSession ? 'will resume' : 'will start fresh'}
                                        {!shouldResumeSession && <span className="text-gray-500 ml-1">(toggle in Advanced Options)</span>}
                                    </span>
                                </div>
                            </div>
                        )}

                        {/* Provider + Agent Dropdowns Row */}
                        <div className="flex gap-3">
                            <div className="flex-1">
                                <label className="block text-sm font-medium text-gray-300 mb-2 font-mono">
                                    Provider
                                </label>
                                <select
                                    value={selectedProvider}
                                    onChange={(e) => setSelectedProvider(e.target.value as AIProvider)}
                                    disabled={isRunning}
                                    className="w-full px-3 py-2 bg-[#1a1a1a] border border-gray-700 rounded-lg text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {AI_PROVIDERS.map((provider) => (
                                        <option key={provider.id} value={provider.id}>
                                            {provider.name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="flex-1">
                                <label className="block text-sm font-medium text-gray-300 mb-2 font-mono">
                                    System Prompt
                                </label>
                                <select
                                    value={selectedAgent}
                                    onChange={(e) => setSelectedAgent(e.target.value)}
                                    disabled={isRunning}
                                    className="w-full px-3 py-2 bg-[#1a1a1a] border border-gray-700 rounded-lg text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {aiAgents.length === 0 ? (
                                        <option>No agents available</option>
                                    ) : (
                                        aiAgents.map((agent) => (
                                            <option key={agent.id} value={agent.id}>
                                                {agent.name}
                                            </option>
                                        ))
                                    )}
                                </select>
                            </div>

                            <div className="flex items-end">
                                <button
                                    onClick={async () => {
                                        if (isRunning) {
                                            try {
                                                await fetch(`/api/kill-pty-internal?ticketId=${ticketId}`, {
                                                    method: 'POST',
                                                });
                                            } catch (err) {
                                                console.error('Failed to stop PTY:', err);
                                            }
                                            setIsRunning(false);
                                        } else {
                                            handleStart();
                                        }
                                    }}
                                    disabled={!selectedAgent || aiAgents.length === 0}
                                    className={`px-6 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm ${isRunning
                                        ? 'bg-red-600 hover:bg-red-700 text-white'
                                        : (worktreeStatus?.status === 'ready' || (claudeSessionExists && shouldResumeSession))
                                            ? 'bg-blue-600 hover:bg-blue-700 text-white'
                                            : 'bg-purple-600 hover:bg-purple-700 text-white'
                                        }`}
                                >
                                    {isRunning ? '⏹ Stop' : (worktreeStatus?.status === 'ready' || (claudeSessionExists && shouldResumeSession)) ? '▶ Resume' : '▶ Start'}
                                </button>
                            </div>
                        </div>

                        {/* Branch Toggle Row */}
                        {!isRunning && (
                            <div className="mt-4 p-3 rounded-lg border border-gray-700/50 bg-[#1a1a1a]/50">
                                <div className="flex items-center justify-between">
                                    <label className="text-sm font-medium text-gray-300">Create New Branch</label>
                                    <button
                                        onClick={() => setCreateNewBranch(!createNewBranch)}
                                        disabled={isRunning}
                                        className={`w-12 h-6 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${createNewBranch ? 'bg-purple-600' : 'bg-gray-700'}`}
                                    >
                                        <div className={`w-5 h-5 bg-white rounded-full shadow transform transition-transform ${createNewBranch ? 'translate-x-6' : 'translate-x-0.5'}`} />
                                    </button>
                                </div>

                                {/* Base Branch Selector - shown when creating new branch */}
                                {createNewBranch && (
                                    <div className="mt-3 pt-3 border-t border-gray-700/50">
                                        <div className="flex items-center gap-3">
                                            <label htmlFor="baseBranchSelect" className="text-sm font-medium text-gray-400 whitespace-nowrap">
                                                Base Branch:
                                            </label>
                                            {branchesLoading ? (
                                                <div className="flex items-center gap-2 text-gray-400 text-sm">
                                                    <div className="w-3 h-3 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                                                    Loading branches...
                                                </div>
                                            ) : branchesError ? (
                                                <div className="flex items-center gap-2">
                                                    <span className="text-red-400 text-sm">{branchesError}</span>
                                                    <button
                                                        onClick={() => {
                                                            setBranchesLoading(true);
                                                            setBranchesError(null);
                                                            fetch('/api/branches')
                                                                .then(res => res.json())
                                                                .then(data => {
                                                                    setBranches(data.branches || []);
                                                                    const defaultBranch = data.defaultBranch || 'main';
                                                                    setExecutionOptions(prev => ({
                                                                        ...prev,
                                                                        baseBranch: defaultBranch,
                                                                        mergeBranch: defaultBranch,
                                                                    }));
                                                                    setBranchesLoading(false);
                                                                })
                                                                .catch(() => {
                                                                    setBranchesError('Failed to load branches');
                                                                    setBranchesLoading(false);
                                                                });
                                                        }}
                                                        className="text-purple-400 hover:text-purple-300 text-sm underline"
                                                    >
                                                        Retry
                                                    </button>
                                                </div>
                                            ) : (
                                                <select
                                                    id="baseBranchSelect"
                                                    value={executionOptions.baseBranch || 'main'}
                                                    onChange={(e) => {
                                                        const newBranch = e.target.value;
                                                        setExecutionOptions(prev => ({
                                                            ...prev,
                                                            baseBranch: newBranch,
                                                            mergeBranch: newBranch, // Sync merge target by default
                                                        }));
                                                        // Show warning when main is selected
                                                        if (newBranch === 'main') {
                                                            setShowMainWarning(true);
                                                        } else {
                                                            setShowMainWarning(false);
                                                        }
                                                    }}
                                                    disabled={isRunning}
                                                    className="flex-1 px-3 py-1.5 bg-[#1a1a1a] border border-gray-700 rounded-lg text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    {branches.map((branch) => (
                                                        <option key={branch} value={branch}>
                                                            {branch}
                                                        </option>
                                                    ))}
                                                </select>
                                            )}
                                        </div>

                                        {/* Merge Target Selector */}
                                        {!branchesLoading && !branchesError && (
                                            <div className="flex items-center gap-3 mt-2">
                                                <label htmlFor="mergeBranchSelect" className="text-sm font-medium text-gray-400 whitespace-nowrap">
                                                    Merge Target:
                                                </label>
                                                <select
                                                    id="mergeBranchSelect"
                                                    value={executionOptions.mergeBranch || executionOptions.baseBranch || 'main'}
                                                    onChange={(e) => {
                                                        setExecutionOptions(prev => ({
                                                            ...prev,
                                                            mergeBranch: e.target.value,
                                                        }));
                                                    }}
                                                    disabled={isRunning}
                                                    className="flex-1 px-3 py-1.5 bg-[#1a1a1a] border border-gray-700 rounded-lg text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    {branches.map((branch) => (
                                                        <option key={branch} value={branch}>
                                                            {branch}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                        )}

                                        {/* Main Branch Warning */}
                                        {showMainWarning && executionOptions.baseBranch === 'main' && (
                                            <div className="mt-3 p-2.5 rounded-lg border border-yellow-500/30 bg-yellow-500/10">
                                                <div className="flex items-start gap-2">
                                                    <svg className="w-4 h-4 text-yellow-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                                    </svg>
                                                    <div className="flex-1">
                                                        <p className="text-sm text-yellow-400 font-medium">Branching from main</p>
                                                        <p className="text-xs text-yellow-400/70 mt-0.5">
                                                            Consider using a development branch instead for better isolation.
                                                        </p>
                                                    </div>
                                                    <button
                                                        onClick={() => setShowMainWarning(false)}
                                                        className="text-yellow-400/70 hover:text-yellow-400 p-0.5"
                                                        aria-label="Dismiss warning"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                        </svg>
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                <div className="mt-2 text-xs">
                                    {worktreeLoading ? (
                                        <span className="text-gray-400 flex items-center gap-2">
                                            <div className="w-3 h-3 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                                            Checking branch status...
                                        </span>
                                    ) : createNewBranch ? (
                                        // Toggle ON - check if branch already exists
                                        (worktreeStatus?.status === 'ready' || worktreeStatus?.status === 'needs-worktree') ? (
                                            <span className="text-yellow-400">
                                                Branch <code className="px-1.5 py-0.5 bg-gray-800 rounded text-yellow-300">{ticketId}</code> already exists - will use existing
                                            </span>
                                        ) : (
                                            <span className="text-purple-400">
                                                Will create branch: <code className="px-1.5 py-0.5 bg-gray-800 rounded text-purple-300">{ticketId}</code>
                                            </span>
                                        )
                                    ) : (
                                        // Toggle OFF - show current status
                                        worktreeStatus?.status === 'ready' ? (
                                            <span className="text-green-400">
                                                Using existing branch: <code className="px-1.5 py-0.5 bg-gray-800 rounded text-green-300">{ticketId}</code>
                                            </span>
                                        ) : worktreeStatus?.status === 'needs-worktree' ? (
                                            <span className="text-green-400">
                                                Branch <code className="px-1.5 py-0.5 bg-gray-800 rounded text-green-300">{ticketId}</code> exists - worktree will be created
                                            </span>
                                        ) : (
                                            <span className="text-gray-400">
                                                No branch for this ticket yet - will work on current branch
                                            </span>
                                        )
                                    )}
                                </div>
                            </div>
                        )}

                        {!isRunning && (
                            <button
                                onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
                                className="mt-3 text-sm text-purple-400 hover:text-purple-300 flex items-center gap-2 font-mono"
                            >
                                <svg
                                    className={`w-4 h-4 transition-transform ${showAdvancedOptions ? 'rotate-180' : ''}`}
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                >
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                                Advanced Options
                            </button>
                        )}

                        {!isRunning && showAdvancedOptions && (
                            <div className="mt-4 p-4 bg-[#1a1a1a]/70 border border-gray-700/50 rounded-lg space-y-4">
                                {/* Resume Session Toggle - only show if session exists */}
                                {claudeSessionExists && (
                                    <div className="flex items-center justify-between p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                                        <div>
                                            <label className="text-sm font-medium text-blue-300">Resume Previous Session</label>
                                            <p className="text-xs text-gray-400 mt-1">Continue from where you left off in the last session</p>
                                        </div>
                                        <button
                                            onClick={() => setShouldResumeSession(!shouldResumeSession)}
                                            className={`w-12 h-6 rounded-full transition-colors ${shouldResumeSession ? 'bg-blue-600' : 'bg-gray-700'}`}
                                        >
                                            <div className={`w-5 h-5 bg-white rounded-full shadow transform transition-transform ${shouldResumeSession ? 'translate-x-6' : 'translate-x-0.5'}`} />
                                        </button>
                                    </div>
                                )}

                                <div className="flex items-center justify-between">
                                    <div>
                                        <label className="text-sm font-medium text-gray-300">Skip Permission Prompts</label>
                                        <p className="text-xs text-gray-500 mt-1">Run without asking for permission on each action</p>
                                    </div>
                                    <button
                                        onClick={() => setExecutionOptions(prev => ({ ...prev, skipPermissions: !prev.skipPermissions }))}
                                        className={`w-12 h-6 rounded-full transition-colors ${executionOptions.skipPermissions ? 'bg-purple-600' : 'bg-gray-700'}`}
                                    >
                                        <div className={`w-5 h-5 bg-white rounded-full shadow transform transition-transform ${executionOptions.skipPermissions ? 'translate-x-6' : 'translate-x-0.5'}`} />
                                    </button>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">Execution Mode</label>
                                    <div className="flex gap-3">
                                        <button
                                            onClick={() => setExecutionOptions(prev => ({ ...prev, executionMode: 'normal' }))}
                                            className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${executionOptions.executionMode === 'normal'
                                                ? 'bg-purple-600 text-white'
                                                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                                                }`}
                                        >
                                            Normal
                                        </button>
                                        <button
                                            onClick={() => setExecutionOptions(prev => ({ ...prev, executionMode: 'plan-only' }))}
                                            className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${executionOptions.executionMode === 'plan-only'
                                                ? 'bg-purple-600 text-white'
                                                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                                                }`}
                                        >
                                            Plan First
                                        </button>
                                    </div>
                                </div>

                                {relatedTickets.length > 0 && (
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <label className="text-sm font-medium text-gray-300">Include Related Tickets</label>
                                            <p className="text-xs text-gray-500 mt-1">
                                                {relatedTickets.length} linked ticket{relatedTickets.length !== 1 ? 's' : ''} found
                                            </p>
                                        </div>
                                        <button
                                            onClick={() => setExecutionOptions(prev => ({ ...prev, includeRelatedTickets: !prev.includeRelatedTickets }))}
                                            className={`w-12 h-6 rounded-full transition-colors ${executionOptions.includeRelatedTickets ? 'bg-purple-600' : 'bg-gray-700'}`}
                                        >
                                            <div className={`w-5 h-5 bg-white rounded-full shadow transform transition-transform ${executionOptions.includeRelatedTickets ? 'translate-x-6' : 'translate-x-0.5'}`} />
                                        </button>
                                    </div>
                                )}

                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">
                                        Include Docs Pages as Context
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="Search docs pages..."
                                        value={docsSearchQuery}
                                        onChange={(e) => setDocsSearchQuery(e.target.value)}
                                        className="w-full px-3 py-2 bg-[#0d0d0d] border border-gray-700 rounded-lg text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 mb-2"
                                    />
                                    <div className="max-h-48 overflow-y-auto p-2 bg-[#0d0d0d] border border-gray-700 rounded-lg">
                                        {filteredDocsPages.length === 0 ? (
                                            <p className="text-xs text-gray-500 text-center py-2">No docs pages found</p>
                                        ) : (
                                            <div className="space-y-1">
                                                {docsFolders.map((folder) => {
                                                    const folderPages = pagesByFolder[folder] || [];
                                                    if (folderPages.length === 0) return null;

                                                    const isExpanded = expandedFolders.has(folder);
                                                    const selectedCount = folderPages.filter(p =>
                                                        executionOptions.includeDocsPages.includes(p.path)
                                                    ).length;
                                                    const allSelected = selectedCount === folderPages.length;

                                                    return (
                                                        <div key={folder}>
                                                            <div className="flex items-center gap-1 hover:bg-gray-800 rounded">
                                                                <button
                                                                    onClick={() => toggleFolder(folder)}
                                                                    className="flex-1 flex items-center gap-2 px-2 py-1.5 text-sm text-gray-300"
                                                                >
                                                                    <svg
                                                                        className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                                                                        fill="none"
                                                                        viewBox="0 0 24 24"
                                                                        stroke="currentColor"
                                                                    >
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                                    </svg>
                                                                    <span className="truncate">{folder}</span>
                                                                    <span className="text-xs text-gray-500 ml-auto">
                                                                        {selectedCount > 0 && `${selectedCount}/`}{folderPages.length}
                                                                    </span>
                                                                </button>
                                                                <button
                                                                    onClick={() => selectAllInFolder(folder)}
                                                                    className={`px-2 py-1 text-xs rounded ${allSelected ? 'text-purple-400' : 'text-gray-500'}`}
                                                                >
                                                                    {allSelected ? '✓' : '○'}
                                                                </button>
                                                            </div>
                                                            {isExpanded && (
                                                                <div className="ml-5 space-y-0.5">
                                                                    {folderPages.map((page) => (
                                                                        <label
                                                                            key={page.path}
                                                                            className="flex items-center gap-2 px-2 py-1 hover:bg-gray-800 rounded cursor-pointer"
                                                                        >
                                                                            <input
                                                                                type="checkbox"
                                                                                checked={executionOptions.includeDocsPages.includes(page.path)}
                                                                                onChange={() => toggleDocsPage(page.path)}
                                                                                className="w-3.5 h-3.5 rounded border-gray-600 bg-gray-800 text-purple-600"
                                                                            />
                                                                            <span className="text-sm text-gray-400 truncate">{page.title}</span>
                                                                        </label>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}

                                                {rootPages.length > 0 && (
                                                    <div className="pt-1 border-t border-gray-800 mt-1">
                                                        {rootPages.map((page) => (
                                                            <label
                                                                key={page.path}
                                                                className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-800 rounded cursor-pointer"
                                                            >
                                                                <input
                                                                    type="checkbox"
                                                                    checked={executionOptions.includeDocsPages.includes(page.path)}
                                                                    onChange={() => toggleDocsPage(page.path)}
                                                                    className="w-3.5 h-3.5 rounded border-gray-600 bg-gray-800 text-purple-600"
                                                                />
                                                                <span className="text-sm text-gray-300 truncate">{page.title}</span>
                                                            </label>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                    {executionOptions.includeDocsPages.length > 0 && (
                                        <p className="text-xs text-purple-400 mt-2">
                                            {executionOptions.includeDocsPages.length} page{executionOptions.includeDocsPages.length !== 1 ? 's' : ''} selected
                                        </p>
                                    )}
                                </div>

                                <div className="mt-4">
                                    <label className="block text-sm font-medium text-gray-300 mb-2">
                                        Include Repository Files as Context
                                    </label>
                                    <RepoFileSelector
                                        selectedFiles={executionOptions.includeRepoFiles}
                                        onSelectionChange={(files) => setExecutionOptions(prev => ({
                                            ...prev,
                                            includeRepoFiles: files,
                                        }))}
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="flex-1 p-4 overflow-hidden">
                        {isRunning && <div ref={terminalRef} className="h-full" />}
                    </div>

                    <div className="px-6 py-3 border-t border-gray-700/50 bg-[#1a1a1a]/70 flex items-center justify-between">
                        <div className="text-xs text-gray-500 font-mono">
                            {isRunning ? (
                                <span>
                                    Instructions didn't paste?{' '}
                                    <button
                                        onClick={() => {
                                            if (socketRef.current) {
                                                socketRef.current.emit('paste-instructions');
                                            }
                                        }}
                                        className="text-purple-400 hover:text-purple-300 underline"
                                    >
                                        Click to trigger manually
                                    </button>
                                </span>
                            ) : (
                                'Select an agent to begin'
                            )}
                        </div>
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-sm border border-gray-700 text-gray-300 rounded-lg hover:bg-gray-800 transition-colors font-mono"
                        >
                            Close
                        </button>
                    </div>
                </div>,
                document.body
            )}
        </>
    );
}
