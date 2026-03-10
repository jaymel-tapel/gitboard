'use client'

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getDocPage, updateDocPage, deleteDocPage } from '@/app/actions';
import { usePageTitle } from '@/hooks/usePageTitle';
import { FileUpload } from '@/components/FileUpload';
import type { FileAttachment } from '@/lib/schemas';

interface EditDocPageProps {
    params: Promise<{ path: string[] }>;
}

function parsePath(path: string[]): { folder: string; slug: string } {
    if (path.length === 1) {
        return { folder: '', slug: path[0]! };
    }
    if (path.length === 2) {
        return { folder: path[0]!, slug: path[1]! };
    }
    throw new Error('Invalid path');
}

export default function EditDocPage({ params }: EditDocPageProps) {
    const router = useRouter();
    const [page, setPage] = useState<{ title: string; content: string; tags: string[]; folder: string; slug: string } | null>(null);
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [tags, setTags] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [files, setFiles] = useState<FileAttachment[]>([]);

    // Set browser tab title dynamically based on document being edited
    usePageTitle(page?.title ? `Edit: ${page.title}` : 'Edit Document');

    useEffect(() => {
        async function loadPage() {
            try {
                const { path } = await params;
                const { folder: parsedFolder, slug: parsedSlug } = parsePath(path);

                const loadedPage = await getDocPage(parsedFolder, parsedSlug);

                setPage({
                    title: loadedPage.title,
                    content: loadedPage.content,
                    tags: loadedPage.tags,
                    folder: loadedPage.folder,
                    slug: loadedPage.slug
                });
                setTitle(loadedPage.title);
                setContent(loadedPage.content);
                setTags(loadedPage.tags.join(', '));

                // Load attached files
                const docId = loadedPage.folder ? `${loadedPage.folder}/${loadedPage.slug}` : loadedPage.slug;
                try {
                    const filesResponse = await fetch(`/api/files?parent_type=doc&parent_id=${encodeURIComponent(docId)}`);
                    if (filesResponse.ok) {
                        const filesData = await filesResponse.json();
                        setFiles(filesData.files || []);
                    }
                } catch (err) {
                    console.error('Failed to load files:', err);
                }
            } catch (err) {
                setError('Page not found');
            } finally {
                setIsLoading(false);
            }
        }
        loadPage();
    }, [params]);

    const getPageUrl = () => {
        if (!page) return '/docs';
        if (page.folder) {
            return `/docs/${page.folder}/${page.slug}`;
        }
        return `/docs/${page.slug}`;
    };

    const getDocId = () => {
        if (!page) return '';
        return page.folder ? `${page.folder}/${page.slug}` : page.slug;
    };

    async function handleSave() {
        if (!title.trim() || !page) return;

        setIsSaving(true);
        try {
            await updateDocPage(page.folder, page.slug, {
                title,
                content,
                tags: tags.split(',').map(t => t.trim()).filter(Boolean),
            });

            router.push(getPageUrl());
        } catch (error) {
            console.error('Failed to update doc page:', error);
        } finally {
            setIsSaving(false);
        }
    }

    async function handleDelete() {
        if (!page || !confirm('Are you sure you want to delete this page?')) return;

        setIsDeleting(true);
        try {
            await deleteDocPage(page.folder, page.slug);
            router.push('/docs');
        } catch (error) {
            console.error('Failed to delete doc page:', error);
        } finally {
            setIsDeleting(false);
        }
    }

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 's') {
            e.preventDefault();
            handleSave();
        }
    }, [title, content, tags, page]);

    if (isLoading) {
        return (
            <div className="h-[calc(100vh-57px)] flex items-center justify-center bg-white dark:bg-[#0d0d0d]">
                <div className="text-gray-500 dark:text-gray-400">Loading...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="h-[calc(100vh-57px)] flex items-center justify-center bg-white dark:bg-[#0d0d0d]">
                <div className="text-center">
                    <div className="text-gray-500 dark:text-gray-400 mb-4">{error}</div>
                    <Link href="/docs" className="text-purple-600 dark:text-purple-400 hover:underline">
                        Back to docs
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="h-[calc(100vh-57px)] flex flex-col bg-white dark:bg-[#0d0d0d]" onKeyDown={handleKeyDown}>
            {/* Header */}
            <div className="flex-shrink-0 border-b border-gray-200 dark:border-gray-800 px-4 py-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link
                            href={getPageUrl()}
                            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                        >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </Link>
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                            Editing doc page
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleDelete}
                            disabled={isDeleting}
                            className="px-3 py-1.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors disabled:opacity-50"
                        >
                            {isDeleting ? 'Deleting...' : 'Delete'}
                        </button>
                        <Link
                            href={getPageUrl()}
                            className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
                        >
                            Cancel
                        </Link>
                        <button
                            onClick={handleSave}
                            disabled={isSaving || !title.trim()}
                            className="px-4 py-1.5 text-sm bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            {isSaving ? 'Saving...' : 'Save'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Title and Tags */}
            <div className="flex-shrink-0 border-b border-gray-200 dark:border-gray-800 px-4 py-3">
                <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Page title..."
                    autoFocus
                    className="w-full text-xl font-semibold text-gray-900 dark:text-gray-100 bg-transparent border-none outline-none placeholder-gray-400"
                />
                <input
                    type="text"
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                    placeholder="Tags (comma-separated)..."
                    className="w-full mt-2 text-sm text-gray-600 dark:text-gray-400 bg-transparent border-none outline-none placeholder-gray-400"
                />
            </div>

            {/* Editor */}
            <div className="flex-1 overflow-hidden flex flex-col">
                <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="Write your content in markdown...

Tip: Link to other pages using [[Page Title]] syntax"
                    className="flex-1 w-full p-4 text-sm font-mono text-gray-900 dark:text-gray-100 bg-transparent border-none outline-none resize-none leading-relaxed"
                    spellCheck={false}
                />

                {/* Attachments Section */}
                {page && (
                    <div className="flex-shrink-0 border-t border-gray-200 dark:border-gray-800 p-4">
                        <div className="mb-2 flex items-center gap-2">
                            <svg className="w-4 h-4 text-gray-500 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                Images & Attachments
                            </span>
                            {files.length > 0 && (
                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                    ({files.length} file{files.length !== 1 ? 's' : ''})
                                </span>
                            )}
                        </div>
                        <FileUpload
                            parentType="doc"
                            parentId={getDocId()}
                            files={files}
                            onFilesChange={setFiles}
                            disabled={isSaving}
                        />
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="flex-shrink-0 border-t border-gray-200 dark:border-gray-800 px-4 py-2 bg-gray-50 dark:bg-[#111]">
                <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                    <span>Markdown supported - [[Page Title]] for doc links - Press Ctrl/Cmd+S to save</span>
                    <span>{content.length} characters</span>
                </div>
            </div>
        </div>
    );
}
