'use client'

import Link from 'next/link';
import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { createDocsFolder, renameDocsFolder, deleteDocsFolder, moveDocPage } from '@/app/actions';
import type { DocPage } from '@/lib/schemas';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

interface DocsSidebarProps {
    pages: DocPage[];
    allTags: string[];
    folders: string[];
}

export function DocsSidebar({ pages, allTags, folders }: DocsSidebarProps) {
    const pathname = usePathname();
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(folders));
    const [isCreatingFolder, setIsCreatingFolder] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    const [editingFolder, setEditingFolder] = useState<string | null>(null);
    const [editFolderName, setEditFolderName] = useState('');
    const [draggedPage, setDraggedPage] = useState<{ slug: string; folder: string } | null>(null);
    const [dropTarget, setDropTarget] = useState<string | null>(null);

    // Group pages by folder
    const rootPages = pages.filter(p => !p.folder);
    const pagesByFolder = folders.reduce((acc, folder) => {
        acc[folder] = pages.filter(p => p.folder === folder);
        return acc;
    }, {} as Record<string, DocPage[]>);

    // Filter by category if selected
    const filterByCategory = (pageList: DocPage[]) => {
        if (!selectedCategory) return pageList;
        return pageList.filter(p => p.tags.includes(selectedCategory));
    };

    const toggleFolder = (folder: string) => {
        const newExpanded = new Set(expandedFolders);
        if (newExpanded.has(folder)) {
            newExpanded.delete(folder);
        } else {
            newExpanded.add(folder);
        }
        setExpandedFolders(newExpanded);
    };

    const getPageUrl = (page: DocPage) => {
        if (page.folder) {
            return `/docs/${page.folder}/${page.slug}`;
        }
        return `/docs/${page.slug}`;
    };

    const handleCreateFolder = async () => {
        if (!newFolderName.trim()) return;
        const folderSlug = newFolderName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        await createDocsFolder(folderSlug);
        setNewFolderName('');
        setIsCreatingFolder(false);
        window.location.reload();
    };

    const handleRenameFolder = async (oldName: string) => {
        if (!editFolderName.trim() || editFolderName === oldName) {
            setEditingFolder(null);
            setEditFolderName('');
            return;
        }
        const newSlug = editFolderName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        await renameDocsFolder(oldName, newSlug);
        setEditingFolder(null);
        setEditFolderName('');
        window.location.reload();
    };

    const handleDeleteFolder = async (folderName: string, pageCount: number) => {
        const message = pageCount > 0
            ? `Delete folder "${folderName}" and its ${pageCount} page(s)?`
            : `Delete empty folder "${folderName}"?`;
        if (!confirm(message)) return;
        await deleteDocsFolder(folderName, pageCount > 0);
        window.location.reload();
    };

    const startEditingFolder = (folder: string) => {
        setEditingFolder(folder);
        setEditFolderName(folder);
    };

    // Drag and drop handlers
    const handleDragStart = (e: React.DragEvent, page: DocPage) => {
        setDraggedPage({ slug: page.slug, folder: page.folder });
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', `${page.folder}/${page.slug}`);
    };

    const handleDragEnd = () => {
        setDraggedPage(null);
        setDropTarget(null);
    };

    const handleDragOver = (e: React.DragEvent, target: string) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setDropTarget(target);
    };

    const handleDragLeave = () => {
        setDropTarget(null);
    };

    const handleDrop = async (e: React.DragEvent, targetFolder: string) => {
        e.preventDefault();
        setDropTarget(null);

        if (!draggedPage) return;

        const newFolder = targetFolder === '__root__' ? '' : targetFolder;

        // Don't move if already in the same folder
        if (draggedPage.folder === newFolder) {
            setDraggedPage(null);
            return;
        }

        await moveDocPage(draggedPage.folder, newFolder, draggedPage.slug);
        setDraggedPage(null);
        window.location.reload();
    };

    return (
        <aside className="w-64 border-r border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-[#111] flex-shrink-0 h-[calc(100vh-57px)] sticky top-[57px] overflow-y-auto">
            <div className="p-4">
                {/* Docs Home Link */}
                <Link
                    href="/docs"
                    className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg mb-4 ${
                        pathname === '/docs'
                            ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                            : 'text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800'
                    }`}
                >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                    </svg>
                    All Pages
                </Link>

                {/* Pages Section */}
                <div>
                    <div className="flex items-center justify-between px-3 mb-2">
                        <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Pages
                        </h3>
                        <button
                            onClick={() => setIsCreatingFolder(true)}
                            className="text-xs text-purple-600 dark:text-purple-400 hover:underline"
                        >
                            + Folder
                        </button>
                    </div>

                    {/* New Folder Input */}
                    {isCreatingFolder && (
                        <div className="px-3 mb-2">
                            <div className="flex gap-1">
                                <input
                                    type="text"
                                    value={newFolderName}
                                    onChange={(e) => setNewFolderName(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
                                    placeholder="folder-name"
                                    className="flex-1 px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                                    autoFocus
                                />
                                <button
                                    onClick={handleCreateFolder}
                                    className="px-2 py-1 text-xs bg-purple-600 text-white rounded hover:bg-purple-700"
                                >
                                    Add
                                </button>
                                <button
                                    onClick={() => { setIsCreatingFolder(false); setNewFolderName(''); }}
                                    className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                                >
                                    x
                                </button>
                            </div>
                        </div>
                    )}

                    <nav className="space-y-1">
                        {/* Folders first */}
                        {folders.map((folder) => {
                            const folderPages = filterByCategory(pagesByFolder[folder] || []);
                            const isExpanded = expandedFolders.has(folder);
                            const isEditing = editingFolder === folder;

                            return (
                                <div key={folder}>
                                    {isEditing ? (
                                        <div className="flex items-center gap-1 px-3 py-1">
                                            <input
                                                type="text"
                                                value={editFolderName}
                                                onChange={(e) => setEditFolderName(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') handleRenameFolder(folder);
                                                    if (e.key === 'Escape') { setEditingFolder(null); setEditFolderName(''); }
                                                }}
                                                className="flex-1 px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                                                autoFocus
                                            />
                                            <button
                                                onClick={() => handleRenameFolder(folder)}
                                                className="p-1 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded"
                                                title="Save"
                                            >
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                </svg>
                                            </button>
                                            <button
                                                onClick={() => { setEditingFolder(null); setEditFolderName(''); }}
                                                className="p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
                                                title="Cancel"
                                            >
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                </svg>
                                            </button>
                                        </div>
                                    ) : (
                                        <div
                                            className={`group flex items-center rounded-lg transition-colors ${
                                                dropTarget === folder ? 'bg-purple-100 dark:bg-purple-900/30 ring-2 ring-purple-400' : ''
                                            }`}
                                            onDragOver={(e) => handleDragOver(e, folder)}
                                            onDragLeave={handleDragLeave}
                                            onDrop={(e) => handleDrop(e, folder)}
                                        >
                                            <button
                                                onClick={() => toggleFolder(folder)}
                                                className="flex-1 flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
                                            >
                                                <svg
                                                    className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                                                    fill="none"
                                                    viewBox="0 0 24 24"
                                                    stroke="currentColor"
                                                >
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                </svg>
                                                <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                                                </svg>
                                                <span className="truncate">{folder}</span>
                                                <span className="text-xs text-gray-400 ml-auto">{folderPages.length}</span>
                                            </button>
                                            {/* Edit/Delete buttons - visible on hover */}
                                            <div className="hidden group-hover:flex items-center pr-2">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); startEditingFolder(folder); }}
                                                    className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                                                    title="Rename folder"
                                                >
                                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                    </svg>
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleDeleteFolder(folder, folderPages.length); }}
                                                    className="p-1 text-gray-400 hover:text-red-500"
                                                    title="Delete folder"
                                                >
                                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                    </svg>
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                    {isExpanded && (
                                        <div className="ml-5 mt-1 space-y-1">
                                            {folderPages.map((page) => (
                                                <Link
                                                    key={page.slug}
                                                    href={getPageUrl(page)}
                                                    draggable
                                                    onDragStart={(e) => handleDragStart(e, page)}
                                                    onDragEnd={handleDragEnd}
                                                    className={`block px-3 py-1.5 text-sm rounded-lg truncate cursor-grab active:cursor-grabbing ${
                                                        pathname === getPageUrl(page)
                                                            ? 'bg-gray-200 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
                                                            : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                                                    } ${draggedPage?.slug === page.slug ? 'opacity-50' : ''}`}
                                                >
                                                    {page.title}
                                                </Link>
                                            ))}
                                            {/* Add page link inside folder */}
                                            <Link
                                                href={`/docs/new?folder=${encodeURIComponent(folder)}`}
                                                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-lg"
                                            >
                                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                                </svg>
                                                Add page
                                            </Link>
                                        </div>
                                    )}
                                </div>
                            );
                        })}

                        {/* Root Pages (after folders) - also a drop zone */}
                        <div
                            className={`space-y-1 rounded-lg transition-colors ${
                                dropTarget === '__root__' ? 'bg-purple-100 dark:bg-purple-900/30 ring-2 ring-purple-400 p-1 -m-1' : ''
                            }`}
                            onDragOver={(e) => handleDragOver(e, '__root__')}
                            onDragLeave={handleDragLeave}
                            onDrop={(e) => handleDrop(e, '__root__')}
                        >
                            {filterByCategory(rootPages).map((page) => (
                                <Link
                                    key={page.slug}
                                    href={getPageUrl(page)}
                                    draggable
                                    onDragStart={(e) => handleDragStart(e, page)}
                                    onDragEnd={handleDragEnd}
                                    className={`block px-3 py-1.5 text-sm rounded-lg truncate cursor-grab active:cursor-grabbing ${
                                        pathname === getPageUrl(page)
                                            ? 'bg-gray-200 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
                                            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                                    } ${draggedPage?.slug === page.slug ? 'opacity-50' : ''}`}
                                >
                                    {page.title}
                                </Link>
                            ))}
                            {/* Drop hint when dragging and no root pages */}
                            {draggedPage && filterByCategory(rootPages).length === 0 && (
                                <div className="px-3 py-2 text-xs text-gray-400 dark:text-gray-500 italic">
                                    Drop here to move to root
                                </div>
                            )}
                        </div>

                        {pages.length === 0 && (
                            <p className="px-3 py-2 text-sm text-gray-400 dark:text-gray-500 italic">
                                No pages yet
                            </p>
                        )}
                    </nav>
                </div>

                {/* Categories/Tags Filter Section */}
                {allTags.length > 0 && (
                    <div className="mt-6">
                        <h3 className="px-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                            Filter by Category
                        </h3>
                        <div className="px-3">
                            <Select
                                value={selectedCategory || "__all__"}
                                onValueChange={(value) => setSelectedCategory(value === "__all__" ? null : value)}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="No tag selected" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__all__">No tag selected</SelectItem>
                                    {allTags.map((tag) => {
                                        const count = pages.filter(p => p.tags.includes(tag)).length;
                                        return (
                                            <SelectItem key={tag} value={tag}>
                                                {tag} ({count})
                                            </SelectItem>
                                        );
                                    })}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                )}

                {/* New Page Button at bottom */}
                <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-800">
                    <Link
                        href="/docs/new"
                        className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-lg transition-colors"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        New page
                    </Link>
                </div>
            </div>
        </aside>
    );
}
