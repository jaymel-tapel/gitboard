'use client';

import { useState, useRef, useEffect } from 'react';
import type { Socket } from 'socket.io-client';
import type { DocsAgentMessage, Board } from '@/lib/schemas';
import type { DocContext } from './DocsAgentButton';
import { createTicket, getBoards } from '@/app/actions';
import { useToast } from '@/context/ToastContext';

interface DocsAgentChatProps {
    isOpen: boolean;
    onToggle: () => void;
    docContext?: DocContext | null;
}

interface GeneratedTask {
    title: string;
    description: string;
    priority: 'low' | 'medium' | 'high' | 'critical';
    implementation_steps: Array<{ text: string; completed: boolean }>;
    acceptance_criteria: Array<{ text: string; completed: boolean }>;
}

const AGENTIC_PROMPTS = [
    { label: 'Create tasks from doc', prompt: 'Read the document and create a task for each item listed.' },
    { label: 'Analyze & create tasks', prompt: 'Analyze this request and create appropriate tasks: ' },
];

const DOC_CONTEXT_AGENTIC_PROMPTS = [
    { label: 'Create tasks from this doc', prompt: 'Read this document and create a task for each item or requirement listed.' },
    { label: 'Extract action items', prompt: 'Extract all action items from this document and create tasks for them.' },
];

export function DocsAgentChat({ isOpen, onToggle, docContext }: DocsAgentChatProps) {
    const { toast } = useToast();
    const [messages, setMessages] = useState<DocsAgentMessage[]>([]);
    const [inputValue, setInputValue] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [streamingMessage, setStreamingMessage] = useState('');
    const [currentSources, setCurrentSources] = useState<string[]>([]);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const socketRef = useRef<Socket | null>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    // Agentic mode is always enabled
    const agenticMode = true;
    const [boards, setBoards] = useState<Board[]>([]);
    const [selectedBoardId, setSelectedBoardId] = useState('default');

    // Legacy task generation state (for non-agentic mode fallback)
    const [generatedTasks, setGeneratedTasks] = useState<GeneratedTask[]>([]);
    const [showTaskPreview, setShowTaskPreview] = useState(false);
    const [isCreatingTasks, setIsCreatingTasks] = useState(false);

    // Fallback mode warning
    const [fallbackWarning, setFallbackWarning] = useState<string | null>(null);

    // Auto-scroll to bottom when messages change
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, streamingMessage]);

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

    // Focus input when sidebar opens
    useEffect(() => {
        if (isOpen && inputRef.current) {
            setTimeout(() => inputRef.current?.focus(), 300);
        }
    }, [isOpen]);

    // Load boards when component mounts
    useEffect(() => {
        getBoards().then(setBoards);
    }, []);

    // Task creation handler
    async function handleCreateTasks(boardId: string = 'default') {
        setIsCreatingTasks(true);
        let successCount = 0;

        for (const task of generatedTasks) {
            try {
                const formData = new FormData();
                formData.set('title', task.title);
                formData.set('description', task.description);
                formData.set('priority', task.priority || 'medium');
                if (task.implementation_steps) {
                    formData.set('implementation_steps', JSON.stringify(task.implementation_steps));
                }
                if (task.acceptance_criteria) {
                    formData.set('acceptance_criteria', JSON.stringify(task.acceptance_criteria));
                }
                formData.set('boardId', boardId);

                await createTicket(formData);
                successCount++;
            } catch (error) {
                console.error('Failed to create task:', error);
            }
        }

        setIsCreatingTasks(false);
        setShowTaskPreview(false);
        setGeneratedTasks([]);
        toast.success(`Created ${successCount} task(s)`);
    }

    function handlePromptClick(prompt: string) {
        setInputValue(prompt);
        inputRef.current?.focus();
    }

    async function handleSendMessage() {
        if (!inputValue.trim() || isLoading) return;

        const userMessage: DocsAgentMessage = {
            id: crypto.randomUUID(),
            role: 'user',
            content: inputValue.trim(),
            timestamp: new Date().toISOString(),
        };

        setMessages((prev) => [...prev, userMessage]);
        setInputValue('');
        setIsLoading(true);
        setStreamingMessage('');
        setCurrentSources([]);
        setFallbackWarning(null);

        try {
            const { io } = await import('socket.io-client');
            const socket = io('/docs-agent-chat');
            socketRef.current = socket;

            socket.on('connect', () => {
                socket.emit('chat', {
                    message: userMessage.content,
                    history: messages.map((m) => ({
                        role: m.role,
                        content: m.content,
                    })),
                    agenticMode,
                    boards: boards.map(b => ({ id: b.id, name: b.name })),
                    ...(docContext && { docContext }),
                });
            });

            socket.on('stream', (data: { content: string }) => {
                setStreamingMessage((prev) => prev + data.content);
            });

            socket.on('sources', (data: { sources: string[] }) => {
                setCurrentSources(data.sources);
            });

            socket.on('tasks-generated', (data: { tasks: GeneratedTask[] }) => {
                setGeneratedTasks(data.tasks);
                setShowTaskPreview(true);
            });

            socket.on('fallback', (data: { message: string }) => {
                setFallbackWarning(data.message);
            });

            socket.on('complete', (data: { content: string; sources?: string[] }) => {
                const assistantMessage: DocsAgentMessage = {
                    id: crypto.randomUUID(),
                    role: 'assistant',
                    content: data.content || streamingMessage,
                    timestamp: new Date().toISOString(),
                    sources: data.sources || currentSources,
                };
                setMessages((prev) => [...prev, assistantMessage]);
                setStreamingMessage('');
                setCurrentSources([]);
                setIsLoading(false);
                socket.disconnect();
                socketRef.current = null;
            });

            socket.on('error', (error: string) => {
                console.error('Chat error:', error);
                const errorMessage: DocsAgentMessage = {
                    id: crypto.randomUUID(),
                    role: 'assistant',
                    content: 'Sorry, I encountered an error. Please make sure Ollama is running with the nomic-embed-text model available.',
                    timestamp: new Date().toISOString(),
                };
                setMessages((prev) => [...prev, errorMessage]);
                setStreamingMessage('');
                setIsLoading(false);
                socket.disconnect();
                socketRef.current = null;
            });
        } catch (error) {
            console.error('Socket error:', error);
            setIsLoading(false);
        }
    }

    function handleKeyDown(e: React.KeyboardEvent) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    }

    function clearChat() {
        setMessages([]);
        setStreamingMessage('');
        setCurrentSources([]);
    }

    function handleStop() {
        if (socketRef.current) {
            socketRef.current.emit('stop');
        }
    }

    const showWelcome = messages.length === 0;

    return (
        <>
            {/* Backdrop overlay */}
            {isOpen && (
                <div
                    className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[100]"
                    onClick={onToggle}
                />
            )}

            {/* Chat Panel - matches Create Ticket panel style */}
            <div
                className={`fixed top-0 right-0 h-screen w-[480px] bg-white/70 dark:bg-[#0d0d0d]/70 backdrop-blur-xl border-l border-gray-200/50 dark:border-gray-700/50 z-[110] flex flex-col transform transition-all duration-300 ease-in-out ${
                    isOpen ? 'translate-x-0 shadow-2xl' : 'translate-x-full shadow-none'
                }`}
            >
                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-200/50 dark:border-gray-700/50">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Docs Agent</h2>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                Ask questions or create tasks from your docs
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            {messages.length > 0 && (
                                <button
                                    onClick={clearChat}
                                    className="text-xs px-2 py-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
                                >
                                    Clear
                                </button>
                            )}
                            <button
                                onClick={onToggle}
                                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                    </div>
                    {/* Active Document Context */}
                    {docContext && docContext.title && (
                        <div className="mt-3 px-3 py-2 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
                            <div className="flex items-center gap-2">
                                <svg className="w-4 h-4 text-purple-600 dark:text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-purple-900 dark:text-purple-100 truncate">
                                        {docContext.title}
                                    </p>
                                    {docContext.folder && (
                                        <p className="text-xs text-purple-600 dark:text-purple-400">
                                            {docContext.folder}/{docContext.slug}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                </div>

                {/* Messages Area */}
                <div className="flex-1 overflow-y-auto p-6">
                    {showWelcome ? (
                        <div className="h-full flex flex-col items-center justify-center text-center px-4">
                            <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
                                Docs Agent
                            </h3>
                            <p className="text-gray-500 dark:text-gray-400 mb-8 max-w-sm">
                                {docContext?.title
                                    ? `I have context of "${docContext.title}". I can analyze it, answer questions, and create tasks.`
                                    : 'I can read documents, analyze content, and create tasks for each item automatically. Just describe what you need.'}
                            </p>

                            {/* Input Area - Welcome State */}
                            <div className="w-full max-w-lg">
                                {/* Suggested Prompts */}
                                <div className="flex flex-wrap gap-1.5 mb-2">
                                    {(docContext?.title
                                        ? DOC_CONTEXT_AGENTIC_PROMPTS
                                        : AGENTIC_PROMPTS
                                    ).map((suggestion, index) => (
                                        <button
                                            key={index}
                                            onClick={() => handlePromptClick(suggestion.prompt)}
                                            className="px-3 py-1 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full text-xs text-gray-600 dark:text-gray-400 transition-colors border border-gray-200 dark:border-gray-700"
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
                                        placeholder="Ask about your docs..."
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
                                        disabled={!inputValue.trim() || isLoading}
                                        className="px-4 py-1.5 text-sm font-medium bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                                    >
                                        {isLoading ? 'Sending...' : 'Send'}
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
                                        {message.sources && message.sources.length > 0 && (
                                            <div className="mt-2 pt-2 border-t border-gray-200/30 dark:border-gray-700/30">
                                                <p className="text-xs opacity-70 mb-1">Sources:</p>
                                                <div className="flex flex-wrap gap-1">
                                                    {message.sources.map((source, i) => {
                                                        const docsPath = '/docs/' + source.replace(/\.json$/, '');
                                                        return (
                                                            <a
                                                                key={i}
                                                                href={docsPath}
                                                                className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-black/10 dark:bg-white/10 rounded-full hover:bg-black/20 dark:hover:bg-white/20 transition-colors cursor-pointer"
                                                            >
                                                                <svg className="w-3 h-3 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                                </svg>
                                                                {docsPath}
                                                            </a>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}

                            {/* Fallback warning */}
                            {fallbackWarning && (
                                <div className="flex justify-center">
                                    <div className="px-3 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                                        <div className="flex items-center gap-2">
                                            <svg className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                            </svg>
                                            <p className="text-xs text-amber-700 dark:text-amber-300">
                                                {fallbackWarning}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}

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
                                            <span className="text-sm text-gray-500 dark:text-gray-400">
                                                Agent working...
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Stop button */}
                            {isLoading && (
                                <div className="flex justify-center">
                                    <button
                                        onClick={handleStop}
                                        className="px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors flex items-center gap-2"
                                    >
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                        Stop Agent
                                    </button>
                                </div>
                            )}

                            {/* Task Preview Card */}
                            {showTaskPreview && generatedTasks.length > 0 && (
                                <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-xl border border-purple-200 dark:border-purple-700">
                                    <h4 className="font-medium text-purple-900 dark:text-purple-100 mb-2">
                                        {generatedTasks.length} Task{generatedTasks.length > 1 ? 's' : ''} Ready
                                    </h4>
                                    <ul className="space-y-2 mb-3">
                                        {generatedTasks.map((task, i) => (
                                            <li key={i} className="text-sm text-gray-700 dark:text-gray-300">
                                                <span className="font-medium">{task.title}</span>
                                                <span className={`ml-2 px-1.5 py-0.5 rounded text-xs ${
                                                    task.priority === 'critical' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' :
                                                    task.priority === 'high' ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300' :
                                                    task.priority === 'medium' ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300' :
                                                    'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                                                }`}>
                                                    {task.priority || 'medium'}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                    {/* Board Selector */}
                                    <div className="mb-3">
                                        <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                                            Create on board:
                                        </label>
                                        <select
                                            value={selectedBoardId}
                                            onChange={(e) => setSelectedBoardId(e.target.value)}
                                            className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                                        >
                                            {boards.map((board) => (
                                                <option key={board.id} value={board.id}>
                                                    {board.name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => handleCreateTasks(selectedBoardId)}
                                            disabled={isCreatingTasks}
                                            className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                        >
                                            {isCreatingTasks ? 'Creating...' : 'Create Tasks'}
                                        </button>
                                        <button
                                            onClick={() => { setShowTaskPreview(false); setGeneratedTasks([]); }}
                                            className="px-4 py-2 text-gray-600 dark:text-gray-400 text-sm hover:text-gray-900 dark:hover:text-gray-200 transition-colors"
                                        >
                                            Cancel
                                        </button>
                                    </div>
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
                                placeholder="Continue asking..."
                                rows={2}
                                disabled={isLoading}
                                className="w-full px-4 py-3 pr-14 border border-gray-300 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 resize-none focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:opacity-50 text-base"
                            />
                            <button
                                onClick={handleSendMessage}
                                disabled={!inputValue.trim() || isLoading}
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
