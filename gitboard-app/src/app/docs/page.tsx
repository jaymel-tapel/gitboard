import type { Metadata } from 'next';
import { getDocsPages, getConfig } from '@/app/actions';
import Link from 'next/link';
import { formatPageTitle } from '@/lib/title-utils';
import { DocsAgentButton } from '@/components/DocsAgentButton';
import { RefreshAIMemoryButton } from '@/components/RefreshAIMemoryButton';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
    const config = await getConfig();
    return {
        title: formatPageTitle('Docs', config.project.name),
    };
}

export default async function DocsIndexPage() {
    const pages = await getDocsPages();

    // Sort pages by updated date, most recent first
    const sortedPages = [...pages].sort((a, b) =>
        new Date(b.metadata.updated_at).getTime() - new Date(a.metadata.updated_at).getTime()
    );

    return (
        <div className="h-full bg-white dark:bg-[#0d0d0d]">
            {/* Header */}
            <div className="border-b border-gray-200 dark:border-gray-800 px-8 py-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                            Docs
                        </h1>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                            {pages.length} {pages.length === 1 ? 'page' : 'pages'}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <RefreshAIMemoryButton />
                        <DocsAgentButton />
                        <Link
                            href="/docs/new"
                            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            New Page
                        </Link>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="p-8">
                {pages.length === 0 ? (
                    <div className="text-center py-12">
                        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                            <svg className="w-8 h-8 text-purple-600 dark:text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                        </div>
                        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                            No docs pages yet
                        </h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                            Create your first docs page to get started
                        </p>
                        <Link
                            href="/docs/new"
                            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                        >
                            Create Page
                        </Link>
                    </div>
                ) : (
                    <div className="space-y-6">
                        <h2 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Recently Updated
                        </h2>
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                            {sortedPages.map((page) => {
                                const pageUrl = page.folder
                                    ? `/docs/${page.folder}/${page.slug}`
                                    : `/docs/${page.slug}`;
                                return (
                                    <Link
                                        key={`${page.folder}-${page.slug}`}
                                        href={pageUrl}
                                        className="block p-4 bg-gray-50 dark:bg-[#111] rounded-lg border border-gray-200 dark:border-gray-800 hover:border-purple-300 dark:hover:border-purple-700 transition-colors"
                                    >
                                        <div className="flex items-start justify-between mb-2">
                                            <h3 className="font-medium text-gray-900 dark:text-gray-100 line-clamp-1">
                                                {page.title}
                                            </h3>
                                            {page.folder && (
                                                <span className="text-xs px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded">
                                                    {page.folder}
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2 mb-3">
                                            {page.content.slice(0, 150)}...
                                        </p>
                                        <div className="flex items-center justify-between text-xs text-gray-400 dark:text-gray-500">
                                            <span>
                                                {new Date(page.metadata.updated_at).toLocaleDateString()}
                                            </span>
                                            {page.tags.length > 0 && (
                                                <div className="flex gap-1">
                                                    {page.tags.slice(0, 2).map((tag) => (
                                                        <span key={tag} className="text-purple-600 dark:text-purple-400">
                                                            #{tag}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </Link>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
