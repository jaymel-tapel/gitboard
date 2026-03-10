'use client'

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import ReactDOM from 'react-dom';
import ReactMarkdown from 'react-markdown';
import type { Socket } from 'socket.io-client';
import type { Ticket, TicketChatMessage, TeamMember, StatusConfig, TicketArtifact } from '@/lib/schemas';
import { createTicket, updateTicket, deleteTicket, getStatuses } from '@/app/actions';
import ContextSelector from './ContextSelector';
import { useBoardState } from '@/context/BoardStateContext';
import { useToast } from '@/context/ToastContext';
import { ArtifactCard } from './artifacts/ArtifactCard';
import { ArtifactViewer } from './artifacts/ArtifactViewer';

interface TicketEditorProps {
    isOpen: boolean;
    onClose: () => void;
    ticket?: Ticket | null; // If provided, edit mode; otherwise, create mode
    teamMembers?: TeamMember[];
    statuses?: StatusConfig[];
    boardId?: string;
}

interface GeneratedTicket {
    title: string;
    description: string;
    implementationSteps: Array<{ text: string; completed: boolean }>;
    acceptanceCriteria: Array<{ text: string; completed: boolean }>;
}

const SUGGESTED_PROMPTS = [
    { icon: '🐛', label: 'Fix a bug', prompt: 'I need to fix a bug where ' },
    { icon: '✨', label: 'Add a feature', prompt: 'Add a feature that allows users to ' },
    { icon: '🔧', label: 'Refactor code', prompt: 'Refactor the ' },
    { icon: '📝', label: 'Update docs', prompt: 'Update the documentation for ' },
];

export function TicketEditor({
    isOpen,
    onClose,
    ticket,
    teamMembers = [],
    statuses: initialStatuses,
    boardId: propBoardId,
}: TicketEditorProps) {
    const { state, archiveTicket } = useBoardState();
    const { toast } = useToast();
    const boardId = propBoardId || state.boardId || 'default';

    const isEditMode = !!ticket?.id;
    const [mounted, setMounted] = useState(false);

    // Form state
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'critical'>('medium');
    const [owner, setOwner] = useState('');
    const [status, setStatus] = useState<string>('');
    const [statuses, setStatuses] = useState<StatusConfig[]>(initialStatuses || []);
    const [implementationSteps, setImplementationSteps] = useState<Array<{ text: string; completed: boolean }>>([]);
    const [acceptanceCriteria, setAcceptanceCriteria] = useState<Array<{ text: string; completed: boolean }>>([]);
    const [notes, setNotes] = useState('');
    const [tags, setTags] = useState<string[]>([]);
    const [newTag, setNewTag] = useState('');
    const [showMarkdownPreview, setShowMarkdownPreview] = useState(false);

    // Chat state
    const [chatMessages, setChatMessages] = useState<TicketChatMessage[]>([]);
    const [chatInput, setChatInput] = useState('');
    const [isLoadingChat, setIsLoadingChat] = useState(false);
    const [streamingMessage, setStreamingMessage] = useState('');
    const [isGeneratingTicket, setIsGeneratingTicket] = useState(false);
    const [generatedTicket, setGeneratedTicket] = useState<GeneratedTicket | null>(null);

    // Artifact state - map of artifacts by ID for inline display
    const [artifactsById, setArtifactsById] = useState<Record<string, TicketArtifact>>({});
    const [selectedArtifact, setSelectedArtifact] = useState<TicketArtifact | null>(null);
    const [showArtifactViewer, setShowArtifactViewer] = useState(false);

    // Context selections
    const [selectedDocsPages, setSelectedDocsPages] = useState<string[]>([]);
    const [selectedRepoFiles, setSelectedRepoFiles] = useState<string[]>([]);
    const [selectedUrls, setSelectedUrls] = useState<string[]>([]);

    // UI state
    const [isSaving, setIsSaving] = useState(false);
    const [chatHistoryLoaded, setChatHistoryLoaded] = useState(false);

    // Check if there are unsaved changes in create mode
    const hasUnsavedChanges = useMemo(() => {
        return (
            title !== '' ||
            description !== '' ||
            priority !== 'medium' ||
            owner !== '' ||
            notes !== '' ||
            tags.length > 0 ||
            implementationSteps.length > 0 ||
            acceptanceCriteria.length > 0 ||
            chatMessages.length > 0
        );
    }, [title, description, priority, owner, notes, tags, implementationSteps, acceptanceCriteria, chatMessages]);

    // Refs
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const chatSocketRef = useRef<Socket | null>(null);
    const ticketSocketRef = useRef<Socket | null>(null);
    const chatInputRef = useRef<HTMLTextAreaElement>(null);

    // Helper function to reset all form state
    const resetFormState = useCallback(() => {
        setTitle('');
        setDescription('');
        setPriority('medium');
        setOwner('');
        setNotes('');
        setTags([]);
        setImplementationSteps([]);
        setAcceptanceCriteria([]);
        setChatMessages([]);
        setGeneratedTicket(null);
        setArtifactsById({});
        setSelectedArtifact(null);
        setShowArtifactViewer(false);
        setSelectedDocsPages([]);
        setSelectedRepoFiles([]);
        setSelectedUrls([]);
        setChatHistoryLoaded(false);
    }, []);

    useEffect(() => {
        setMounted(true);
    }, []);

    // Fetch statuses if not provided
    useEffect(() => {
        if (!initialStatuses || initialStatuses.length === 0) {
            getStatuses(boardId).then(setStatuses);
        }
    }, [initialStatuses, boardId]);

    // Initialize form with ticket data in edit mode
    useEffect(() => {
        if (ticket) {
            setTitle(ticket.title);
            setDescription(ticket.description || '');
            setPriority(ticket.priority || 'medium');
            setOwner(ticket.owner || '');
            setNotes(ticket.notes || '');
            setTags(ticket.tags || []);
            setImplementationSteps(
                Array.isArray(ticket.implementation_steps)
                    ? ticket.implementation_steps.map(step =>
                        typeof step === 'string' ? { text: step, completed: false } : step
                    )
                    : []
            );
            setAcceptanceCriteria(
                Array.isArray(ticket.acceptance_criteria)
                    ? ticket.acceptance_criteria.map(criterion =>
                        typeof criterion === 'string' ? { text: criterion, completed: false } : criterion
                    )
                    : []
            );
        } else {
            // Reset for create mode
            setTitle('');
            setDescription('');
            setPriority('medium');
            setOwner('');
            setNotes('');
            setTags([]);
            setImplementationSteps([]);
            setAcceptanceCriteria([]);
            setGeneratedTicket(null);
        }
    }, [ticket]);

    // Load chat history and artifacts for existing tickets
    useEffect(() => {
        if (isOpen && ticket?.id && !chatHistoryLoaded) {
            // Load chat history
            fetch(`/api/ticket-chat?ticketId=${ticket.id}`)
                .then(res => res.json())
                .then(data => {
                    if (data.chatHistory?.messages) {
                        setChatMessages(data.chatHistory.messages);
                    }
                    setChatHistoryLoaded(true);
                })
                .catch(err => {
                    console.error('Failed to load chat history:', err);
                    setChatHistoryLoaded(true);
                });

            // Load artifacts and build artifactsById map
            fetch(`/api/ticket-artifacts/${ticket.id}`)
                .then(res => res.json())
                .then(data => {
                    if (data.artifacts && data.artifacts.length > 0) {
                        // Build a map of artifacts by ID for inline display
                        const artifactMap: Record<string, TicketArtifact> = {};
                        data.artifacts.forEach((artifact: TicketArtifact) => {
                            artifactMap[artifact.id] = artifact;
                        });
                        setArtifactsById(artifactMap);
                    }
                })
                .catch(err => {
                    console.error('Failed to load artifacts:', err);
                });
        } else if (!isOpen) {
            // Reset state when modal closes
            setChatHistoryLoaded(false);
            setArtifactsById({});
            setSelectedArtifact(null);
            setShowArtifactViewer(false);
        }
    }, [isOpen, ticket?.id, chatHistoryLoaded]);

    // Auto-scroll chat to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [chatMessages, streamingMessage]);

    // Cleanup sockets on unmount
    useEffect(() => {
        return () => {
            if (chatSocketRef.current) {
                chatSocketRef.current.disconnect();
                chatSocketRef.current = null;
            }
            if (ticketSocketRef.current) {
                ticketSocketRef.current.disconnect();
                ticketSocketRef.current = null;
            }
        };
    }, []);

    // Auto-resize chat input
    useEffect(() => {
        if (chatInputRef.current) {
            chatInputRef.current.style.height = 'auto';
            chatInputRef.current.style.height = `${Math.min(chatInputRef.current.scrollHeight, 120)}px`;
        }
    }, [chatInput]);

    // Save chat history
    const saveChatHistory = useCallback(async (messages: TicketChatMessage[], ticketId: string) => {
        try {
            await fetch('/api/ticket-chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ticketId, messages }),
            });
        } catch (error) {
            console.error('Failed to save chat history:', error);
        }
    }, []);

    // Handle close with confirmation for unsaved changes in create mode
    const handleCloseWithConfirmation = useCallback(() => {
        if (!isEditMode && hasUnsavedChanges) {
            if (!confirm('You have unsaved changes. Are you sure you want to discard them?')) {
                return;
            }
        }
        onClose();
    }, [isEditMode, hasUnsavedChanges, onClose]);

    // Handle escape key to close
    useEffect(() => {
        function handleEscape(e: KeyboardEvent) {
            if (e.key === 'Escape' && isOpen) {
                handleCloseWithConfirmation();
            }
        }
        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [isOpen, handleCloseWithConfirmation]);

    // Warn user before leaving page with unsaved changes in create mode
    useEffect(() => {
        function handleBeforeUnload(e: BeforeUnloadEvent) {
            if (isOpen && !isEditMode && hasUnsavedChanges) {
                e.preventDefault();
                e.returnValue = '';
            }
        }

        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [isOpen, isEditMode, hasUnsavedChanges]);

    // Generate ticket from requirements
    async function generateTicketFromRequirements(reqs: { title: string; context: string }) {
        setIsGeneratingTicket(true);

        try {
            const { io } = await import('socket.io-client');
            const socket = io('/generate-ticket');
            ticketSocketRef.current = socket;

            socket.on('connect', () => {
                const systemPrompt = `You are a technical project manager creating detailed tickets.`;
                const userPrompt = `Title: ${reqs.title}\nContext: ${reqs.context}`;
                socket.emit('generate', { systemPrompt, userPrompt });
            });

            socket.on('complete', async (data: any) => {
                const generatedTicketData: GeneratedTicket = {
                    title: reqs.title,
                    description: data.description || '',
                    implementationSteps: data.implementationSteps || [],
                    acceptanceCriteria: data.acceptanceCriteria || [],
                };
                setGeneratedTicket(generatedTicketData);

                // Create a ticket artifact for display
                // Use actual ticket ID if editing, otherwise 'pending' for new tickets
                const artifactTicketId = ticket?.id || 'pending';
                const artifactId = crypto.randomUUID();
                const artifact: TicketArtifact = {
                    id: artifactId,
                    type: 'ticket',
                    title: generatedTicketData.title,
                    createdAt: new Date().toISOString(),
                    ticketId: artifactTicketId,
                    content: {
                        title: generatedTicketData.title,
                        description: generatedTicketData.description,
                        implementationSteps: generatedTicketData.implementationSteps,
                        acceptanceCriteria: generatedTicketData.acceptanceCriteria,
                    },
                };

                // Add artifact to the map for inline display
                setArtifactsById(prev => ({ ...prev, [artifactId]: artifact }));

                // Update the last assistant message to link it to this artifact and save chat history
                setChatMessages(prevMessages => {
                    if (prevMessages.length === 0) return prevMessages;
                    const updatedMessages = [...prevMessages];
                    // Find the last assistant message and link the artifact to it
                    for (let i = updatedMessages.length - 1; i >= 0; i--) {
                        if (updatedMessages[i].role === 'assistant') {
                            updatedMessages[i] = {
                                ...updatedMessages[i],
                                artifactId: artifactId,
                            };
                            break;
                        }
                    }

                    // Save chat history with updated messages (including artifactId)
                    if (ticket?.id) {
                        saveChatHistory(updatedMessages, ticket.id);
                    }

                    return updatedMessages;
                });

                // Save artifact to file system if we have a ticket ID
                if (ticket?.id) {
                    try {
                        await fetch(`/api/ticket-artifacts/${ticket.id}`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(artifact),
                        });
                    } catch (err) {
                        console.error('Failed to save artifact:', err);
                    }
                }

                // Apply generated ticket to form
                setTitle(generatedTicketData.title);
                setDescription(generatedTicketData.description);
                setImplementationSteps(generatedTicketData.implementationSteps);
                setAcceptanceCriteria(generatedTicketData.acceptanceCriteria);
                setIsGeneratingTicket(false);
                socket.disconnect();
                ticketSocketRef.current = null;
            });

            socket.on('error', (error: any) => {
                console.error('Generation error:', error);
                setIsGeneratingTicket(false);
                socket.disconnect();
                ticketSocketRef.current = null;
            });
        } catch (error) {
            console.error('Socket error:', error);
            setIsGeneratingTicket(false);
        }
    }

    // Cancel ticket generation
    function cancelTicketGeneration() {
        if (ticketSocketRef.current) {
            ticketSocketRef.current.disconnect();
            ticketSocketRef.current = null;
        }
        setIsGeneratingTicket(false);
    }

    // Send chat message
    async function handleSendMessage() {
        if (!chatInput.trim() || isLoadingChat) return;

        const userMessage: TicketChatMessage = {
            id: crypto.randomUUID(),
            role: 'user',
            content: chatInput.trim(),
            timestamp: new Date().toISOString(),
        };

        const updatedMessages = [...chatMessages, userMessage];
        setChatMessages(updatedMessages);
        setChatInput('');
        setIsLoadingChat(true);
        setStreamingMessage('');

        try {
            const { io } = await import('socket.io-client');
            const socket = io('/generate-ticket-conversation');
            chatSocketRef.current = socket;

            socket.on('connect', () => {
                const conversationHistory = updatedMessages.map(m => ({
                    role: m.role,
                    content: m.content,
                }));
                socket.emit('chat', {
                    messages: conversationHistory,
                    contextRepoFiles: selectedRepoFiles.join(','),
                    contextDocsPages: selectedDocsPages.join(','),
                    contextUrls: selectedUrls.join(','),
                });
            });

            socket.on('stream', (data: { content: string }) => {
                setStreamingMessage(prev => prev + data.content);
            });

            socket.on('complete', (data: {
                content: string;
                requirements?: { title: string; context: string };
                isReady?: boolean;
            }) => {
                const assistantMessage: TicketChatMessage = {
                    id: crypto.randomUUID(),
                    role: 'assistant',
                    content: data.content || streamingMessage,
                    timestamp: new Date().toISOString(),
                };

                const newMessages = [...updatedMessages, assistantMessage];
                setChatMessages(newMessages);
                setStreamingMessage('');

                // Save chat history only if no requirements (artifact generation pending)
                // If requirements exist, we save after artifact is linked in generateTicketFromRequirements
                if (ticket?.id && !data.requirements) {
                    saveChatHistory(newMessages, ticket.id);
                }

                if (data.requirements) {
                    generateTicketFromRequirements(data.requirements);
                }

                setIsLoadingChat(false);
                socket.disconnect();
                chatSocketRef.current = null;
            });

            socket.on('error', (error: any) => {
                console.error('Chat error:', error);
                const errorMessage: TicketChatMessage = {
                    id: crypto.randomUUID(),
                    role: 'assistant',
                    content: 'Sorry, I encountered an error. Please try again.',
                    timestamp: new Date().toISOString(),
                };
                setChatMessages([...updatedMessages, errorMessage]);
                setStreamingMessage('');
                setIsLoadingChat(false);
                socket.disconnect();
                chatSocketRef.current = null;
            });
        } catch (error) {
            console.error('Socket error:', error);
            setIsLoadingChat(false);
        }
    }

    function handleChatKeyDown(e: React.KeyboardEvent) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    }

    function handlePromptClick(prompt: string) {
        setChatInput(prompt);
        chatInputRef.current?.focus();
    }

    // Save ticket (create or update)
    async function handleSave() {
        if (!title.trim()) {
            toast.warning('Please enter a title');
            return;
        }

        setIsSaving(true);

        try {
            if (isEditMode && ticket?.id) {
                // Update existing ticket
                await updateTicket(ticket.id, {
                    title,
                    description,
                    owner,
                    priority,
                    notes,
                    tags,
                    acceptance_criteria: acceptanceCriteria,
                    implementation_steps: implementationSteps,
                }, boardId);

                // Save chat history with ticket
                if (chatMessages.length > 0) {
                    await saveChatHistory(chatMessages, ticket.id);
                }
                toast.success('Ticket updated successfully');
            } else {
                // Create new ticket
                const formData = new FormData();
                formData.set('title', title);
                formData.set('description', description);
                formData.set('priority', priority);
                formData.set('acceptance_criteria', JSON.stringify(acceptanceCriteria));
                formData.set('implementation_steps', JSON.stringify(implementationSteps));
                formData.set('boardId', boardId);

                const result = await createTicket(formData);

                // Save chat history and artifacts for new ticket
                if (result?.ticket?.id) {
                    if (chatMessages.length > 0) {
                        await saveChatHistory(chatMessages, result.ticket.id);
                    }

                    // Save all artifacts with the new ticket ID
                    const artifacts = Object.values(artifactsById);
                    for (const artifact of artifacts) {
                        const artifactWithTicketId = {
                            ...artifact,
                            ticketId: result.ticket.id,
                        };
                        try {
                            await fetch(`/api/ticket-artifacts/${result.ticket.id}`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(artifactWithTicketId),
                            });
                        } catch (err) {
                            console.error('Failed to save artifact:', err);
                        }
                    }
                }

                // Reset form state after successful creation
                resetFormState();
                toast.success('Ticket created successfully');
            }

            onClose();
        } catch (error) {
            console.error('Failed to save ticket:', error);
            toast.error('Failed to save ticket. Please try again.');
        } finally {
            setIsSaving(false);
        }
    }

    // Delete ticket
    async function handleDelete() {
        if (!ticket?.id) return;
        if (!confirm('Are you sure you want to delete this ticket?')) return;

        try {
            // Delete the ticket (chat history cleanup happens on server)
            await deleteTicket(ticket.id, boardId);
            toast.success('Ticket deleted successfully');
            onClose();
        } catch (error) {
            console.error('Failed to delete ticket:', error);
            toast.error('Failed to delete ticket. Please try again.');
        }
    }

    // Delete artifact
    async function handleDeleteArtifact(artifactId: string) {
        if (!ticket?.id) return;
        if (!confirm('Are you sure you want to delete this artifact?')) return;

        try {
            const response = await fetch(
                `/api/ticket-artifacts/${ticket.id}?artifactId=${artifactId}`,
                { method: 'DELETE' }
            );

            if (!response.ok) throw new Error('Failed to delete artifact');

            // Remove from artifactsById
            setArtifactsById(prev => {
                const updated = { ...prev };
                delete updated[artifactId];
                return updated;
            });

            // Clear artifactId from linked message and save
            const updatedMessages = chatMessages.map(msg =>
                msg.artifactId === artifactId
                    ? { ...msg, artifactId: undefined }
                    : msg
            );
            setChatMessages(updatedMessages);
            await saveChatHistory(updatedMessages, ticket.id);

            // Close viewer if this artifact was selected
            if (selectedArtifact?.id === artifactId) {
                setShowArtifactViewer(false);
                setSelectedArtifact(null);
            }

            toast.success('Artifact deleted');
        } catch (error) {
            console.error('Failed to delete artifact:', error);
            toast.error('Failed to delete artifact');
        }
    }

    // Archive ticket
    async function handleArchive() {
        if (!ticket?.id) return;

        // Get the ticket's current status (might be on TicketWithStatus)
        const ticketStatus = (ticket as any).status || 'backlog';

        try {
            // Use context's archiveTicket which includes undo functionality
            await archiveTicket(ticket.id, ticketStatus);
            onClose();
        } catch (error) {
            console.error('Failed to archive ticket:', error);
            toast.error('Failed to archive ticket. Please try again.');
        }
    }

    function addTag() {
        if (newTag.trim() && !tags.includes(newTag.trim())) {
            setTags([...tags, newTag.trim()]);
            setNewTag('');
        }
    }

    function removeTag(tag: string) {
        setTags(tags.filter(t => t !== tag));
    }

    if (!mounted) return null;

    const showWelcome = chatMessages.length === 0 && !isEditMode;

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
                                    {isEditMode ? 'Edit Ticket' : 'Create New Ticket'}
                                </h2>
                                {ticket?.id && (
                                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">{ticket.id}</p>
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
                            {/* Left Panel - Chat Interface (40%) */}
                            <div className="w-[40%] flex flex-col overflow-hidden bg-white dark:bg-[#0d0d0d] border-r border-gray-200 dark:border-gray-700">
                                {/* Chat Messages Area */}
                                <div className="flex-1 overflow-y-auto p-4">
                                    {showWelcome ? (
                                        <div className="h-full flex flex-col items-center justify-center text-center px-4">
                                            <div className="w-full max-w-md">
                                                <h3 className="text-lg font-medium text-gray-800 dark:text-gray-200 mb-2">
                                                    What do you want to build?
                                                </h3>
                                                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                                                    Describe your task and AI will help you create a detailed ticket
                                                </p>

                                                {/* Suggested Prompts */}
                                                <div className="flex flex-wrap gap-2 mb-4 justify-center">
                                                    {SUGGESTED_PROMPTS.map((suggestion, index) => (
                                                        <button
                                                            key={index}
                                                            onClick={() => handlePromptClick(suggestion.prompt)}
                                                            className="px-3 py-1.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full text-xs text-gray-700 dark:text-gray-300 transition-colors border border-gray-300 dark:border-gray-700"
                                                        >
                                                            {suggestion.icon} {suggestion.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="space-y-4">
                                            {chatMessages.map((message) => (
                                                <div key={message.id}>
                                                    {/* Message bubble */}
                                                    <div
                                                        className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                                                    >
                                                        <div
                                                            className={`max-w-[85%] rounded-2xl px-4 py-3 ${message.role === 'user'
                                                                ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white'
                                                                : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
                                                                }`}
                                                        >
                                                            <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                                                        </div>
                                                    </div>

                                                    {/* Inline artifact card right after the assistant message that generated it */}
                                                    {message.artifactId && artifactsById[message.artifactId] && (
                                                        <div className="flex justify-start mt-2">
                                                            <div className="max-w-[85%]">
                                                                <ArtifactCard
                                                                    artifact={artifactsById[message.artifactId]}
                                                                    isSelected={selectedArtifact?.id === message.artifactId && showArtifactViewer}
                                                                    onClick={() => {
                                                                        setSelectedArtifact(artifactsById[message.artifactId]);
                                                                        setShowArtifactViewer(true);
                                                                    }}
                                                                    onDelete={handleDeleteArtifact}
                                                                />
                                                            </div>
                                                        </div>
                                                    )}
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
                                            {isLoadingChat && !streamingMessage && (
                                                <div className="flex justify-start">
                                                    <div className="max-w-[85%] rounded-2xl px-4 py-3 bg-gray-100 dark:bg-gray-800">
                                                        <div className="flex items-center gap-2">
                                                            <div className="flex gap-1">
                                                                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                                                                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                                                                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                                                            </div>
                                                            <span className="text-sm text-gray-600 dark:text-gray-400">Claude is thinking...</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Generating Ticket Progress - Inline in chat */}
                                            {isGeneratingTicket && (
                                                <div className="flex justify-start">
                                                    <div className="max-w-[85%] p-4 bg-purple-900/20 border border-purple-800 rounded-2xl">
                                                        <div className="flex items-center justify-between gap-4">
                                                            <div className="flex items-center gap-2">
                                                                <svg className="w-5 h-5 text-purple-400 animate-spin" fill="none" viewBox="0 0 24 24">
                                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                                </svg>
                                                                <span className="font-medium text-purple-300 text-sm">Generating ticket...</span>
                                                            </div>
                                                            <button
                                                                onClick={cancelTicketGeneration}
                                                                className="px-2 py-1 text-xs text-purple-400 hover:text-purple-200 hover:bg-purple-800/30 rounded transition-colors"
                                                            >
                                                                Cancel
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Fallback: Show unlinked artifacts at the end (for backwards compatibility with old data) */}
                                            {(() => {
                                                // Find artifacts that aren't linked to any message
                                                const linkedArtifactIds = new Set(
                                                    chatMessages
                                                        .filter(m => m.artifactId)
                                                        .map(m => m.artifactId)
                                                );
                                                const unlinkedArtifacts = Object.values(artifactsById)
                                                    .filter(artifact => !linkedArtifactIds.has(artifact.id));

                                                if (unlinkedArtifacts.length === 0) return null;

                                                return unlinkedArtifacts.map(artifact => (
                                                    <div key={artifact.id} className="flex justify-start">
                                                        <div className="max-w-[85%]">
                                                            <ArtifactCard
                                                                artifact={artifact}
                                                                isSelected={selectedArtifact?.id === artifact.id && showArtifactViewer}
                                                                onClick={() => {
                                                                    setSelectedArtifact(artifact);
                                                                    setShowArtifactViewer(true);
                                                                }}
                                                                onDelete={handleDeleteArtifact}
                                                            />
                                                        </div>
                                                    </div>
                                                ));
                                            })()}

                                            <div ref={messagesEndRef} />
                                        </div>
                                    )}
                                </div>

                                {/* Chat Input */}
                                <div className="p-4 border-t border-gray-200 dark:border-gray-700">
                                    <div className="relative">
                                        <textarea
                                            ref={chatInputRef}
                                            value={chatInput}
                                            onChange={(e) => setChatInput(e.target.value)}
                                            onKeyDown={handleChatKeyDown}
                                            placeholder={showWelcome ? "Describe what you want to build..." : "Continue the conversation..."}
                                            rows={2}
                                            disabled={isLoadingChat}
                                            className="w-full px-4 py-3 pr-14 border border-gray-300 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 resize-none focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:opacity-50 text-sm"
                                        />
                                        <button
                                            onClick={handleSendMessage}
                                            disabled={!chatInput.trim() || isLoadingChat}
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

                            {/* Right Panel - Context Selector OR Artifact Viewer (60%) */}
                            <div className="w-[60%] flex flex-col overflow-hidden bg-white dark:bg-[#0d0d0d]">
                                {showArtifactViewer && selectedArtifact ? (
                                    <div className="h-full overflow-y-auto">
                                        <ArtifactViewer
                                            artifact={selectedArtifact}
                                            onClose={() => {
                                                setShowArtifactViewer(false);
                                                setSelectedArtifact(null);
                                            }}
                                            onDelete={handleDeleteArtifact}
                                        />
                                    </div>
                                ) : (
                                <ContextSelector
                                    selectedDocsPages={selectedDocsPages}
                                    onDocsSelectionChange={setSelectedDocsPages}
                                    selectedRepoFiles={selectedRepoFiles}
                                    onRepoFilesSelectionChange={setSelectedRepoFiles}
                                    selectedUrls={selectedUrls}
                                    onUrlsSelectionChange={setSelectedUrls}
                                    ticket={ticket}
                                    maxHeight="max-h-full"
                                    className="h-full p-4"
                                    hideTicketBadge
                                    hideSettingsTab
                                    ticketTabContent={
                                        <div className="space-y-4">
                                            {/* Title */}
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Title *</label>
                                                <input
                                                    type="text"
                                                    value={title}
                                                    onChange={(e) => setTitle(e.target.value)}
                                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                                                    placeholder="What needs to be done"
                                                />
                                            </div>

                                            {/* Description */}
                                            <div>
                                                <div className="flex items-center justify-between mb-1.5">
                                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Description</label>
                                                    <button
                                                        onClick={() => setShowMarkdownPreview(!showMarkdownPreview)}
                                                        className="text-xs text-purple-600 dark:text-purple-400 hover:text-purple-500 dark:hover:text-purple-300"
                                                    >
                                                        {showMarkdownPreview ? 'Edit' : 'Preview'}
                                                    </button>
                                                </div>
                                                {showMarkdownPreview ? (
                                                    <div className="w-full min-h-[100px] px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900 prose dark:prose-invert prose-sm max-w-none text-sm">
                                                        <ReactMarkdown>{description}</ReactMarkdown>
                                                    </div>
                                                ) : (
                                                    <textarea
                                                        value={description}
                                                        onChange={(e) => setDescription(e.target.value)}
                                                        rows={3}
                                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500 focus:border-transparent font-mono text-sm"
                                                        placeholder="Detailed description (supports markdown)"
                                                    />
                                                )}
                                            </div>

                                            {/* Implementation Steps */}
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Implementation Steps</label>
                                                <div className="space-y-1.5">
                                                    {implementationSteps.map((step, i) => (
                                                        <div key={i} className="flex items-center gap-2 p-2 bg-gray-100 dark:bg-gray-800 rounded">
                                                            <input
                                                                type="checkbox"
                                                                checked={step.completed}
                                                                onChange={(e) => {
                                                                    const updated = implementationSteps.map((item, idx) =>
                                                                        idx === i ? { ...item, completed: e.target.checked } : item
                                                                    );
                                                                    setImplementationSteps(updated);
                                                                }}
                                                                className="w-3.5 h-3.5"
                                                            />
                                                            <input
                                                                type="text"
                                                                value={step.text}
                                                                onChange={(e) => {
                                                                    const updated = implementationSteps.map((item, idx) =>
                                                                        idx === i ? { ...item, text: e.target.value } : item
                                                                    );
                                                                    setImplementationSteps(updated);
                                                                }}
                                                                className="flex-1 px-2 py-1 text-xs bg-transparent border-none focus:outline-none text-gray-900 dark:text-gray-100"
                                                            />
                                                            <button
                                                                type="button"
                                                                onClick={() => setImplementationSteps(implementationSteps.filter((_, idx) => idx !== i))}
                                                                className="text-red-500 dark:text-red-400 hover:text-red-600 dark:hover:text-red-300 text-xs"
                                                            >
                                                                ×
                                                            </button>
                                                        </div>
                                                    ))}
                                                    <button
                                                        type="button"
                                                        onClick={() => setImplementationSteps([...implementationSteps, { text: '', completed: false }])}
                                                        className="text-xs text-purple-600 dark:text-purple-400 hover:text-purple-500 dark:hover:text-purple-300"
                                                    >
                                                        + Add Step
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Acceptance Criteria */}
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Acceptance Criteria</label>
                                                <div className="space-y-1.5">
                                                    {acceptanceCriteria.map((criterion, i) => (
                                                        <div key={i} className="flex items-center gap-2 p-2 bg-gray-100 dark:bg-gray-800 rounded">
                                                            <input
                                                                type="checkbox"
                                                                checked={criterion.completed}
                                                                onChange={(e) => {
                                                                    const updated = acceptanceCriteria.map((item, idx) =>
                                                                        idx === i ? { ...item, completed: e.target.checked } : item
                                                                    );
                                                                    setAcceptanceCriteria(updated);
                                                                }}
                                                                className="w-3.5 h-3.5"
                                                            />
                                                            <input
                                                                type="text"
                                                                value={criterion.text}
                                                                onChange={(e) => {
                                                                    const updated = acceptanceCriteria.map((item, idx) =>
                                                                        idx === i ? { ...item, text: e.target.value } : item
                                                                    );
                                                                    setAcceptanceCriteria(updated);
                                                                }}
                                                                className="flex-1 px-2 py-1 text-xs bg-transparent border-none focus:outline-none text-gray-900 dark:text-gray-100"
                                                            />
                                                            <button
                                                                type="button"
                                                                onClick={() => setAcceptanceCriteria(acceptanceCriteria.filter((_, idx) => idx !== i))}
                                                                className="text-red-500 dark:text-red-400 hover:text-red-600 dark:hover:text-red-300 text-xs"
                                                            >
                                                                ×
                                                            </button>
                                                        </div>
                                                    ))}
                                                    <button
                                                        type="button"
                                                        onClick={() => setAcceptanceCriteria([...acceptanceCriteria, { text: '', completed: false }])}
                                                        className="text-xs text-purple-600 dark:text-purple-400 hover:text-purple-500 dark:hover:text-purple-300"
                                                    >
                                                        + Add Criterion
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Priority & Owner Row */}
                                            <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Priority</label>
                                                    <select
                                                        value={priority}
                                                        onChange={(e) => setPriority(e.target.value as any)}
                                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm"
                                                    >
                                                        <option value="low">Low</option>
                                                        <option value="medium">Medium</option>
                                                        <option value="high">High</option>
                                                        <option value="critical">Critical</option>
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Owner</label>
                                                    <select
                                                        value={owner}
                                                        onChange={(e) => setOwner(e.target.value)}
                                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm"
                                                    >
                                                        <option value="">Unassigned</option>
                                                        {teamMembers.filter(m => m.type === 'human').map((member) => (
                                                            <option key={member.id} value={member.id}>{member.name}</option>
                                                        ))}
                                                        {teamMembers.filter(m => m.type === 'ai_agent').map((member) => (
                                                            <option key={member.id} value={member.id}>{member.name} (AI)</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            </div>

                                            {/* Tags */}
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Tags</label>
                                                <div className="flex flex-wrap gap-1.5 mb-2">
                                                    {tags.map((tag) => (
                                                        <span
                                                            key={tag}
                                                            className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded text-xs"
                                                        >
                                                            {tag}
                                                            <button
                                                                onClick={() => removeTag(tag)}
                                                                className="hover:text-purple-900 dark:hover:text-purple-100"
                                                            >
                                                                ×
                                                            </button>
                                                        </span>
                                                    ))}
                                                </div>
                                                <div className="flex gap-2">
                                                    <input
                                                        type="text"
                                                        value={newTag}
                                                        onChange={(e) => setNewTag(e.target.value)}
                                                        onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                                                        placeholder="Add tag..."
                                                        className="flex-1 px-3 py-1.5 text-xs border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                                                    />
                                                    <button
                                                        onClick={addTag}
                                                        className="px-3 py-1.5 text-xs bg-purple-600 text-white rounded-lg hover:bg-purple-700"
                                                    >
                                                        Add
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Notes */}
                                            {isEditMode && (
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Notes</label>
                                                    <textarea
                                                        value={notes}
                                                        onChange={(e) => setNotes(e.target.value)}
                                                        rows={2}
                                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                                                        placeholder="Optional progress notes..."
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    }
                                />
                                )}
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="px-6 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#1a1a1a] flex items-center justify-between">
                            <div className="flex gap-2">
                                {isEditMode && (
                                    <>
                                        <button
                                            onClick={handleArchive}
                                            className="px-4 py-2 text-sm text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/20 rounded-lg transition-colors flex items-center gap-1.5"
                                            title="Archive this ticket"
                                        >
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                                            </svg>
                                            Archive
                                        </button>
                                        <button
                                            onClick={handleDelete}
                                            className="px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                        >
                                            Delete Ticket
                                        </button>
                                    </>
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
                                    disabled={isSaving || !title.trim()}
                                    className="px-6 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isSaving ? 'Saving...' : isEditMode ? 'Save Changes' : 'Create Ticket'}
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
