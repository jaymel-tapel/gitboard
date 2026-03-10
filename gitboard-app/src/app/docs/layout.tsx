import { Suspense } from 'react';
import { getDocsPages, getDocsFolders } from '@/app/actions';
import { DocsSidebar } from '@/components/DocsSidebar';
import { DocsLayoutClient } from '@/components/DocsLayoutClient';

export const dynamic = 'force-dynamic';

export default async function DocsLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const [pages, folders] = await Promise.all([
        getDocsPages(),
        getDocsFolders(),
    ]);

    // Extract all unique tags from pages
    const allTags = Array.from(
        new Set(pages.flatMap((page) => page.tags))
    ).sort();

    return (
        <DocsLayoutClient>
            <div className="min-h-screen flex">
                <Suspense fallback={
                    <aside className="w-64 border-r border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-[#111] flex-shrink-0" />
                }>
                    <DocsSidebar pages={pages} allTags={allTags} folders={folders} />
                </Suspense>

                {/* Main Content */}
                <main className="flex-1 min-w-0">
                    {children}
                </main>
            </div>
        </DocsLayoutClient>
    );
}
