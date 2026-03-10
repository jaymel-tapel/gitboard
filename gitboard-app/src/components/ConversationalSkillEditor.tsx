'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import ReactDOM from 'react-dom';
import type { Socket } from 'socket.io-client';
import { saveSkill, deleteSkill } from '@/app/actions';
import type { Skill } from '@/lib/schemas';

interface ConversationalSkillEditorProps {
    isOpen: boolean;
    onClose: () => void;
    skill?: Skill;
}

interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
}

interface GeneratedSkillConfig {
    name?: string;
    description?: string;
    license?: string;
    version?: string;
    compatibility?: {
        agents?: string[];
        providers?: string[];
    };
    instructions?: string;
}

const SUGGESTED_PROMPTS = [
    { label: 'Code Review', prompt: 'I want a skill for doing thorough code reviews' },
    { label: 'Documentation', prompt: 'Help me with a skill for writing technical documentation' },
    { label: 'Testing', prompt: 'I need a skill for writing comprehensive test cases' },
    { label: 'Refactoring', prompt: 'I want a skill for refactoring legacy code' },
];

export function ConversationalSkillEditor({ isOpen, onClose, skill }: ConversationalSkillEditorProps) {
    const isEditMode = !!skill?.id;
    const [mounted, setMounted] = useState(false);

    // Form state
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [license, setLicense] = useState('MIT');
    const [version, setVersion] = useState('1.0.0');
    const [agents, setAgents] = useState<string[]>([]);
    const [providers, setProviders] = useState<string[]>([]);
    const [instructions, setInstructions] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [agentInput, setAgentInput] = useState('');
    const [providerInput, setProviderInput] = useState('');

    // Track if AI has generated a skill config
    const [generatedConfig, setGeneratedConfig] = useState<GeneratedSkillConfig | null>(null);

    // Chat state
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

    useEffect(() => {
        setMounted(true);
    }, []);

    // Initialize form with skill data in edit mode
    useEffect(() => {
        if (skill) {
            setName(skill.name);
            setDescription(skill.description || '');
            setLicense(skill.license || 'MIT');
            setVersion(skill.version || '1.0.0');
            setAgents(skill.compatibility?.agents || []);
            setProviders(skill.compatibility?.providers || []);
            setInstructions(skill.instructions || '');
        } else {
            // Reset for create mode
            setName('');
            setDescription('');
            setLicense('MIT');
            setVersion('1.0.0');
            setAgents([]);
            setProviders([]);
            setInstructions('');
        }
        setGeneratedConfig(null);
        setAgentInput('');
        setProviderInput('');
    }, [skill, isOpen]);

    // Check if there are unsaved changes
    const hasUnsavedChanges = useMemo(() => {
        if (isEditMode) {
            // In edit mode, check if any field changed from original
            return (
                name !== (skill?.name || '') ||
                description !== (skill?.description || '') ||
                license !== (skill?.license || 'MIT') ||
                version !== (skill?.version || '1.0.0') ||
                instructions !== (skill?.instructions || '') ||
                JSON.stringify(agents) !== JSON.stringify(skill?.compatibility?.agents || []) ||
                JSON.stringify(providers) !== JSON.stringify(skill?.compatibility?.providers || [])
            );
        }
        // In create mode, check if any field has content
        return name !== '' || description !== '' || instructions !== '';
    }, [isEditMode, skill, name, description, license, version, instructions, agents, providers]);

    // Handle close with confirmation
    const handleCloseWithConfirmation = useCallback(() => {
        if (hasUnsavedChanges) {
            if (!confirm('You have unsaved changes. Are you sure you want to discard them?')) {
                return;
            }
        }
        onClose();
    }, [hasUnsavedChanges, onClose]);

    // Handle escape key
    useEffect(() => {
        function handleEscape(e: KeyboardEvent) {
            if (e.key === 'Escape' && isOpen) {
                handleCloseWithConfirmation();
            }
        }
        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [isOpen, handleCloseWithConfirmation]);

    // Auto-scroll to bottom when messages change
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, streamingMessage]);

    // Handle skill generated from AI
    function handleSkillGenerated(config: GeneratedSkillConfig) {
        setGeneratedConfig(config);
        // Auto-apply the generated config to the form
        if (config.name) setName(config.name);
        if (config.description) setDescription(config.description);
        if (config.license) setLicense(config.license);
        if (config.version) setVersion(config.version);
        if (config.compatibility?.agents) setAgents(config.compatibility.agents);
        if (config.compatibility?.providers) setProviders(config.compatibility.providers);
        if (config.instructions) setInstructions(config.instructions);
    }

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

        socket.on('skill-generated', (data: { skill: GeneratedSkillConfig }) => {
            console.log('Skill generated:', data.skill);
            handleSkillGenerated(data.skill);
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
            console.error('Skill creator error:', error);
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
                const socket = io('/skill-creator', {
                    timeout: 10000,
                });

                socket.on('connect', () => {
                    if (mounted) {
                        console.log('Skill creator socket connected');
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

    // Reset chat state when panel closes
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
            console.error('Skill creator timeout');
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

        // Send the message through socket with current skill context if editing
        socketRef.current.emit('create-skill', {
            message: userMessage.content,
            history: messages.map((m) => ({
                role: m.role,
                content: m.content,
            })),
            currentSkill: skill || null,
        });
    }

    function handleKeyDown(e: React.KeyboardEvent) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    }

    async function handleSave() {
        if (!name.trim()) {
            alert('Please enter a skill name');
            return;
        }

        setIsSaving(true);
        try {
            const skillData: Partial<Skill> & { id: string; name: string } = {
                id: skill?.id || name.toLowerCase().replace(/\s+/g, '-'),
                name,
                description: description || undefined,
                license: license || undefined,
                version: version || undefined,
                compatibility: (agents.length > 0 || providers.length > 0)
                    ? { agents, providers }
                    : undefined,
                instructions,
            };

            await saveSkill(skillData);
            onClose();
            window.location.reload();
        } catch (error) {
            console.error('Failed to save skill:', error);
            alert('Failed to save skill. Please try again.');
        } finally {
            setIsSaving(false);
        }
    }

    async function handleDelete() {
        if (!skill) return;
        if (!confirm(`Delete skill "${skill.name}"? This cannot be undone.`)) return;

        try {
            await deleteSkill(skill.id);
            onClose();
            window.location.reload();
        } catch (error) {
            console.error('Failed to delete skill:', error);
            alert('Failed to delete skill. Please try again.');
        }
    }

    function addAgent() {
        if (agentInput.trim() && !agents.includes(agentInput.trim())) {
            setAgents([...agents, agentInput.trim()]);
            setAgentInput('');
        }
    }

    function removeAgent(agent: string) {
        setAgents(agents.filter(a => a !== agent));
    }

    function addProvider() {
        if (providerInput.trim() && !providers.includes(providerInput.trim())) {
            setProviders([...providers, providerInput.trim()]);
            setProviderInput('');
        }
    }

    function removeProvider(provider: string) {
        setProviders(providers.filter(p => p !== provider));
    }

    if (!mounted) return null;

    const showWelcome = messages.length === 0;

    return (
        <>
            {/* Backdrop */}
            {isOpen && ReactDOM.createPortal(
                <div
                    className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100]"
                    onClick={handleCloseWithConfirmation}
                />,
                document.body
            )}

            {/* Centered Modal */}
            {isOpen && ReactDOM.createPortal(
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-6">
                    <div
                        className="w-[90vw] h-[90vh] max-w-[1600px] bg-white dark:bg-[#0d0d0d] border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl flex flex-col overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#1a1a1a]">
                            <div>
                                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                                    {isEditMode ? 'Edit Skill' : 'Create Skill'}
                                </h2>
                                {skill?.id && (
                                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">{skill.id}</p>
                                )}
                            </div>
                            <button
                                onClick={handleCloseWithConfirmation}
                                className="text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-300 p-1"
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {/* Body - Two Column Layout */}
                        <div className="flex-1 flex overflow-hidden">
                            {/* Left Panel - Chat Interface (35%) */}
                            <div className="w-[35%] flex flex-col overflow-hidden bg-white dark:bg-[#0d0d0d] border-r border-gray-200 dark:border-gray-700">
                                {/* Chat Header */}
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
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                                                </svg>
                                            </div>
                                            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                                                {isEditMode ? 'Modify Your Skill' : 'Create a New Skill'}
                                            </h3>
                                            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6 max-w-sm">
                                                {isEditMode
                                                    ? 'Describe the changes you want to make. I\'ll help refine the skill configuration.'
                                                    : 'Tell me what skill you need. I\'ll help you create it with the right configuration and instructions.'}
                                            </p>

                                            {/* Suggested Prompts */}
                                            <div className="flex flex-wrap gap-2 mb-4 justify-center">
                                                {SUGGESTED_PROMPTS.map((suggestion, index) => (
                                                    <button
                                                        key={index}
                                                        onClick={() => handlePromptClick(suggestion.prompt)}
                                                        className="px-3 py-1.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full text-xs text-gray-700 dark:text-gray-300 transition-colors border border-gray-300 dark:border-gray-700"
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
                                            placeholder={showWelcome ? "Describe the skill you want to create..." : "Continue the conversation..."}
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

                            {/* Right Panel - Skill Form (65%) */}
                            <div className="w-[65%] flex flex-col overflow-hidden bg-white dark:bg-[#0d0d0d]">
                                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                                    {/* Generated Config Banner */}
                                    {generatedConfig && (
                                        <div className="p-4 bg-purple-100 dark:bg-purple-900/20 border border-purple-300 dark:border-purple-700 rounded-xl mb-4">
                                            <div className="flex items-center gap-2 mb-2">
                                                <svg className="w-5 h-5 text-purple-600 dark:text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                </svg>
                                                <span className="text-sm font-medium text-purple-700 dark:text-purple-300">AI-Generated Configuration Applied</span>
                                            </div>
                                            <p className="text-xs text-purple-600 dark:text-purple-400">
                                                The form has been populated with AI suggestions. Feel free to review and modify any fields before saving.
                                            </p>
                                        </div>
                                    )}

                                    {/* Basic Info */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                            Skill Name *
                                        </label>
                                        <input
                                            type="text"
                                            value={name}
                                            onChange={(e) => setName(e.target.value)}
                                            placeholder="e.g., Code Review, Documentation Writer"
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                            Description (Optional)
                                        </label>
                                        <input
                                            type="text"
                                            value={description}
                                            onChange={(e) => setDescription(e.target.value)}
                                            placeholder="Brief description of what this skill does"
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                        />
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                                Version
                                            </label>
                                            <input
                                                type="text"
                                                value={version}
                                                onChange={(e) => setVersion(e.target.value)}
                                                placeholder="e.g., 1.0.0"
                                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                                License
                                            </label>
                                            <input
                                                type="text"
                                                value={license}
                                                onChange={(e) => setLicense(e.target.value)}
                                                placeholder="e.g., MIT, Apache-2.0"
                                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                            />
                                        </div>
                                    </div>

                                    {/* Compatibility - Agents */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                            Compatible Agents (Optional)
                                        </label>
                                        <div className="flex gap-2 mb-2">
                                            <input
                                                type="text"
                                                value={agentInput}
                                                onChange={(e) => setAgentInput(e.target.value)}
                                                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addAgent())}
                                                placeholder="e.g., claude-code, cursor"
                                                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                            />
                                            <button
                                                onClick={addAgent}
                                                className="px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                                            >
                                                Add
                                            </button>
                                        </div>
                                        {agents.length > 0 && (
                                            <div className="flex flex-wrap gap-2">
                                                {agents.map((agent) => (
                                                    <span
                                                        key={agent}
                                                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-full text-sm"
                                                    >
                                                        {agent}
                                                        <button
                                                            onClick={() => removeAgent(agent)}
                                                            className="ml-1 hover:text-purple-900 dark:hover:text-purple-100"
                                                        >
                                                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                            </svg>
                                                        </button>
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {/* Compatibility - Providers */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                            Compatible Providers (Optional)
                                        </label>
                                        <div className="flex gap-2 mb-2">
                                            <input
                                                type="text"
                                                value={providerInput}
                                                onChange={(e) => setProviderInput(e.target.value)}
                                                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addProvider())}
                                                placeholder="e.g., anthropic, openai"
                                                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                            />
                                            <button
                                                onClick={addProvider}
                                                className="px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                                            >
                                                Add
                                            </button>
                                        </div>
                                        {providers.length > 0 && (
                                            <div className="flex flex-wrap gap-2">
                                                {providers.map((provider) => (
                                                    <span
                                                        key={provider}
                                                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full text-sm"
                                                    >
                                                        {provider}
                                                        <button
                                                            onClick={() => removeProvider(provider)}
                                                            className="ml-1 hover:text-blue-900 dark:hover:text-blue-100"
                                                        >
                                                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                            </svg>
                                                        </button>
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {/* Instructions */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                            Instructions (Markdown)
                                        </label>
                                        <textarea
                                            value={instructions}
                                            onChange={(e) => setInstructions(e.target.value)}
                                            rows={12}
                                            placeholder="# Skill Instructions

Write the instructions for this skill in Markdown format.

## When to Use
- Describe when the agent should apply this skill

## How It Works
- Step-by-step instructions for the agent

## Examples
- Provide examples of how the skill should behave"
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-mono text-sm resize-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                        />
                                        <p className="text-xs text-gray-500 mt-1">
                                            The instructions will be included in the agent context when this skill is selected
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="px-6 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#1a1a1a] flex items-center justify-between">
                            <div>
                                {isEditMode && (
                                    <button
                                        onClick={handleDelete}
                                        className="px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                    >
                                        Delete Skill
                                    </button>
                                )}
                            </div>
                            <div className="flex gap-3">
                                <button
                                    onClick={handleCloseWithConfirmation}
                                    className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSave}
                                    disabled={isSaving || !name.trim()}
                                    className="px-6 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isSaving ? 'Saving...' : isEditMode ? 'Save Changes' : 'Create Skill'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </>
    );
}
