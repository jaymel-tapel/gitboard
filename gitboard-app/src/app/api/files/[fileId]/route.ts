import { NextRequest, NextResponse } from 'next/server';
import { FileSystemManager } from '@/lib/file-system';
import { FileManager } from '@/lib/core/file-manager';
import { getStorageProvider } from '@/lib/storage';
import { getProjectRoot } from '@/lib/get-project-root';

/**
 * Get repository path (uses shared utility)
 */
function getRepoPath(): string {
    return getProjectRoot();
}

/**
 * Get FileManager instance
 */
function getFileManager(): FileManager {
    const repoPath = getRepoPath();
    const fsManager = new FileSystemManager(repoPath);
    const storageProvider = getStorageProvider(repoPath);
    return new FileManager(fsManager, storageProvider, () => 'GitBoard User');
}

/**
 * GET /api/files/[fileId] - Download a file
 *
 * Returns the file content with appropriate Content-Type header
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ fileId: string }> }
) {
    try {
        const { fileId } = await params;

        if (!fileId) {
            return NextResponse.json(
                { error: 'File ID is required' },
                { status: 400 }
            );
        }

        const fileManager = getFileManager();

        // Download the file
        const { buffer, file } = await fileManager.downloadFile(fileId);

        // Determine Content-Disposition based on MIME type
        // Images and PDFs can be displayed inline, others should download
        const inlineTypes = [
            'image/png',
            'image/jpeg',
            'image/gif',
            'image/webp',
            'image/svg+xml',
            'application/pdf',
            'text/plain',
            'text/markdown',
            'text/csv',
            'application/json',
        ];

        const disposition = inlineTypes.includes(file.mime_type)
            ? `inline; filename="${encodeURIComponent(file.original_filename)}"`
            : `attachment; filename="${encodeURIComponent(file.original_filename)}"`;

        // Return the file
        return new NextResponse(new Uint8Array(buffer), {
            status: 200,
            headers: {
                'Content-Type': file.mime_type,
                'Content-Disposition': disposition,
                'Content-Length': buffer.length.toString(),
                'Cache-Control': 'private, max-age=3600',
            },
        });
    } catch (error) {
        console.error('File download error:', error);

        if (error instanceof Error && error.message.includes('not found')) {
            return NextResponse.json(
                { error: 'File not found' },
                { status: 404 }
            );
        }

        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to download file' },
            { status: 500 }
        );
    }
}
