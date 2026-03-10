'use client'

import { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { useRouter } from 'next/navigation';
import type { Board, StatusConfig, PipelineExecutionSettings } from '@/lib/schemas';
import {
    createBoard,
    updateBoard,
    deleteBoard,
    reorderBoards,
    getStatuses,
    createStatus,
    updateStatus,
    deleteStatus,
    reorderStatuses,
} from '@/app/actions';

interface BoardSettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    boards: Board[];
    currentBoardId: string;
    initialStatuses: StatusConfig[];
}

export function BoardSettingsModal({
    isOpen,
    onClose,
    boards: initialBoards,
    currentBoardId,
    initialStatuses,
}: BoardSettingsModalProps) {
    const [mounted, setMounted] = useState(false);
    const router = useRouter();

    // Board state
    const [boards, setBoards] = useState<Board[]>(initialBoards);
    const [selectedBoardId, setSelectedBoardId] = useState(currentBoardId);
    const [editingBoardId, setEditingBoardId] = useState<string | null>(null);
    const [editingBoardName, setEditingBoardName] = useState('');
    const [editingBoardPrefix, setEditingBoardPrefix] = useState('');
    const [showNewBoardForm, setShowNewBoardForm] = useState(false);
    const [newBoardName, setNewBoardName] = useState('');
    const [newBoardPrefix, setNewBoardPrefix] = useState('');
    const [boardLoading, setBoardLoading] = useState(false);
    const [draggedBoardId, setDraggedBoardId] = useState<string | null>(null);

    // Status state
    const [statuses, setStatuses] = useState<StatusConfig[]>(initialStatuses);
    const [statusesLoading, setStatusesLoading] = useState(false);
    const [editingStatusId, setEditingStatusId] = useState<string | null>(null);
    const [editingStatusName, setEditingStatusName] = useState('');
    const [editingStatusAgent, setEditingStatusAgent] = useState<string>('');
    const [editingStatusAutoExecute, setEditingStatusAutoExecute] = useState(false);
    const [editingPipelineSettings, setEditingPipelineSettings] = useState<Partial<PipelineExecutionSettings>>({});
    const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
    const [showNewStatusForm, setShowNewStatusForm] = useState(false);
    const [newStatusName, setNewStatusName] = useState('');
    const [statusLoading, setStatusLoading] = useState(false);
    const [draggedStatusId, setDraggedStatusId] = useState<string | null>(null);

    // Available agents for pipeline configuration
    const [availableAgents, setAvailableAgents] = useState<Array<{ id: string; name: string }>>([]);

    // Error state
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setMounted(true);
    }, []);

    // Reset state when modal opens
    useEffect(() => {
        if (isOpen) {
            setSelectedBoardId(currentBoardId);
            setStatuses(initialStatuses);
            setBoards(initialBoards);
            setError(null);
            setShowNewBoardForm(false);
            setShowNewStatusForm(false);
            setEditingBoardId(null);
            setEditingStatusId(null);
        }
    }, [isOpen, currentBoardId, initialStatuses, initialBoards]);

    // Fetch statuses when selected board changes
    useEffect(() => {
        if (!isOpen || selectedBoardId === currentBoardId) return;

        setStatusesLoading(true);
        getStatuses(selectedBoardId)
            .then((fetchedStatuses) => {
                setStatuses(fetchedStatuses);
                setStatusesLoading(false);
            })
            .catch((err) => {
                setError('Failed to load statuses');
                setStatusesLoading(false);
            });
    }, [selectedBoardId, isOpen, currentBoardId]);

    // Close on Escape key
    useEffect(() => {
        if (!isOpen) return;
        function handleKeyDown(e: KeyboardEvent) {
            if (e.key === 'Escape') onClose();
        }
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    // Auto-dismiss error after 3 seconds
    useEffect(() => {
        if (error) {
            const timer = setTimeout(() => setError(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [error]);

    // Fetch available agents for pipeline configuration
    useEffect(() => {
        if (!isOpen) return;
        fetch('/api/agents')
            .then((res) => res.json())
            .then((data) => {
                setAvailableAgents(data.agents || []);
            })
            .catch(() => {
                setAvailableAgents([]);
            });
    }, [isOpen]);

    const selectedBoard = boards.find((b) => b.id === selectedBoardId);

    // ============================================================================
    // Board CRUD handlers
    // ============================================================================

    async function handleCreateBoard() {
        if (!newBoardName.trim()) return;

        setBoardLoading(true);
        const result = await createBoard(newBoardName.trim(), newBoardPrefix.trim() || undefined);
        setBoardLoading(false);

        if (result.success && result.board) {
            setBoards([...boards, result.board]);
            setSelectedBoardId(result.board.id);
            setNewBoardName('');
            setNewBoardPrefix('');
            setShowNewBoardForm(false);
            // Fetch statuses for the new board
            const newStatuses = await getStatuses(result.board.id);
            setStatuses(newStatuses);
            router.refresh();
        } else {
            setError(result.error || 'Failed to create board');
        }
    }

    function startEditingBoard(board: Board) {
        setEditingBoardId(board.id);
        setEditingBoardName(board.name);
        setEditingBoardPrefix(board.ticket_prefix || '');
    }

    function cancelEditingBoard() {
        setEditingBoardId(null);
        setEditingBoardName('');
        setEditingBoardPrefix('');
    }

    async function handleUpdateBoard(boardId: string) {
        if (!editingBoardName.trim()) return;

        setBoardLoading(true);
        const result = await updateBoard(boardId, {
            name: editingBoardName.trim(),
            ticket_prefix: editingBoardPrefix.trim() || undefined,
        });
        setBoardLoading(false);

        if (result.success) {
            setBoards(
                boards.map((b) =>
                    b.id === boardId
                        ? { ...b, name: editingBoardName.trim(), ticket_prefix: editingBoardPrefix.trim() || undefined }
                        : b
                )
            );
            setEditingBoardId(null);
            router.refresh();
        } else {
            setError(result.error || 'Failed to update board');
        }
    }

    async function handleDeleteBoard(boardId: string) {
        const board = boards.find((b) => b.id === boardId);
        if (!board) return;

        if (boards.length <= 1) {
            setError('Cannot delete the last board');
            return;
        }

        if (!confirm(`Delete "${board.name}"? All tickets in this board will be permanently deleted.`)) {
            return;
        }

        setBoardLoading(true);
        const result = await deleteBoard(boardId);
        setBoardLoading(false);

        if (result.success) {
            const remainingBoards = boards.filter((b) => b.id !== boardId);
            setBoards(remainingBoards);
            // If deleted board was selected, select first remaining board
            if (selectedBoardId === boardId) {
                const newSelectedId = remainingBoards[0]?.id || 'default';
                setSelectedBoardId(newSelectedId);
                const newStatuses = await getStatuses(newSelectedId);
                setStatuses(newStatuses);
            }
            router.refresh();
        } else {
            setError(result.error || 'Failed to delete board');
        }
    }

    // ============================================================================
    // Board drag-and-drop and pinning
    // ============================================================================

    function handleBoardDragStart(e: React.DragEvent, boardId: string) {
        setDraggedBoardId(boardId);
        e.dataTransfer.effectAllowed = 'move';
    }

    function handleBoardDragOver(e: React.DragEvent) {
        e.preventDefault();
    }

    async function handleBoardDrop(e: React.DragEvent, targetId: string) {
        e.preventDefault();

        if (!draggedBoardId || draggedBoardId === targetId) {
            setDraggedBoardId(null);
            return;
        }

        const currentOrder = [...boards].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        const draggedIndex = currentOrder.findIndex((b) => b.id === draggedBoardId);
        const targetIndex = currentOrder.findIndex((b) => b.id === targetId);

        if (draggedIndex === -1 || targetIndex === -1) {
            setDraggedBoardId(null);
            return;
        }

        // Reorder
        const newOrder = [...currentOrder];
        const [dragged] = newOrder.splice(draggedIndex, 1);
        newOrder.splice(targetIndex, 0, dragged!);

        // Update local state immediately
        setBoards(newOrder.map((b, i) => ({ ...b, order: i })));
        setDraggedBoardId(null);

        // Persist to server
        await reorderBoards(newOrder.map((b) => b.id));
        router.refresh();
    }

    async function handleTogglePinBoard(boardId: string) {
        const board = boards.find((b) => b.id === boardId);
        if (!board) return;

        const newPinned = !(board.pinned ?? true);

        setBoardLoading(true);
        const result = await updateBoard(boardId, { pinned: newPinned });
        setBoardLoading(false);

        if (result.success) {
            setBoards(boards.map((b) => (b.id === boardId ? { ...b, pinned: newPinned } : b)));
            router.refresh();
        } else {
            setError(result.error || 'Failed to update board');
        }
    }

    // ============================================================================
    // Status CRUD handlers
    // ============================================================================

    async function handleCreateStatus() {
        if (!newStatusName.trim()) return;

        setStatusLoading(true);
        const result = await createStatus(newStatusName.trim(), 'gray', selectedBoardId);
        setStatusLoading(false);

        if (result.success && result.status) {
            setStatuses([...statuses, result.status]);
            setNewStatusName('');
            setShowNewStatusForm(false);
            router.refresh();
        } else {
            setError(result.error || 'Failed to create status');
        }
    }

    function startEditingStatus(status: StatusConfig) {
        setEditingStatusId(status.id);
        setEditingStatusName(status.name);
        setEditingStatusAgent(status.assignedAgent || '');
        setEditingStatusAutoExecute(status.autoExecute || false);
        setEditingPipelineSettings(status.pipelineSettings || {});
        setShowAdvancedSettings(false);
    }

    function cancelEditingStatus() {
        setEditingStatusId(null);
        setEditingStatusName('');
        setEditingStatusAgent('');
        setEditingStatusAutoExecute(false);
        setEditingPipelineSettings({});
        setShowAdvancedSettings(false);
    }

    async function handleUpdateStatus(statusId: string) {
        if (!editingStatusName.trim()) return;

        setStatusLoading(true);
        const updateData = {
            name: editingStatusName.trim(),
            assignedAgent: editingStatusAgent === '' ? null : editingStatusAgent,
            autoExecute: editingStatusAutoExecute,
            pipelineSettings: Object.keys(editingPipelineSettings).length > 0 ? editingPipelineSettings : undefined,
        };
        const result = await updateStatus(statusId, updateData, selectedBoardId);
        setStatusLoading(false);

        if (result.success) {
            setStatuses(
                statuses.map((s) => (s.id === statusId ? {
                    ...s,
                    name: editingStatusName.trim(),
                    assignedAgent: editingStatusAgent || undefined,
                    autoExecute: editingStatusAutoExecute,
                    pipelineSettings: Object.keys(editingPipelineSettings).length > 0 ? editingPipelineSettings as PipelineExecutionSettings : undefined,
                } : s))
            );
            setEditingStatusId(null);
            setEditingStatusAgent('');
            setEditingStatusAutoExecute(false);
            setEditingPipelineSettings({});
            setShowAdvancedSettings(false);
            router.refresh();
        } else {
            setError(result.error || 'Failed to update status');
        }
    }

    async function handleDeleteStatus(statusId: string) {
        const status = statuses.find((s) => s.id === statusId);
        if (!status) return;

        if (statuses.length <= 1) {
            setError('Cannot delete the last status');
            return;
        }

        if (!confirm(`Delete "${status.name}"? All tickets in this status will be moved to the first column.`)) {
            return;
        }

        setStatusLoading(true);
        const result = await deleteStatus(statusId, selectedBoardId);
        setStatusLoading(false);

        if (result.success) {
            setStatuses(statuses.filter((s) => s.id !== statusId));
            router.refresh();
        } else {
            setError(result.error || 'Failed to delete status');
        }
    }

    // ============================================================================
    // Drag and drop for status reordering
    // ============================================================================

    function handleDragStart(e: React.DragEvent, statusId: string) {
        setDraggedStatusId(statusId);
        e.dataTransfer.effectAllowed = 'move';
    }

    function handleDragOver(e: React.DragEvent) {
        e.preventDefault();
    }

    async function handleDrop(e: React.DragEvent, targetId: string) {
        e.preventDefault();

        if (!draggedStatusId || draggedStatusId === targetId) {
            setDraggedStatusId(null);
            return;
        }

        const currentOrder = [...statuses].sort((a, b) => a.order - b.order);
        const draggedIndex = currentOrder.findIndex((s) => s.id === draggedStatusId);
        const targetIndex = currentOrder.findIndex((s) => s.id === targetId);

        if (draggedIndex === -1 || targetIndex === -1) {
            setDraggedStatusId(null);
            return;
        }

        // Reorder
        const newOrder = [...currentOrder];
        const [dragged] = newOrder.splice(draggedIndex, 1);
        newOrder.splice(targetIndex, 0, dragged!);

        // Update local state immediately
        setStatuses(newOrder.map((s, i) => ({ ...s, order: i })));
        setDraggedStatusId(null);

        // Persist to server
        await reorderStatuses(
            newOrder.map((s) => s.id),
            selectedBoardId
        );
        router.refresh();
    }

    if (!mounted || !isOpen) return null;

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
                        className="w-[90vw] h-[80vh] max-w-[1200px] bg-white dark:bg-[#0d0d0d] border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl flex flex-col overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#1a1a1a]">
                            <div>
                                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Board Settings</h2>
                                <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
                                    Manage boards and their statuses
                                </p>
                            </div>
                            <button
                                onClick={onClose}
                                className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {/* Error banner */}
                        {error && (
                            <div className="px-6 py-2 bg-red-100 dark:bg-red-900/50 border-b border-red-300 dark:border-red-700 text-red-700 dark:text-red-200 text-sm">
                                {error}
                            </div>
                        )}

                        {/* Body - Two Column Layout */}
                        <div className="flex-1 flex overflow-hidden">
                            {/* Left Column - Boards List */}
                            <div className="w-1/2 border-r border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden">
                                {/* Boards Header */}
                                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#0d0d0d]">
                                    <div>
                                        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Boards</h3>
                                        <p className="text-xs text-gray-500 mt-0.5">
                                            {boards.length} boards • Drag to reorder
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => setShowNewBoardForm(!showNewBoardForm)}
                                        className="px-3 py-1.5 text-xs bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-1"
                                    >
                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                        </svg>
                                        Add Board
                                    </button>
                                </div>

                                {/* New Board Form */}
                                {showNewBoardForm && (
                                    <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-[#1a1a1a]">
                                        <div className="space-y-3">
                                            <input
                                                type="text"
                                                value={newBoardName}
                                                onChange={(e) => setNewBoardName(e.target.value)}
                                                placeholder="Board name..."
                                                className="w-full px-3 py-2 text-sm bg-white dark:bg-[#0d0d0d] border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                                autoFocus
                                            />
                                            <input
                                                type="text"
                                                value={newBoardPrefix}
                                                onChange={(e) => setNewBoardPrefix(e.target.value)}
                                                placeholder="Ticket prefix (e.g., PROJ)"
                                                className="w-full px-3 py-2 text-sm bg-white dark:bg-[#0d0d0d] border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                            />
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={handleCreateBoard}
                                                    disabled={boardLoading || !newBoardName.trim()}
                                                    className="flex-1 px-3 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
                                                >
                                                    {boardLoading ? 'Creating...' : 'Create Board'}
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        setShowNewBoardForm(false);
                                                        setNewBoardName('');
                                                        setNewBoardPrefix('');
                                                    }}
                                                    className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Boards List */}
                                <div className="flex-1 overflow-y-auto p-2">
                                    <div className="space-y-1">
                                        {[...boards]
                                            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
                                            .map((board) => (
                                            <div
                                                key={board.id}
                                                draggable={editingBoardId !== board.id}
                                                onDragStart={(e) => handleBoardDragStart(e, board.id)}
                                                onDragOver={handleBoardDragOver}
                                                onDrop={(e) => handleBoardDrop(e, board.id)}
                                                onClick={() => {
                                                    if (editingBoardId !== board.id) {
                                                        setSelectedBoardId(board.id);
                                                    }
                                                }}
                                                className={`p-3 rounded-lg transition-colors ${
                                                    editingBoardId !== board.id
                                                        ? 'cursor-grab active:cursor-grabbing'
                                                        : ''
                                                } ${draggedBoardId === board.id ? 'opacity-50' : ''} ${
                                                    selectedBoardId === board.id
                                                        ? 'bg-purple-100 dark:bg-purple-900/30 border border-purple-300 dark:border-purple-700/50'
                                                        : 'bg-gray-100 dark:bg-[#1a1a1a] border border-transparent hover:border-gray-300 dark:hover:border-gray-700'
                                                }`}
                                            >
                                                {editingBoardId === board.id ? (
                                                    // Edit mode
                                                    <div className="space-y-3" onClick={(e) => e.stopPropagation()}>
                                                        <input
                                                            type="text"
                                                            value={editingBoardName}
                                                            onChange={(e) => setEditingBoardName(e.target.value)}
                                                            placeholder="Board name..."
                                                            className="w-full px-3 py-2 text-sm bg-white dark:bg-[#0d0d0d] border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                                            autoFocus
                                                        />
                                                        <input
                                                            type="text"
                                                            value={editingBoardPrefix}
                                                            onChange={(e) => setEditingBoardPrefix(e.target.value)}
                                                            placeholder="Ticket prefix (e.g., PROJ)"
                                                            className="w-full px-3 py-2 text-sm bg-white dark:bg-[#0d0d0d] border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                                        />
                                                        <div className="flex gap-2">
                                                            <button
                                                                onClick={() => handleUpdateBoard(board.id)}
                                                                disabled={boardLoading}
                                                                className="flex-1 px-3 py-1.5 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
                                                            >
                                                                Save
                                                            </button>
                                                            <button
                                                                onClick={cancelEditingBoard}
                                                                className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-800"
                                                            >
                                                                Cancel
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    // View mode
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center gap-3 min-w-0">
                                                            {/* Drag handle */}
                                                            <svg
                                                                className="w-4 h-4 text-gray-500 flex-shrink-0"
                                                                fill="none"
                                                                viewBox="0 0 24 24"
                                                                stroke="currentColor"
                                                            >
                                                                <path
                                                                    strokeLinecap="round"
                                                                    strokeLinejoin="round"
                                                                    strokeWidth={2}
                                                                    d="M4 8h16M4 16h16"
                                                                />
                                                            </svg>
                                                            <div className="min-w-0">
                                                                <div className="flex items-center gap-2">
                                                                    <span
                                                                        className={`text-sm font-medium truncate ${
                                                                            selectedBoardId === board.id
                                                                                ? 'text-purple-700 dark:text-purple-300'
                                                                                : 'text-gray-900 dark:text-gray-100'
                                                                        }`}
                                                                    >
                                                                        {board.name}
                                                                    </span>
                                                                    {board.id === currentBoardId && (
                                                                        <span className="px-1.5 py-0.5 text-[10px] font-medium bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-400 rounded">
                                                                            Active
                                                                        </span>
                                                                    )}
                                                                    {(board.pinned ?? true) && (
                                                                        <span className="px-1.5 py-0.5 text-[10px] font-medium bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-400 rounded">
                                                                            Pinned
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                {board.ticket_prefix && (
                                                                    <span className="text-xs text-gray-500">
                                                                        Prefix: {board.ticket_prefix}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <div
                                                            className="flex items-center gap-1"
                                                            onClick={(e) => e.stopPropagation()}
                                                        >
                                                            {/* Pin/Unpin button */}
                                                            <button
                                                                onClick={() => handleTogglePinBoard(board.id)}
                                                                className={`p-1.5 rounded ${
                                                                    (board.pinned ?? true)
                                                                        ? 'text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/30'
                                                                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                                                                }`}
                                                                title={(board.pinned ?? true) ? 'Unpin from header' : 'Pin to header'}
                                                            >
                                                                <svg
                                                                    className="w-4 h-4"
                                                                    fill={(board.pinned ?? true) ? 'currentColor' : 'none'}
                                                                    viewBox="0 0 24 24"
                                                                    stroke="currentColor"
                                                                >
                                                                    <path
                                                                        strokeLinecap="round"
                                                                        strokeLinejoin="round"
                                                                        strokeWidth={2}
                                                                        d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
                                                                    />
                                                                </svg>
                                                            </button>
                                                            <button
                                                                onClick={() => startEditingBoard(board)}
                                                                className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
                                                                title="Edit"
                                                            >
                                                                <svg
                                                                    className="w-4 h-4"
                                                                    fill="none"
                                                                    viewBox="0 0 24 24"
                                                                    stroke="currentColor"
                                                                >
                                                                    <path
                                                                        strokeLinecap="round"
                                                                        strokeLinejoin="round"
                                                                        strokeWidth={2}
                                                                        d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                                                                    />
                                                                </svg>
                                                            </button>
                                                            {boards.length > 1 && (
                                                                <button
                                                                    onClick={() => handleDeleteBoard(board.id)}
                                                                    className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"
                                                                    title="Delete"
                                                                >
                                                                    <svg
                                                                        className="w-4 h-4"
                                                                        fill="none"
                                                                        viewBox="0 0 24 24"
                                                                        stroke="currentColor"
                                                                    >
                                                                        <path
                                                                            strokeLinecap="round"
                                                                            strokeLinejoin="round"
                                                                            strokeWidth={2}
                                                                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                                                        />
                                                                    </svg>
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Right Column - Status Management */}
                            <div className="w-1/2 flex flex-col overflow-hidden">
                                {/* Status Header */}
                                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#0d0d0d]">
                                    <div>
                                        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                            Statuses for {selectedBoard?.name || 'Board'}
                                        </h3>
                                        <p className="text-xs text-gray-500 mt-0.5">
                                            {statuses.length} statuses • Drag to reorder
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => setShowNewStatusForm(!showNewStatusForm)}
                                        className="px-3 py-1.5 text-xs bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-1"
                                    >
                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                        </svg>
                                        Add Status
                                    </button>
                                </div>

                                {/* Add Status Form */}
                                {showNewStatusForm && (
                                    <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-[#1a1a1a]">
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                value={newStatusName}
                                                onChange={(e) => setNewStatusName(e.target.value)}
                                                placeholder="New status name..."
                                                className="flex-1 px-3 py-2 text-sm bg-white dark:bg-[#0d0d0d] border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                                onKeyDown={(e) => e.key === 'Enter' && handleCreateStatus()}
                                                autoFocus
                                            />
                                            <button
                                                onClick={handleCreateStatus}
                                                disabled={statusLoading || !newStatusName.trim()}
                                                className="px-4 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
                                            >
                                                {statusLoading ? '...' : 'Add'}
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setShowNewStatusForm(false);
                                                    setNewStatusName('');
                                                }}
                                                className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* Status List */}
                                <div className="flex-1 overflow-y-auto p-2">
                                    {statusesLoading ? (
                                        <div className="flex items-center justify-center h-32 text-gray-600 dark:text-gray-400">
                                            <div className="flex items-center gap-2">
                                                <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                                                Loading statuses...
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="space-y-1">
                                            {[...statuses]
                                                .sort((a, b) => a.order - b.order)
                                                .map((status) => (
                                                    <div
                                                        key={status.id}
                                                        draggable={editingStatusId !== status.id}
                                                        onDragStart={(e) => handleDragStart(e, status.id)}
                                                        onDragOver={handleDragOver}
                                                        onDrop={(e) => handleDrop(e, status.id)}
                                                        className={`p-3 bg-gray-100 dark:bg-[#1a1a1a] rounded-lg border border-gray-200 dark:border-gray-700 ${
                                                            editingStatusId !== status.id
                                                                ? 'cursor-grab active:cursor-grabbing'
                                                                : ''
                                                        } ${draggedStatusId === status.id ? 'opacity-50' : ''}`}
                                                    >
                                                        {editingStatusId === status.id ? (
                                                            // Edit mode
                                                            <div className="space-y-3">
                                                                <input
                                                                    type="text"
                                                                    value={editingStatusName}
                                                                    onChange={(e) => setEditingStatusName(e.target.value)}
                                                                    className="w-full px-3 py-2 text-sm bg-white dark:bg-[#0d0d0d] border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                                                    autoFocus
                                                                />

                                                                {/* Pipeline Configuration */}
                                                                <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                                                                    <p className="text-xs text-gray-500 mb-2 flex items-center gap-1">
                                                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                                                        </svg>
                                                                        Pipeline Configuration
                                                                    </p>

                                                                    {/* Assigned Agent */}
                                                                    <div className="mb-2">
                                                                        <label className="text-xs text-gray-600 dark:text-gray-400 mb-1 block">Assigned Agent</label>
                                                                        <select
                                                                            value={editingStatusAgent}
                                                                            onChange={(e) => {
                                                                                setEditingStatusAgent(e.target.value);
                                                                                if (!e.target.value) {
                                                                                    setEditingStatusAutoExecute(false);
                                                                                }
                                                                            }}
                                                                            className="w-full px-3 py-2 text-sm bg-white dark:bg-[#0d0d0d] border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500"
                                                                        >
                                                                            <option value="">No agent (manual)</option>
                                                                            {availableAgents.map((agent) => (
                                                                                <option key={agent.id} value={agent.id}>
                                                                                    {agent.name}
                                                                                </option>
                                                                            ))}
                                                                        </select>
                                                                    </div>

                                                                    {/* Auto-Execute Toggle */}
                                                                    {editingStatusAgent && (
                                                                        <div className="flex items-center justify-between">
                                                                            <label className="text-xs text-gray-600 dark:text-gray-400">Auto-execute when ticket enters</label>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => setEditingStatusAutoExecute(!editingStatusAutoExecute)}
                                                                                className={`relative w-10 h-5 rounded-full transition-colors ${
                                                                                    editingStatusAutoExecute ? 'bg-purple-600' : 'bg-gray-300 dark:bg-gray-700'
                                                                                }`}
                                                                            >
                                                                                <div
                                                                                    className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                                                                                        editingStatusAutoExecute ? 'translate-x-5' : 'translate-x-0.5'
                                                                                    }`}
                                                                                />
                                                                            </button>
                                                                        </div>
                                                                    )}

                                                                    {/* Advanced Settings Toggle */}
                                                                    {editingStatusAgent && (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
                                                                            className="w-full mt-2 px-3 py-1.5 text-xs text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-300 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-800 flex items-center justify-center gap-1"
                                                                        >
                                                                            <svg className={`w-3 h-3 transition-transform ${showAdvancedSettings ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                                            </svg>
                                                                            {showAdvancedSettings ? 'Hide' : 'Show'} Execution Settings
                                                                        </button>
                                                                    )}

                                                                    {/* Advanced Pipeline Settings */}
                                                                    {editingStatusAgent && showAdvancedSettings && (
                                                                        <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 space-y-3">
                                                                            {/* Permissions */}
                                                                            <div className="flex items-center justify-between">
                                                                                <label className="text-xs text-gray-600 dark:text-gray-400">Skip Permissions</label>
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => setEditingPipelineSettings(prev => ({ ...prev, skipPermissions: !prev.skipPermissions }))}
                                                                                    className={`relative w-10 h-5 rounded-full transition-colors ${
                                                                                        editingPipelineSettings.skipPermissions ?? true ? 'bg-purple-600' : 'bg-gray-300 dark:bg-gray-700'
                                                                                    }`}
                                                                                >
                                                                                    <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                                                                                        editingPipelineSettings.skipPermissions ?? true ? 'translate-x-5' : 'translate-x-0.5'
                                                                                    }`} />
                                                                                </button>
                                                                            </div>

                                                                            {/* Execution Mode */}
                                                                            <div>
                                                                                <label className="text-xs text-gray-600 dark:text-gray-400 mb-1 block">Execution Mode</label>
                                                                                <select
                                                                                    value={editingPipelineSettings.executionMode || 'normal'}
                                                                                    onChange={(e) => setEditingPipelineSettings(prev => ({ ...prev, executionMode: e.target.value as 'normal' | 'plan-only' }))}
                                                                                    className="w-full px-2 py-1.5 text-sm bg-white dark:bg-[#0d0d0d] border border-gray-300 dark:border-gray-700 rounded text-gray-900 dark:text-gray-100"
                                                                                >
                                                                                    <option value="normal">Normal</option>
                                                                                    <option value="plan-only">Plan Only</option>
                                                                                </select>
                                                                            </div>

                                                                            {/* Branch Settings */}
                                                                            <div className="space-y-2">
                                                                                <p className="text-xs text-gray-500 font-medium">Branch Settings</p>
                                                                                <div className="flex items-center justify-between">
                                                                                    <label className="text-xs text-gray-600 dark:text-gray-400">Create New Branch</label>
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={() => setEditingPipelineSettings(prev => ({ ...prev, createNewBranch: !(prev.createNewBranch ?? true) }))}
                                                                                        className={`relative w-10 h-5 rounded-full transition-colors ${
                                                                                            editingPipelineSettings.createNewBranch ?? true ? 'bg-purple-600' : 'bg-gray-300 dark:bg-gray-700'
                                                                                        }`}
                                                                                    >
                                                                                        <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                                                                                            editingPipelineSettings.createNewBranch ?? true ? 'translate-x-5' : 'translate-x-0.5'
                                                                                        }`} />
                                                                                    </button>
                                                                                </div>
                                                                                <div className="flex items-center justify-between">
                                                                                    <label className="text-xs text-gray-600 dark:text-gray-400">Auto Merge</label>
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={() => setEditingPipelineSettings(prev => ({ ...prev, autoMerge: !prev.autoMerge }))}
                                                                                        className={`relative w-10 h-5 rounded-full transition-colors ${
                                                                                            editingPipelineSettings.autoMerge ? 'bg-purple-600' : 'bg-gray-300 dark:bg-gray-700'
                                                                                        }`}
                                                                                    >
                                                                                        <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                                                                                            editingPipelineSettings.autoMerge ? 'translate-x-5' : 'translate-x-0.5'
                                                                                        }`} />
                                                                                    </button>
                                                                                </div>
                                                                                <div className="flex items-center justify-between">
                                                                                    <label className="text-xs text-gray-600 dark:text-gray-400">Auto Push</label>
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={() => setEditingPipelineSettings(prev => ({ ...prev, autoPush: !prev.autoPush }))}
                                                                                        className={`relative w-10 h-5 rounded-full transition-colors ${
                                                                                            editingPipelineSettings.autoPush ? 'bg-purple-600' : 'bg-gray-300 dark:bg-gray-700'
                                                                                        }`}
                                                                                    >
                                                                                        <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                                                                                            editingPipelineSettings.autoPush ? 'translate-x-5' : 'translate-x-0.5'
                                                                                        }`} />
                                                                                    </button>
                                                                                </div>
                                                                            </div>

                                                                            {/* Ticket Automation */}
                                                                            <div className="space-y-2">
                                                                                <p className="text-xs text-gray-500 font-medium">Ticket Automation</p>
                                                                                <div className="flex items-center justify-between">
                                                                                    <label className="text-xs text-gray-600 dark:text-gray-400">Auto Update Ticket</label>
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={() => setEditingPipelineSettings(prev => ({ ...prev, autoUpdateTicket: !(prev.autoUpdateTicket ?? true) }))}
                                                                                        className={`relative w-10 h-5 rounded-full transition-colors ${
                                                                                            editingPipelineSettings.autoUpdateTicket ?? true ? 'bg-purple-600' : 'bg-gray-300 dark:bg-gray-700'
                                                                                        }`}
                                                                                    >
                                                                                        <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                                                                                            editingPipelineSettings.autoUpdateTicket ?? true ? 'translate-x-5' : 'translate-x-0.5'
                                                                                        }`} />
                                                                                    </button>
                                                                                </div>
                                                                                <div className="flex items-center justify-between">
                                                                                    <label className="text-xs text-gray-600 dark:text-gray-400">Auto Move to Next Column</label>
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={() => setEditingPipelineSettings(prev => ({ ...prev, autoMoveTicket: !(prev.autoMoveTicket ?? true) }))}
                                                                                        className={`relative w-10 h-5 rounded-full transition-colors ${
                                                                                            editingPipelineSettings.autoMoveTicket ?? true ? 'bg-purple-600' : 'bg-gray-300 dark:bg-gray-700'
                                                                                        }`}
                                                                                    >
                                                                                        <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                                                                                            editingPipelineSettings.autoMoveTicket ?? true ? 'translate-x-5' : 'translate-x-0.5'
                                                                                        }`} />
                                                                                    </button>
                                                                                </div>
                                                                            </div>

                                                                            {/* Context Settings */}
                                                                            <div className="space-y-2">
                                                                                <p className="text-xs text-gray-500 font-medium">Context Settings</p>
                                                                                <div className="flex items-center justify-between">
                                                                                    <label className="text-xs text-gray-600 dark:text-gray-400">Include Related Tickets</label>
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={() => setEditingPipelineSettings(prev => ({ ...prev, includeRelatedTickets: !prev.includeRelatedTickets }))}
                                                                                        className={`relative w-10 h-5 rounded-full transition-colors ${
                                                                                            editingPipelineSettings.includeRelatedTickets ? 'bg-purple-600' : 'bg-gray-300 dark:bg-gray-700'
                                                                                        }`}
                                                                                    >
                                                                                        <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                                                                                            editingPipelineSettings.includeRelatedTickets ? 'translate-x-5' : 'translate-x-0.5'
                                                                                        }`} />
                                                                                    </button>
                                                                                </div>
                                                                                <div className="flex items-center justify-between">
                                                                                    <label className="text-xs text-gray-600 dark:text-gray-400">Include All Artifacts</label>
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={() => setEditingPipelineSettings(prev => ({ ...prev, includeAllArtifacts: !(prev.includeAllArtifacts ?? true) }))}
                                                                                        className={`relative w-10 h-5 rounded-full transition-colors ${
                                                                                            editingPipelineSettings.includeAllArtifacts ?? true ? 'bg-purple-600' : 'bg-gray-300 dark:bg-gray-700'
                                                                                        }`}
                                                                                    >
                                                                                        <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                                                                                            editingPipelineSettings.includeAllArtifacts ?? true ? 'translate-x-5' : 'translate-x-0.5'
                                                                                        }`} />
                                                                                    </button>
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                </div>

                                                                <div className="flex gap-2">
                                                                    <button
                                                                        onClick={() => handleUpdateStatus(status.id)}
                                                                        disabled={statusLoading}
                                                                        className="flex-1 px-3 py-1.5 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
                                                                    >
                                                                        Save
                                                                    </button>
                                                                    <button
                                                                        onClick={cancelEditingStatus}
                                                                        className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-800"
                                                                    >
                                                                        Cancel
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            // View mode
                                                            <div className="flex items-center justify-between">
                                                                <div className="flex items-center gap-3">
                                                                    <svg
                                                                        className="w-4 h-4 text-gray-500"
                                                                        fill="none"
                                                                        viewBox="0 0 24 24"
                                                                        stroke="currentColor"
                                                                    >
                                                                        <path
                                                                            strokeLinecap="round"
                                                                            strokeLinejoin="round"
                                                                            strokeWidth={2}
                                                                            d="M4 8h16M4 16h16"
                                                                        />
                                                                    </svg>
                                                                    <span className="text-sm text-gray-900 dark:text-gray-100">
                                                                        {status.name}
                                                                    </span>
                                                                    <span className="text-xs text-gray-500">
                                                                        ({status.id})
                                                                    </span>
                                                                    {/* Pipeline indicator */}
                                                                    {status.assignedAgent && (
                                                                        <span
                                                                            className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-xs ${
                                                                                status.autoExecute
                                                                                    ? 'bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 border border-purple-300 dark:border-purple-700/50'
                                                                                    : 'bg-gray-200 dark:bg-gray-700/50 text-gray-600 dark:text-gray-400'
                                                                            }`}
                                                                            title={`Agent: ${availableAgents.find(a => a.id === status.assignedAgent)?.name || status.assignedAgent}${status.autoExecute ? ' (Auto-execute)' : ''}`}
                                                                        >
                                                                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                                                            </svg>
                                                                            {status.autoExecute ? 'Auto' : 'Agent'}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <div className="flex items-center gap-1">
                                                                    <button
                                                                        onClick={() => startEditingStatus(status)}
                                                                        className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
                                                                        title="Edit"
                                                                    >
                                                                        <svg
                                                                            className="w-4 h-4"
                                                                            fill="none"
                                                                            viewBox="0 0 24 24"
                                                                            stroke="currentColor"
                                                                        >
                                                                            <path
                                                                                strokeLinecap="round"
                                                                                strokeLinejoin="round"
                                                                                strokeWidth={2}
                                                                                d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                                                                            />
                                                                        </svg>
                                                                    </button>
                                                                    {statuses.length > 1 && (
                                                                        <button
                                                                            onClick={() => handleDeleteStatus(status.id)}
                                                                            className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"
                                                                            title="Delete"
                                                                        >
                                                                            <svg
                                                                                className="w-4 h-4"
                                                                                fill="none"
                                                                                viewBox="0 0 24 24"
                                                                                stroke="currentColor"
                                                                            >
                                                                                <path
                                                                                    strokeLinecap="round"
                                                                                    strokeLinejoin="round"
                                                                                    strokeWidth={2}
                                                                                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                                                                />
                                                                            </svg>
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="px-6 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#1a1a1a] flex items-center justify-end">
                            <button
                                onClick={onClose}
                                className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </>
    );
}
