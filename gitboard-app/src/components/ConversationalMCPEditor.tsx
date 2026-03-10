'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import type { Socket } from 'socket.io-client';
import { saveMCP, deleteMCP } from '@/app/actions';
import type { MCPConfig } from '@/lib/schemas';

interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
}

interface ConversationalMCPEditorProps {
    isOpen: boolean;
    onClose: () => void;
    mcp?: MCPConfig;
}

const SUGGESTED_PROMPTS = [
    { label: 'Filesystem', prompt: 'I want to add a filesystem MCP server for reading files' },
    { label: 'GitHub', prompt: 'Help me configure a GitHub MCP server' },
    { label: 'Slack', prompt: 'I need a Slack MCP server for messaging' },
    { label: 'Database', prompt: 'I want to connect to a PostgreSQL database via MCP' },
];

export function ConversationalMCPEditor({ isOpen, onClose, mcp }: ConversationalMCPEditorProps) {
    const [messages, setMessages] = useState<Message[]>([]);
    const [inputValue, setInputValue] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isConnected, setIsConnected] = useState(false);
    const [connectionError, setConnectionError] = useState<string | null>(null);
    const [streamingMessage, setStreamingMessage] = useState('');
    const [mounted, setMounted] = useState(false);

    // Form state for manual editing
    const [editedMCP, setEditedMCP] = useState<Partial<MCPConfig>>({});
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [validating, setValidating] = useState(false);
    const [validationResult, setValidationResult] = useState<{ valid: boolean; issues: string[] } | null>(null);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const socketRef = useRef<Socket | null>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);
    const streamingMessageRef = useRef('');
    const streamingInactivityRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        setMounted(true);
    }, []);

    // Initialize form with MCP data
    useEffect(() => {
        if (mcp) {
            setEditedMCP({
                id: mcp.id,
                name: mcp.name,
                description: mcp.description,
                command: mcp.command,
                args: mcp.args,
                env: mcp.env,
                enabled: mcp.enabled,
            });
        } else {
            setEditedMCP({});
        }
    }, [mcp]);

    // Auto-scroll to bottom when messages change
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, streamingMessage]);

    // Setup socket event handlers
    const setupSocketHandlers = useCallback((socket: Socket) => {
        socket.on('stream', (data: { content: string }) => {
            streamingMessageRef.current += data.content;
            setStreamingMessage(streamingMessageRef.current);

            if (streamingInactivityRef.current) {
                clearTimeout(streamingInactivityRef.current);
            }
            streamingInactivityRef.current = setTimeout(() => {
                if (streamingMessageRef.current) {
                    const assistantMessage: Message = {
                        id: crypto.randomUUID(),
                        role: 'assistant',
                        content: streamingMessageRef.current,
                        timestamp: new Date().toISOString(),
                    };
                    setMessages((prev) => [...prev, assistantMessage]);
                }
                streamingMessageRef.current = '';
                setStreamingMessage('');
                setIsLoading(false);
            }, 15000);
        });

        socket.on('mcp-generated', (data: { mcp: Partial<MCPConfig> }) => {
            setEditedMCP(prev => ({ ...prev, ...data.mcp }));
        });

        socket.on('complete', (data: { content: string }) => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
                timeoutRef.current = null;
            }
            if (streamingInactivityRef.current) {
                clearTimeout(streamingInactivityRef.current);
                streamingInactivityRef.current = null;
            }
            const assistantMessage: Message = {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: data.content || streamingMessageRef.current,
                timestamp: new Date().toISOString(),
            };
            setMessages((prev) => [...prev, assistantMessage]);
            streamingMessageRef.current = '';
            setStreamingMessage('');
            setIsLoading(false);
        });

        socket.on('error', (error: string) => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
                timeoutRef.current = null;
            }
            console.error('MCP editor error:', error);
            const errorMessage: Message = {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: `Error: ${error}`,
                timestamp: new Date().toISOString(),
            };
            setMessages((prev) => [...prev, errorMessage]);
            streamingMessageRef.current = '';
            setStreamingMessage('');
            setIsLoading(false);
        });
    }, []);

    // Connect socket when modal opens
    useEffect(() => {
        if (!isOpen) return;

        let mounted = true;

        async function connectSocket() {
            try {
                const { io } = await import('socket.io-client');
                const socket = io('/mcp-creator', {
                    timeout: 10000,
                });

                socket.on('connect', () => {
                    if (mounted) {
                        setIsConnected(true);
                        setConnectionError(null);
                    }
                });

                socket.on('connect_error', (err) => {
                    if (mounted) {
                        console.error('Socket connection error:', err);
                        setIsConnected(false);
                        setConnectionError('Failed to connect to server');
                    }
                });

                socket.on('disconnect', () => {
                    if (mounted) {
                        setIsConnected(false);
                    }
                });

                setupSocketHandlers(socket);
                socketRef.current = socket;
            } catch (error) {
                console.error('Failed to initialize socket:', error);
                if (mounted) {
                    setConnectionError('Failed to initialize connection');
                }
            }
        }

        connectSocket();

        return () => {
            mounted = false;
            if (socketRef.current) {
                socketRef.current.disconnect();
                socketRef.current = null;
            }
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
            if (streamingInactivityRef.current) {
                clearTimeout(streamingInactivityRef.current);
            }
        };
    }, [isOpen, setupSocketHandlers]);

    // Reset state when panel closes
    useEffect(() => {
        if (!isOpen) {
            setMessages([]);
            setInputValue('');
            streamingMessageRef.current = '';
            setStreamingMessage('');
            setIsLoading(false);
            setShowDeleteConfirm(false);
            setValidationResult(null);
        }
    }, [isOpen]);

    function handlePromptClick(prompt: string) {
        setInputValue(prompt);
        inputRef.current?.focus();
    }

    async function handleSendMessage() {
        if (!inputValue.trim() || isLoading) return;

        if (!socketRef.current || !isConnected) {
            setConnectionError('Not connected to server. Please wait or try reopening.');
            return;
        }

        const userMessage: Message = {
            id: crypto.randomUUID(),
            role: 'user',
            content: inputValue.trim(),
            timestamp: new Date().toISOString(),
        };

        setMessages((prev) => [...prev, userMessage]);
        setInputValue('');
        setIsLoading(true);
        streamingMessageRef.current = '';
        setStreamingMessage('');

        timeoutRef.current = setTimeout(() => {
            const errorMessage: Message = {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: 'Request timed out. Please try again.',
                timestamp: new Date().toISOString(),
            };
            setMessages((prev) => [...prev, errorMessage]);
            streamingMessageRef.current = '';
            setStreamingMessage('');
            setIsLoading(false);
        }, 60000);

        socketRef.current.emit('create-mcp', {
            message: userMessage.content,
            history: messages.map((m) => ({
                role: m.role,
                content: m.content,
            })),
            currentMCP: editedMCP,
        });
    }

    async function handleValidate() {
        setValidating(true);
        setValidationResult(null);

        try {
            const response = await fetch('/api/mcp/validate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ config: editedMCP, testServer: false }),
            });

            const data = await response.json();
            if (data.success) {
                setValidationResult(data.validation);
            }
        } catch (error) {
            console.error('Validation error:', error);
        } finally {
            setValidating(false);
        }
    }

    async function handleSave() {
        if (!editedMCP.name || !editedMCP.command) {
            alert('Name and command are required');
            return;
        }

        setIsLoading(true);
        try {
            const result = await saveMCP({
                id: editedMCP.id || editedMCP.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
                name: editedMCP.name,
                description: editedMCP.description,
                command: editedMCP.command,
                args: editedMCP.args || [],
                env: editedMCP.env || {},
            });

            if (result.success) {
                onClose();
                window.location.reload();
            }
        } catch (error) {
            console.error('Failed to save MCP:', error);
            alert('Failed to save MCP configuration');
        } finally {
            setIsLoading(false);
        }
    }

    async function handleDelete() {
        if (!mcp?.id) return;

        setIsLoading(true);
        try {
            const result = await deleteMCP(mcp.id);
            if (result.success) {
                onClose();
                window.location.reload();
            }
        } catch (error) {
            console.error('Failed to delete MCP:', error);
            alert('Failed to delete MCP configuration');
        } finally {
            setIsLoading(false);
        }
    }

    function handleKeyDown(e: React.KeyboardEvent) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    }

    if (!mounted || !isOpen) return null;

    const isNewMCP = !mcp;
    const showWelcome = messages.length === 0;

    return (
        <>
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
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-6">
                    <div
                        className="w-[90vw] h-[85vh] max-w-[1400px] bg-white dark:bg-[#0d0d0d] border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl flex flex-col overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#1a1a1a]">
                            <div>
                                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                                    {isNewMCP ? 'Configure MCP Server' : `Edit: ${mcp?.name}`}
                                </h2>
                                <div className="flex items-center gap-2 mt-0.5">
                                    <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-yellow-500 animate-pulse'}`} />
                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                        {connectionError ? connectionError : isConnected ? 'AI assistant ready' : 'Connecting...'}
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={onClose}
                                className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 p-1"
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {/* Body - Two Column Layout */}
                        <div className="flex-1 flex overflow-hidden">
                            {/* Left Panel - Chat (55%) */}
                            <div className="w-[55%] flex flex-col overflow-hidden border-r border-gray-200 dark:border-gray-700">
                                {/* Messages Area */}
                                <div className="flex-1 overflow-y-auto p-6">
                                    {showWelcome ? (
                                        <div className="h-full flex flex-col items-center justify-center text-center px-4">
                                            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-purple-400 to-blue-600 flex items-center justify-center">
                                                <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
                                                </svg>
                                            </div>
                                            <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
                                                {isNewMCP ? 'Configure MCP Server' : 'Edit MCP Configuration'}
                                            </h3>
                                            <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-sm">
                                                {isNewMCP
                                                    ? "Tell me what MCP server you want to configure. I'll help you set up the command, arguments, and environment variables."
                                                    : "Ask me to help modify this MCP configuration, or edit the form directly on the right."
                                                }
                                            </p>

                                            {/* Suggested Prompts */}
                                            {isNewMCP && (
                                                <div className="flex flex-wrap gap-2 mb-4 justify-center">
                                                    {SUGGESTED_PROMPTS.map((suggestion, index) => (
                                                        <button
                                                            key={index}
                                                            onClick={() => handlePromptClick(suggestion.prompt)}
                                                            className="px-3 py-1.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full text-xs text-gray-700 dark:text-gray-400 transition-colors border border-gray-200 dark:border-gray-700"
                                                        >
                                                            {suggestion.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="space-y-4">
                                            {messages.map((message) => (
                                                <div
                                                    key={message.id}
                                                    className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                                                >
                                                    <div
                                                        className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                                                            message.role === 'user'
                                                                ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white'
                                                                : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
                                                        }`}
                                                    >
                                                        <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                                                    </div>
                                                </div>
                                            ))}

                                            {streamingMessage && (
                                                <div className="flex justify-start">
                                                    <div className="max-w-[85%] rounded-2xl px-4 py-3 bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100">
                                                        <p className="text-sm whitespace-pre-wrap">{streamingMessage}</p>
                                                    </div>
                                                </div>
                                            )}

                                            {isLoading && !streamingMessage && (
                                                <div className="flex justify-start">
                                                    <div className="px-4 py-3 bg-gray-100 dark:bg-gray-800 rounded-2xl">
                                                        <div className="flex gap-1">
                                                            <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                                            <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                                            <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            <div ref={messagesEndRef} />
                                        </div>
                                    )}
                                </div>

                                {/* Chat Input */}
                                <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#1a1a1a]">
                                    <div className="relative">
                                        <textarea
                                            ref={inputRef}
                                            value={inputValue}
                                            onChange={(e) => setInputValue(e.target.value)}
                                            onKeyDown={handleKeyDown}
                                            placeholder={showWelcome ? "What MCP server do you want to configure?" : "Ask AI to help with your configuration..."}
                                            rows={3}
                                            disabled={isLoading}
                                            className="w-full px-4 py-3 pr-14 border border-gray-300 dark:border-gray-700 rounded-xl bg-white dark:bg-[#0d0d0d] text-gray-900 dark:text-gray-100 resize-none focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:opacity-50 text-sm"
                                        />
                                        <button
                                            onClick={handleSendMessage}
                                            disabled={!inputValue.trim() || isLoading || !isConnected}
                                            className="absolute right-3 bottom-3 p-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                                        >
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                                            </svg>
                                        </button>
                                    </div>
                                    <p className="text-xs text-gray-500 mt-2">
                                        Press Enter to send, Shift+Enter for new line
                                    </p>
                                </div>
                            </div>

                            {/* Right Panel - Form (45%) */}
                            <div className="w-[45%] flex flex-col overflow-hidden bg-white dark:bg-[#0d0d0d]">
                                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                                    {/* Name */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name</label>
                                        <input
                                            type="text"
                                            value={editedMCP.name || ''}
                                            onChange={(e) => setEditedMCP({ ...editedMCP, name: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-[#1a1a1a] text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
                                            placeholder="e.g., Filesystem MCP"
                                        />
                                    </div>

                                    {/* Description */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
                                        <textarea
                                            value={editedMCP.description || ''}
                                            onChange={(e) => setEditedMCP({ ...editedMCP, description: e.target.value })}
                                            rows={2}
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-[#1a1a1a] text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                                            placeholder="What does this MCP server do?"
                                        />
                                    </div>

                                    {/* Command */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Command</label>
                                        <input
                                            type="text"
                                            value={editedMCP.command || ''}
                                            onChange={(e) => setEditedMCP({ ...editedMCP, command: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-[#1a1a1a] text-gray-900 dark:text-gray-100 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                                            placeholder="e.g., npx, node, python"
                                        />
                                    </div>

                                    {/* Arguments */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                            Arguments <span className="text-gray-500 font-normal">(one per line)</span>
                                        </label>
                                        <textarea
                                            value={(editedMCP.args || []).join('\n')}
                                            onChange={(e) => setEditedMCP({ ...editedMCP, args: e.target.value.split('\n').filter(a => a.trim()) })}
                                            rows={4}
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-[#1a1a1a] text-gray-900 dark:text-gray-100 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                                            placeholder={"-y\n@modelcontextprotocol/server-filesystem\n/path/to/directory"}
                                        />
                                    </div>

                                    {/* Environment Variables */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                            Environment Variables
                                        </label>
                                        <div className="space-y-2">
                                            {Object.entries(editedMCP.env || {}).map(([key, value]) => (
                                                <div key={key} className="flex gap-2">
                                                    <input
                                                        type="text"
                                                        value={key}
                                                        readOnly
                                                        className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-mono text-sm"
                                                    />
                                                    <input
                                                        type="password"
                                                        value={value}
                                                        onChange={(e) => {
                                                            const newEnv = { ...editedMCP.env, [key]: e.target.value };
                                                            setEditedMCP({ ...editedMCP, env: newEnv });
                                                        }}
                                                        className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-[#1a1a1a] text-gray-900 dark:text-gray-100 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                                                    />
                                                    <button
                                                        onClick={() => {
                                                            const newEnv = { ...editedMCP.env };
                                                            delete newEnv[key];
                                                            setEditedMCP({ ...editedMCP, env: newEnv });
                                                        }}
                                                        className="px-3 py-2 text-red-600 dark:text-red-400 hover:text-red-500 dark:hover:text-red-300"
                                                    >
                                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                        </svg>
                                                    </button>
                                                </div>
                                            ))}
                                            <button
                                                onClick={() => {
                                                    const key = prompt('Enter environment variable name:');
                                                    if (key) {
                                                        setEditedMCP({
                                                            ...editedMCP,
                                                            env: { ...editedMCP.env, [key]: '' },
                                                        });
                                                    }
                                                }}
                                                className="text-sm text-purple-600 dark:text-purple-400 hover:text-purple-500 dark:hover:text-purple-300"
                                            >
                                                + Add environment variable
                                            </button>
                                        </div>
                                    </div>

                                    {/* Validation Result */}
                                    {validationResult && (
                                        <div className={`p-3 rounded-lg border ${validationResult.valid ? 'border-green-500/50 bg-green-500/10' : 'border-red-500/50 bg-red-500/10'}`}>
                                            <div className="flex items-center gap-2">
                                                {validationResult.valid ? (
                                                    <>
                                                        <svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                        </svg>
                                                        <span className="text-sm text-green-400">Configuration is valid</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                                        </svg>
                                                        <span className="text-sm text-red-400">Configuration has issues</span>
                                                    </>
                                                )}
                                            </div>
                                            {validationResult.issues.length > 0 && (
                                                <ul className="mt-2 text-xs text-red-300 space-y-1">
                                                    {validationResult.issues.map((issue, i) => (
                                                        <li key={i}>- {issue}</li>
                                                    ))}
                                                </ul>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Footer */}
                                <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#1a1a1a] flex items-center justify-between">
                                    <div className="flex gap-2">
                                        {!isNewMCP && (
                                            showDeleteConfirm ? (
                                                <>
                                                    <button
                                                        onClick={handleDelete}
                                                        disabled={isLoading}
                                                        className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                                                    >
                                                        Confirm Delete
                                                    </button>
                                                    <button
                                                        onClick={() => setShowDeleteConfirm(false)}
                                                        className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-300"
                                                    >
                                                        Cancel
                                                    </button>
                                                </>
                                            ) : (
                                                <button
                                                    onClick={() => setShowDeleteConfirm(true)}
                                                    className="px-3 py-1.5 text-sm text-red-600 dark:text-red-400 hover:text-red-500 dark:hover:text-red-300"
                                                >
                                                    Delete
                                                </button>
                                            )
                                        )}
                                        <button
                                            onClick={handleValidate}
                                            disabled={validating || !editedMCP.command}
                                            className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-300 disabled:opacity-50"
                                        >
                                            {validating ? 'Validating...' : 'Validate'}
                                        </button>
                                    </div>
                                    <button
                                        onClick={handleSave}
                                        disabled={isLoading || !editedMCP.name || !editedMCP.command}
                                        className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                                    >
                                        {isLoading ? 'Saving...' : 'Save Configuration'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </>
    );
}
