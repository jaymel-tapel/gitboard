import { NextResponse } from 'next/server';
import { FileSystemManager } from '@/lib/file-system';
import { getProjectRoot } from '@/lib/get-project-root';

export async function GET() {
    try {
        const repoPath = getProjectRoot();
        const fs = new FileSystemManager(repoPath);

        const pages = await fs.listDocsPages();
        const folders = await fs.listDocsFolders();

        // Get full page details
        const docsPages = await Promise.all(
            pages.map(async ({ folder, slug }) => {
                try {
                    const page = await fs.readDocPage(folder, slug);
                    return {
                        slug: page.slug,
                        folder: page.folder || '',
                        title: page.title,
                        path: page.folder ? `${page.folder}/${page.slug}` : page.slug,
                    };
                } catch {
                    return null;
                }
            })
        );

        return NextResponse.json({
            docsPages: docsPages.filter(Boolean),
            folders
        });
    } catch (error) {
        console.error('Failed to fetch docs pages:', error);
        return NextResponse.json({ docsPages: [], folders: [], error: 'Failed to fetch docs pages' }, { status: 500 });
    }
}
