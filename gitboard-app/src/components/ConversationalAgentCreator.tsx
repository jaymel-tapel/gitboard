'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import type { Socket } from 'socket.io-client';
import type { Agent } from '@/lib/schemas';

interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
}

interface GeneratedAgentConfig {
    name: string;
    description: string;
    executionType: 'cli' | 'api';
    provider: string;
    model: string;
    systemPrompt: string;
    terminalInstructions: string;
    artifactTemplate?: string;
}

interface ConversationalAgentCreatorProps {
    onAgentGenerated: (agent: GeneratedAgentConfig) => void;
    currentAgent?: Agent | null;
    isOpen: boolean;
}

const SUGGESTED_PROMPTS = [
    { label: 'Code Review', prompt: 'I want to create an agent that performs thorough code reviews' },
    { label: 'Documentation', prompt: 'Help me create an agent for writing technical documentation' },
    { label: 'Testing', prompt: 'I need an agent that writes comprehensive test cases' },
    { label: 'API Integration', prompt: 'I want an agent that helps with API integrations' },
];

export function ConversationalAgentCreator({ onAgentGenerated, currentAgent, isOpen }: ConversationalAgentCreatorProps) {
    const [messages, setMessages] = useState<Message[]>([]);
    const [inputValue, setInputValue] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isConnected, setIsConnected] = useState(false);
    const [connectionError, setConnectionError] = useState<string | null>(null);
    const [streamingMessage, setStreamingMessage] = useState('');
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

            // Reset streaming inactivity timeout
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

        socket.on('agent-generated', (data: { agent: GeneratedAgentConfig }) => {
            console.log('Agent generated:', data.agent);
            onAgentGenerated(data.agent);
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
            console.error('Agent creator error:', error);
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
    }, [onAgentGenerated]);

    // Connect socket when component mounts and isOpen
    useEffect(() => {
        if (!isOpen) return;

        let mounted = true;

        async function connectSocket() {
            try {
                const { io } = await import('socket.io-client');
                const socket = io('/agent-creator', {
                    timeout: 10000,
                });

                socket.on('connect', () => {
                    if (mounted) {
                        console.log('Agent creator socket connected');
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

    // Focus input when opened
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

        // Set a timeout for the response (60 seconds)
        timeoutRef.current = setTimeout(() => {
            console.error('Agent creator timeout');
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

        // Send the message through socket
        socketRef.current.emit('create-agent', {
            message: userMessage.content,
            history: messages.map((m) => ({
                role: m.role,
                content: m.content,
            })),
            currentAgent: currentAgent || null,
        });
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
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-yellow-500 animate-pulse'}`} />
                    <span className="text-xs text-gray-600 dark:text-gray-400">
                        {connectionError ? connectionError : isConnected ? 'Connected' : 'Connecting...'}
                    </span>
                </div>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4">
                {showWelcome ? (
                    <div className="h-full flex flex-col items-center justify-center text-center px-4">
                        <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-gradient-to-br from-purple-400 to-blue-600 flex items-center justify-center">
                            <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                            </svg>
                        </div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                            {currentAgent ? 'Modify Your Agent' : 'Create an AI Agent'}
                        </h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6 max-w-sm">
                            {currentAgent
                                ? 'Describe the changes you want to make to your agent. I can help refine its capabilities and system prompt.'
                                : 'Describe what kind of AI agent you need. I\'ll help you configure it with the right settings and system prompt.'}
                        </p>

                        {/* Suggested Prompts */}
                        <div className="flex flex-wrap gap-2 mb-4 justify-center">
                            {SUGGESTED_PROMPTS.map((suggestion, index) => (
                                <button
                                    key={index}
                                    onClick={() => handlePromptClick(suggestion.prompt)}
                                    className="px-3 py-1.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full text-xs text-gray-700 dark:text-gray-300 transition-colors border border-gray-200 dark:border-gray-700"
                                >
                                    {suggestion.label}
                                </button>
                            ))}
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
                                        <span className="text-sm text-gray-600 dark:text-gray-400">Thinking...</span>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div ref={messagesEndRef} />
                    </div>
                )}
            </div>

            {/* Input Area */}
            <div className="p-4 border-t border-gray-200 dark:border-gray-700">
                <div className="relative">
                    <textarea
                        ref={inputRef}
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={showWelcome ? "Describe the agent you want to create..." : "Continue the conversation..."}
                        rows={2}
                        disabled={isLoading}
                        className="w-full px-4 py-3 pr-14 border border-gray-300 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 resize-none focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:opacity-50 text-sm"
                    />
                    <button
                        onClick={handleSendMessage}
                        disabled={!inputValue.trim() || isLoading || !isConnected}
                        className="absolute right-3 bottom-3 p-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg hover:from-purple-700 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
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
    );
}
