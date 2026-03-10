'use client'

import { useState, useRef, useEffect, useCallback } from 'react';
import type { Socket } from 'socket.io-client';
import type { FileAttachment } from '@/lib/schemas';
import { ALLOWED_EXTENSIONS, MAX_FILE_SIZE_BYTES } from '@/lib/schemas';
import { handleImagePaste } from '@/lib/clipboard-utils';
import ContextSelector from './ContextSelector';

interface TicketData {
    title: string;
    description: string;
    implementationSteps: Array<{ text: string; completed: boolean }>;
    acceptanceCriteria: Array<{ text: string; completed: boolean }>;
    notes: string;
    tags: string[];
    priority: string;
}

interface EditWithAIChatProps {
    currentTicket: TicketData;
    onApplyChanges: (changes: Partial<Omit<TicketData, 'title'>>) => void;
    onSwitchToManual: () => void;
    ticketId: string;
    attachedFiles: FileAttachment[];
    onFilesChange: (files: FileAttachment[]) => void;
}

const SUGGESTED_PROMPTS = [
    {
        label: 'Shorter description',
        prompt: 'Make the description more concise while keeping the key points',
    },
    {
        label: 'More detail',
        prompt: 'Add more detail and context to the description',
    },
    {
        label: 'Add criteria',
        prompt: 'Add more acceptance criteria to cover edge cases',
    },
    {
        label: 'Simplify steps',
        prompt: 'Simplify the implementation steps and make them clearer',
    },
];

export function EditWithAIChat({
    currentTicket,
    onApplyChanges,
    onSwitchToManual,
    ticketId,
    attachedFiles,
    onFilesChange,
}: EditWithAIChatProps) {
    const [inputValue, setInputValue] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [generationLogs, setGenerationLogs] = useState<string[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [isComplete, setIsComplete] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [showContextSelectors, setShowContextSelectors] = useState(false);
    const [selectedRepoFiles, setSelectedRepoFiles] = useState<string[]>([]);
    const [selectedDocsPages, setSelectedDocsPages] = useState<string[]>([]);
    const socketRef = useRef<Socket | null>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileUpload = useCallback(async (files: FileList | null) => {
        if (!files || files.length === 0) return;

        setIsUploading(true);
        setError(null);

        const newFiles: FileAttachment[] = [];
        const errors: string[] = [];

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            if (!file) continue;

            if (file.size > MAX_FILE_SIZE_BYTES) {
                errors.push(`${file.name}: File size exceeds 5MB limit`);
                continue;
            }

            try {
                const formData = new FormData();
                formData.append('file', file);
                formData.append('parent_type', 'ticket');
                formData.append('parent_id', ticketId);

                const response = await fetch('/api/files', {
                    method: 'POST',
                    body: formData,
                });

                const data = await response.json();

                if (!response.ok) {
                    errors.push(`${file.name}: ${data.error || 'Upload failed'}`);
                    continue;
                }

                if (data.file) {
                    newFiles.push(data.file);
                }
            } catch {
                errors.push(`${file.name}: Upload failed`);
            }
        }

        if (newFiles.length > 0) {
            onFilesChange([...attachedFiles, ...newFiles]);
        }

        if (errors.length > 0) {
            setError(errors.join('\n'));
        }

        setIsUploading(false);

        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    }, [ticketId, attachedFiles, onFilesChange]);

    const handleDeleteFile = useCallback(async (fileId: string) => {
        try {
            const response = await fetch(`/api/files?file_id=${fileId}`, {
                method: 'DELETE',
            });

            if (response.ok) {
                onFilesChange(attachedFiles.filter(f => f.id !== fileId));
            }
        } catch {
            setError('Failed to delete file');
        }
    }, [attachedFiles, onFilesChange]);

    // Handle paste event for images
    const handlePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
        // Don't process paste during generation or upload
        if (isGenerating || isUploading) return;

        const result = handleImagePaste(e);

        // If no images were found, let the default paste behavior happen
        if (!result.hasImages) return;

        // Show errors for rejected files
        if (result.errors.length > 0) {
            setError(result.errors.join('\n'));
        }

        // Upload valid images
        if (result.files.length > 0) {
            // Create a DataTransfer to convert File[] to FileList
            const dataTransfer = new DataTransfer();
            result.files.forEach(file => dataTransfer.items.add(file));
            handleFileUpload(dataTransfer.files);
        }
    }, [isGenerating, isUploading, handleFileUpload]);

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

    function handlePromptClick(prompt: string) {
        setInputValue(prompt);
        inputRef.current?.focus();
    }

    async function handleGenerate() {
        if (!inputValue.trim() || isGenerating) return;

        setIsGenerating(true);
        setGenerationLogs([]);
        setError(null);
        setIsComplete(false);

        try {
            const { io } = await import('socket.io-client');
            const socket = io('/generate-ticket');
            socketRef.current = socket;

            socket.on('connect', () => {
                // Create enhanced system prompt for edit mode
                const systemPrompt = `You are a technical project manager helping to modify an existing ticket.

CURRENT TICKET STATE:
Title: ${currentTicket.title}
Description: ${currentTicket.description}
Implementation Steps: ${currentTicket.implementationSteps.map((s, i) => `${i + 1}. ${s.text}`).join('\n')}
Acceptance Criteria: ${currentTicket.acceptanceCriteria.map((c, i) => `${i + 1}. ${c.text}`).join('\n')}
Notes: ${currentTicket.notes || 'None'}
Tags: ${currentTicket.tags.join(', ') || 'None'}
Priority: ${currentTicket.priority}

IMPORTANT: You are MODIFYING an existing ticket, not creating from scratch. The user's request should be interpreted in the context of the current ticket state. For example:
- "make it shorter" means make the current description shorter
- "add more detail" means expand on the existing content
- "add error handling" means add error handling steps to existing implementation

Generate modifications based on the user's request. Preserve existing completed states for steps and criteria when making edits.`;

                const userPrompt = `Please modify the ticket based on this request: ${inputValue}`;

                socket.emit('generate', {
                    systemPrompt,
                    userPrompt,
                    currentTicket: {
                        description: currentTicket.description,
                        implementation_steps: currentTicket.implementationSteps,
                        acceptance_criteria: currentTicket.acceptanceCriteria,
                        notes: currentTicket.notes,
                        tags: currentTicket.tags,
                        priority: currentTicket.priority,
                    },
                    isEditMode: true,
                    contextRepoFiles: selectedRepoFiles.join(','),
                    contextDocsPages: selectedDocsPages.join(','),
                });
            });

            socket.on('log', (data: string) => {
                setGenerationLogs(prev => [...prev, data]);
            });

            socket.on('complete', (data: any) => {
                // Apply changes - exclude title (never modified by AI)
                const changes: Partial<Omit<TicketData, 'title'>> = {};

                if (data.description) {
                    changes.description = data.description;
                }
                if (data.implementationSteps) {
                    changes.implementationSteps = data.implementationSteps;
                }
                if (data.acceptanceCriteria) {
                    changes.acceptanceCriteria = data.acceptanceCriteria;
                }
                if (data.notes !== undefined) {
                    changes.notes = data.notes;
                }
                if (data.tags !== undefined) {
                    changes.tags = data.tags;
                }
                if (data.priority !== undefined) {
                    changes.priority = data.priority;
                }

                onApplyChanges(changes);
                setIsGenerating(false);
                setIsComplete(true);
                setInputValue('');
                socket.disconnect();
                socketRef.current = null;

                // Switch to manual tab so user can review changes
                onSwitchToManual();
            });

            socket.on('error', (errorMsg: any) => {
                console.error('Generation error:', errorMsg);
                setError(typeof errorMsg === 'string' ? errorMsg : 'Failed to generate modifications');
                setIsGenerating(false);
                socket.disconnect();
                socketRef.current = null;
            });
        } catch (err) {
            console.error('Socket error:', err);
            setError('Failed to connect to AI service');
            setIsGenerating(false);
        }
    }

    function handleKeyDown(e: React.KeyboardEvent) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleGenerate();
        }
    }

    return (
        <div className="flex flex-col h-full">
            {/* Main Content Area */}
            <div className="flex-1 overflow-y-auto p-6">
                <div className="h-full flex flex-col items-center justify-center text-center px-4">

                    {/* Input Area */}
                    <div className="w-full max-w-lg">
                        {/* Suggested Prompts */}
                        <div className="flex flex-wrap gap-1.5 mb-2">
                            {SUGGESTED_PROMPTS.map((suggestion, index) => (
                                <button
                                    key={index}
                                    onClick={() => handlePromptClick(suggestion.prompt)}
                                    disabled={isGenerating}
                                    className="px-3 py-1 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full text-xs text-gray-600 dark:text-gray-400 transition-colors border border-gray-200 dark:border-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {suggestion.label}
                                </button>
                            ))}
                        </div>

                        {/* Hidden file input */}
                        <input
                            ref={fileInputRef}
                            type="file"
                            multiple
                            accept={ALLOWED_EXTENSIONS.join(',')}
                            onChange={(e) => handleFileUpload(e.target.files)}
                            className="hidden"
                            disabled={isGenerating || isUploading}
                        />

                        {/* Attached files preview */}
                        {attachedFiles.length > 0 && (
                            <div className="flex flex-wrap gap-2 mb-3">
                                {attachedFiles.map((file) => (
                                    <div
                                        key={file.id}
                                        className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 rounded-lg text-sm group"
                                    >
                                        {file.mime_type.startsWith('image/') ? (
                                            <img
                                                src={`/api/files/${file.id}`}
                                                alt={file.original_filename}
                                                className="w-5 h-5 object-cover rounded"
                                            />
                                        ) : (
                                            <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                            </svg>
                                        )}
                                        <span className="text-gray-700 dark:text-gray-300 max-w-[120px] truncate">
                                            {file.original_filename}
                                        </span>
                                        <button
                                            onClick={() => handleDeleteFile(file.id)}
                                            className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Input with attach button */}
                        <div className="relative">
                            <textarea
                                ref={inputRef}
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                onKeyDown={handleKeyDown}
                                onPaste={handlePaste}
                                placeholder="Describe the changes you want..."
                                rows={4}
                                disabled={isGenerating}
                                className="w-full px-4 py-4 pl-20 border border-gray-300 dark:border-gray-700 rounded-2xl bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 resize-none focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:opacity-50 text-base"
                            />
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={isGenerating || isUploading}
                                className="absolute left-3 top-4 p-1.5 text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 disabled:opacity-50 transition-colors"
                                title="Attach files"
                            >
                                {isUploading ? (
                                    <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                    </svg>
                                ) : (
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                                    </svg>
                                )}
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowContextSelectors(prev => !prev)}
                                disabled={isGenerating}
                                className={`absolute left-10 top-4 p-1.5 ${showContextSelectors ? 'text-purple-600 dark:text-purple-400' : 'text-gray-400'} hover:text-purple-600 dark:hover:text-purple-400 disabled:opacity-50 transition-colors`}
                                title="Add context from repo files"
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                </svg>
                            </button>
                        </div>
                        <div className="flex items-center justify-between mt-2">
                            <p className="text-xs text-gray-400 dark:text-gray-500">
                                Press Enter to generate, Shift+Enter for new line
                            </p>
                            <button
                                onClick={handleGenerate}
                                disabled={!inputValue.trim() || isGenerating}
                                className="px-4 py-1.5 text-sm font-medium bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg hover:from-purple-700 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                            >
                                {isGenerating ? 'Generating...' : 'Generate'}
                            </button>
                        </div>
                        {showContextSelectors && (
                            <>
                                <ContextSelector
                                    selectedDocsPages={selectedDocsPages}
                                    onDocsSelectionChange={setSelectedDocsPages}
                                    selectedRepoFiles={selectedRepoFiles}
                                    onRepoFilesSelectionChange={setSelectedRepoFiles}
                                    maxHeight="max-h-64"
                                />
                                {(selectedRepoFiles.length > 0 || selectedDocsPages.length > 0) && (
                                    <div className="mt-2 p-3 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg">
                                        <p className="text-sm text-purple-700 dark:text-purple-300">
                                            {selectedDocsPages.length + selectedRepoFiles.length} item{(selectedDocsPages.length + selectedRepoFiles.length) !== 1 ? 's' : ''} will be included as context
                                        </p>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Generating Progress */}
            {isGenerating && (
                <div className="mx-6 mb-4 p-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-xl">
                    <div className="flex items-center gap-2 mb-3">
                        <svg className="w-5 h-5 text-purple-600 dark:text-purple-400 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <span className="font-medium text-purple-700 dark:text-purple-300">Modifying ticket...</span>
                    </div>
                    {generationLogs.length > 0 && (
                        <div className="mt-2 max-h-32 overflow-y-auto">
                            {generationLogs.map((log, i) => (
                                <p key={i} className="text-xs text-purple-600 dark:text-purple-400 font-mono">{log}</p>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Error State */}
            {error && (
                <div className="mx-6 mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
                    <div className="flex items-center gap-2">
                        <svg className="w-5 h-5 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className="font-medium text-red-700 dark:text-red-300">{error}</span>
                    </div>
                    <button
                        onClick={() => setError(null)}
                        className="mt-2 text-xs text-red-600 dark:text-red-400 hover:underline"
                    >
                        Dismiss
                    </button>
                </div>
            )}
        </div>
    );
}
