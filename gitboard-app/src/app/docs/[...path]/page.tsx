import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { getDocPage, getDocsPages, getConfig } from '@/app/actions';
import { remarkDocLinks } from '@/lib/remark-doc-links';
import { formatPageTitle } from '@/lib/title-utils';
import { DocsAgentButton } from '@/components/DocsAgentButton';
import { DocImageGallery } from '@/components/DocImageGallery';

import 'highlight.js/styles/github-dark.css';
import '../docs.css';

export const dynamic = 'force-dynamic';

interface DocPageViewProps {
    params: Promise<{ path: string[] }>;
}

function parsePathForMetadata(path: string[]): { folder: string; slug: string } | null {
    if (path.length === 1) {
        return { folder: '', slug: path[0]! };
    }
    if (path.length === 2) {
        return { folder: path[0]!, slug: path[1]! };
    }
    return null;
}

export async function generateMetadata({ params }: DocPageViewProps): Promise<Metadata> {
    const { path } = await params;
    const parsed = parsePathForMetadata(path);

    if (!parsed) {
        return { title: 'Not Found | GitBoard' };
    }

    try {
        const [page, config] = await Promise.all([
            getDocPage(parsed.folder, parsed.slug),
            getConfig(),
        ]);
        return {
            title: formatPageTitle(page.title, config.project.name),
        };
    } catch {
        return { title: 'Not Found | GitBoard' };
    }
}

function parsePath(path: string[]): { folder: string; slug: string } {
    if (path.length === 1) {
        return { folder: '', slug: path[0]! };
    }
    if (path.length === 2) {
        return { folder: path[0]!, slug: path[1]! };
    }
    notFound();
}

export default async function DocPageView({ params }: DocPageViewProps) {
    const { path } = await params;
    const { folder, slug } = parsePath(path);

    let page;
    try {
        page = await getDocPage(folder, slug);
    } catch {
        notFound();
    }

    // Get all pages for doc link resolution
    const allPages = await getDocsPages();
    const pagesForLinks = allPages.map(p => ({
        slug: p.slug,
        title: p.title,
        folder: p.folder,
    }));

    const updatedDate = new Date(page.metadata.updated_at).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
    });

    const editUrl = folder ? `/docs/edit/${folder}/${slug}` : `/docs/edit/${slug}`;

    return (
        <div className="h-full">
            {/* Header */}
            <div className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-[#0d0d0d]">
                <div className="px-8 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-1">
                                {folder && (
                                    <>
                                        <span className="text-purple-600 dark:text-purple-400">{folder}</span>
                                        <span>/</span>
                                    </>
                                )}
                            </div>
                            <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100 truncate">
                                {page.title}
                            </h1>
                            <div className="flex items-center gap-3 mt-1">
                                {page.tags.length > 0 && (
                                    <div className="flex gap-1.5">
                                        {page.tags.map((tag) => (
                                            <span
                                                key={tag}
                                                className="text-xs px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded"
                                            >
                                                {tag}
                                            </span>
                                        ))}
                                    </div>
                                )}
                                <span className="text-xs text-gray-400 dark:text-gray-500">
                                    Updated {updatedDate} by {page.metadata.updated_by}
                                </span>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <DocsAgentButton docContext={{ title: page.title, folder, slug }} />
                            <Link
                                href={editUrl}
                                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                                Edit
                            </Link>
                        </div>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="p-8 max-w-4xl">
                <article className="docs-content">
                    <ReactMarkdown
                        remarkPlugins={[
                            remarkGfm,
                            remarkDocLinks(pagesForLinks),
                        ]}
                        rehypePlugins={[rehypeHighlight]}
                    >
                        {page.content}
                    </ReactMarkdown>
                </article>

                {/* Attached Images & Files */}
                <DocImageGallery docId={folder ? `${folder}/${slug}` : slug} />
            </div>
        </div>
    );
}
