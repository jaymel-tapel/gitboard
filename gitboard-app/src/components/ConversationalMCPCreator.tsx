'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import type { Socket } from 'socket.io-client';
import { saveMCP } from '@/app/actions';
import type { MCPConfig } from '@/lib/schemas';

interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
}

interface ConversationalMCPCreatorProps {
    isOpen: boolean;
    onClose: () => void;
    onMCPCreated: (mcp: MCPConfig) => void;
}

const SUGGESTED_PROMPTS = [
    { label: 'Filesystem', prompt: 'I want to add a filesystem MCP server for reading files' },
    { label: 'GitHub', prompt: 'Help me configure a GitHub MCP server' },
    { label: 'Slack', prompt: 'I need a Slack MCP server for messaging' },
    { label: 'Database', prompt: 'I want to connect to a PostgreSQL database via MCP' },
];

export function ConversationalMCPCreator({ isOpen, onClose, onMCPCreated }: ConversationalMCPCreatorProps) {
    const [messages, setMessages] = useState<Message[]>([]);
    const [inputValue, setInputValue] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isConnected, setIsConnected] = useState(false);
    const [connectionError, setConnectionError] = useState<string | null>(null);
    const [streamingMessage, setStreamingMessage] = useState('');
    const [generatedMCP, setGeneratedMCP] = useState<Partial<MCPConfig> | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const socketRef = useRef<Socket | null>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);
    const streamingMessageRef = useRef('');
    const streamingInactivityRef = useRef<NodeJS.Timeout | null>(null);

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
                console.warn('Streaming inactivity timeout - forcing loading state reset');
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
                if (timeoutRef.current) {
                    clearTimeout(timeoutRef.current);
                    timeoutRef.current = null;
                }
            }, 15000);
        });

        socket.on('mcp-generated', (data: { mcp: Partial<MCPConfig> }) => {
            setGeneratedMCP(data.mcp);
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
            if (streamingInactivityRef.current) {
                clearTimeout(streamingInactivityRef.current);
                streamingInactivityRef.current = null;
            }
            console.error('MCP creator error:', error);
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
                        console.log('MCP creator socket connected');
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
                timeoutRef.current = null;
            }
            if (streamingInactivityRef.current) {
                clearTimeout(streamingInactivityRef.current);
                streamingInactivityRef.current = null;
            }
        };
    }, [isOpen, setupSocketHandlers]);

    // Cleanup socket on unmount
    useEffect(() => {
        return () => {
            if (socketRef.current) {
                socketRef.current.disconnect();
                socketRef.current = null;
            }
        };
    }, []);

    // Auto-resize textarea
    useEffect(() => {
        if (inputRef.current) {
            inputRef.current.style.height = 'auto';
            inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 150)}px`;
        }
    }, [inputValue]);

    // Focus input when panel opens
    useEffect(() => {
        if (isOpen && inputRef.current) {
            setTimeout(() => inputRef.current?.focus(), 300);
        }
    }, [isOpen]);

    // Reset state when panel closes
    useEffect(() => {
        if (!isOpen) {
            setMessages([]);
            setInputValue('');
            streamingMessageRef.current = '';
            setStreamingMessage('');
            setGeneratedMCP(null);
            setIsLoading(false);
            if (streamingInactivityRef.current) {
                clearTimeout(streamingInactivityRef.current);
                streamingInactivityRef.current = null;
            }
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
            console.error('MCP creator timeout');
            const errorMessage: Message = {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: 'Request timed out. Please make sure Claude CLI is installed and try again.',
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
        });
    }

    async function handleCreateMCP() {
        if (!generatedMCP || !generatedMCP.name || !generatedMCP.command) return;

        setIsLoading(true);
        try {
            const mcpId = generatedMCP.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
            const result = await saveMCP({
                id: mcpId,
                name: generatedMCP.name,
                description: generatedMCP.description,
                command: generatedMCP.command,
                args: generatedMCP.args || [],
                env: generatedMCP.env || {},
            });

            if (result.success && result.mcp) {
                onMCPCreated(result.mcp);
            }
        } catch (error) {
            console.error('Failed to create MCP:', error);
            alert('Failed to create MCP configuration. Please try again.');
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

    const showWelcome = messages.length === 0;

    if (!isOpen) return null;

    return (
        <>
            {/* Backdrop overlay */}
            <div
                className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[100]"
                onClick={onClose}
            />

            {/* Chat Panel */}
            <div className="fixed top-0 right-0 h-screen w-[600px] bg-white/70 dark:bg-[#0d0d0d]/70 backdrop-blur-xl border-l border-gray-200/50 dark:border-gray-700/50 z-[110] flex flex-col shadow-2xl">
                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-200/50 dark:border-gray-700/50">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Configure MCP Server</h2>
                            <div className="flex items-center gap-2 mt-0.5">
                                <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-yellow-500 animate-pulse'}`} />
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                    {connectionError ? connectionError : isConnected ? 'Connected' : 'Connecting...'}
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                        >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>

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
                                Configure MCP Server
                            </h3>
                            <p className="text-gray-500 dark:text-gray-400 mb-8 max-w-sm">
                                Tell me what MCP server you want to configure. I&apos;ll help you set up the command, arguments, and environment variables.
                            </p>

                            {/* Input Area - Welcome State */}
                            <div className="w-full max-w-lg">
                                {/* Suggested Prompts */}
                                <div className="flex flex-wrap gap-1.5 mb-3 justify-center">
                                    {SUGGESTED_PROMPTS.map((suggestion, index) => (
                                        <button
                                            key={index}
                                            onClick={() => handlePromptClick(suggestion.prompt)}
                                            className="px-3 py-1.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full text-xs text-gray-600 dark:text-gray-400 transition-colors border border-gray-200 dark:border-gray-700"
                                        >
                                            {suggestion.label}
                                        </button>
                                    ))}
                                </div>

                                {/* Input */}
                                <div className="relative">
                                    <textarea
                                        ref={inputRef}
                                        value={inputValue}
                                        onChange={(e) => setInputValue(e.target.value)}
                                        onKeyDown={handleKeyDown}
                                        placeholder="What MCP server do you want to configure?"
                                        rows={4}
                                        disabled={isLoading}
                                        className="w-full px-4 py-4 border border-gray-300 dark:border-gray-700 rounded-2xl bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 resize-none focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:opacity-50 text-base"
                                    />
                                </div>
                                <div className="flex items-center justify-between mt-2">
                                    <p className="text-xs text-gray-400 dark:text-gray-500">
                                        Press Enter to send, Shift+Enter for new line
                                    </p>
                                    <button
                                        onClick={handleSendMessage}
                                        disabled={!inputValue.trim() || isLoading || !isConnected}
                                        className="px-4 py-1.5 text-sm font-medium bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                                    >
                                        {isLoading ? 'Sending...' : !isConnected ? 'Connecting...' : 'Send'}
                                    </button>
                                </div>
                            </div>
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

                            {/* Streaming message */}
                            {streamingMessage && (
                                <div className="flex justify-start">
                                    <div className="max-w-[85%] rounded-2xl px-4 py-3 bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100">
                                        <p className="text-sm whitespace-pre-wrap">{streamingMessage}</p>
                                    </div>
                                </div>
                            )}

                            {/* Loading indicator */}
                            {isLoading && !streamingMessage && (
                                <div className="flex justify-start">
                                    <div className="max-w-[85%] rounded-2xl px-4 py-3 bg-gray-100 dark:bg-gray-800">
                                        <div className="flex items-center gap-2">
                                            <div className="flex gap-1">
                                                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                            </div>
                                            <span className="text-sm text-gray-500 dark:text-gray-400">Thinking...</span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Generated MCP Preview */}
                            {generatedMCP && (
                                <div className="mt-4 p-4 border border-purple-300 dark:border-purple-500/50 bg-purple-50 dark:bg-purple-500/10 rounded-xl">
                                    <div className="flex items-center gap-2 mb-3">
                                        <svg className="w-5 h-5 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                        <span className="text-sm font-medium text-purple-600 dark:text-purple-400">MCP Configuration Ready</span>
                                    </div>
                                    <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">{generatedMCP.name}</h4>
                                    {generatedMCP.description && (
                                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">{generatedMCP.description}</p>
                                    )}
                                    <div className="space-y-1 mb-3">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs text-gray-500">Command:</span>
                                            <code className="text-xs bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded text-green-600 dark:text-green-400">{generatedMCP.command}</code>
                                        </div>
                                        {generatedMCP.args && generatedMCP.args.length > 0 && (
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs text-gray-500">Args:</span>
                                                <code className="text-xs bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded text-blue-600 dark:text-blue-400">
                                                    {generatedMCP.args.join(' ')}
                                                </code>
                                            </div>
                                        )}
                                        {generatedMCP.env && Object.keys(generatedMCP.env).length > 0 && (
                                            <div className="text-xs text-gray-500">
                                                Env vars: {Object.keys(generatedMCP.env).join(', ')}
                                            </div>
                                        )}
                                    </div>
                                    <button
                                        onClick={handleCreateMCP}
                                        disabled={isLoading}
                                        className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
                                    >
                                        {isLoading ? 'Creating...' : 'Create This MCP Configuration'}
                                    </button>
                                </div>
                            )}

                            <div ref={messagesEndRef} />
                        </div>
                    )}
                </div>

                {/* Input Area - Conversation State */}
                {!showWelcome && (
                    <div className="p-4 border-t border-gray-200/50 dark:border-gray-700/50">
                        <div className="relative">
                            <textarea
                                ref={inputRef}
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Continue the conversation..."
                                rows={2}
                                disabled={isLoading}
                                className="w-full px-4 py-3 pr-14 border border-gray-300 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 resize-none focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:opacity-50 text-base"
                            />
                            <button
                                onClick={handleSendMessage}
                                disabled={!inputValue.trim() || isLoading || !isConnected}
                                className="absolute right-3 bottom-3 p-2.5 bg-purple-600 text-white rounded-xl hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                                </svg>
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </>
    );
}
