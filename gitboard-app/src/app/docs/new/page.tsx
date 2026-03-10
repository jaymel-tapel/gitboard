'use client'

import { useState, useCallback, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createDocPage } from '@/app/actions';
import { usePageTitle } from '@/hooks/usePageTitle';

export default function NewDocPage() {
    // Set browser tab title
    usePageTitle('New Document');
    const router = useRouter();
    const searchParams = useSearchParams();
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [tags, setTags] = useState('');
    const [folder, setFolder] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    // Pre-fill title and folder from URL params
    useEffect(() => {
        const titleParam = searchParams?.get('title');
        const folderParam = searchParams?.get('folder');
        if (titleParam) {
            setTitle(titleParam);
        }
        if (folderParam) {
            setFolder(folderParam);
        }
    }, [searchParams]);

    async function handleSave() {
        if (!title.trim()) return;

        setIsSaving(true);
        try {
            // Generate slug from title
            const slug = title.toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-|-$/g, '');

            const result = await createDocPage({
                slug,
                folder,
                title,
                content,
            });

            if (result.success && result.page) {
                const pageUrl = result.page.folder
                    ? `/docs/${result.page.folder}/${result.page.slug}`
                    : `/docs/${result.page.slug}`;
                router.push(pageUrl);
            }
        } catch (error) {
            console.error('Failed to create doc page:', error);
        } finally {
            setIsSaving(false);
        }
    }

    // Handle keyboard shortcut for save
    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 's') {
            e.preventDefault();
            handleSave();
        }
    }, [title, content, tags]);

    return (
        <div className="h-[calc(100vh-57px)] flex flex-col bg-white dark:bg-[#0d0d0d]" onKeyDown={handleKeyDown}>
            {/* Header */}
            <div className="flex-shrink-0 border-b border-gray-200 dark:border-gray-800 px-4 py-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link
                            href="/docs"
                            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                        >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </Link>
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                            New doc page
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Link
                            href="/docs"
                            className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
                        >
                            Cancel
                        </Link>
                        <button
                            onClick={handleSave}
                            disabled={isSaving || !title.trim()}
                            className="px-4 py-1.5 text-sm bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            {isSaving ? 'Creating...' : 'Create'}
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
            <div className="flex-1 overflow-hidden">
                <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="Write your content in markdown...

Tip: Link to other pages using [[Page Title]] syntax"
                    className="w-full h-full p-4 text-sm font-mono text-gray-900 dark:text-gray-100 bg-transparent border-none outline-none resize-none leading-relaxed"
                    spellCheck={false}
                />
            </div>

            {/* Footer */}
            <div className="flex-shrink-0 border-t border-gray-200 dark:border-gray-800 px-4 py-2 bg-gray-50 dark:bg-[#111]">
                <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                    <span>Markdown supported - [[Page Title]] for doc links</span>
                    <span>{content.length} characters</span>
                </div>
            </div>
        </div>
    );
}
