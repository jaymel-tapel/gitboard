import { NextRequest, NextResponse } from 'next/server';
import { FileSystemManager } from '@/lib/file-system';
import { GitManager } from '@/lib/git-manager';
import { FileManager, validateFile } from '@/lib/core/file-manager';
import { getStorageProvider } from '@/lib/storage';
import { getProjectRoot } from '@/lib/get-project-root';
import {
    MAX_FILE_SIZE_BYTES,
    ALLOWED_EXTENSIONS,
    ParentTypeSchema,
    type ParentType,
} from '@/lib/schemas';

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
 * Get GitManager instance
 */
function getGitManager(): GitManager {
    return new GitManager(getRepoPath());
}

/**
 * Check if parent entity exists
 */
async function parentExists(
    fsManager: FileSystemManager,
    parentType: ParentType,
    parentId: string
): Promise<boolean> {
    try {
        if (parentType === 'ticket') {
            await fsManager.findTicketStatus(parentId);
            return true;
        } else {
            // For docs, parentId is "folder/slug" format
            const parts = parentId.split('/');
            if (parts.length < 2) {
                // Root doc (no folder)
                await fsManager.readDocPage('', parentId);
            } else {
                const folder = parts.slice(0, -1).join('/');
                const slug = parts[parts.length - 1];
                await fsManager.readDocPage(folder, slug!);
            }
            return true;
        }
    } catch {
        return false;
    }
}

/**
 * POST /api/files - Upload a file
 */
export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();

        // Get form fields
        const file = formData.get('file') as File | null;
        const parentType = formData.get('parent_type') as string | null;
        const parentId = formData.get('parent_id') as string | null;

        // Validate required fields
        if (!file) {
            return NextResponse.json(
                { error: 'No file provided' },
                { status: 400 }
            );
        }

        if (!parentType || !parentId) {
            return NextResponse.json(
                { error: 'parent_type and parent_id are required' },
                { status: 400 }
            );
        }

        // Validate parent type
        const parentTypeResult = ParentTypeSchema.safeParse(parentType);
        if (!parentTypeResult.success) {
            return NextResponse.json(
                { error: 'Invalid parent_type. Must be "ticket" or "doc"' },
                { status: 400 }
            );
        }

        // Check file size (before reading into memory)
        if (file.size > MAX_FILE_SIZE_BYTES) {
            return NextResponse.json(
                { error: 'File size exceeds maximum allowed size of 5MB' },
                { status: 413 }
            );
        }

        // Get file buffer
        const buffer = Buffer.from(await file.arrayBuffer());

        // Validate MIME type (double-check after reading)
        const validation = validateFile(buffer, file.type, file.name);
        if (!validation.valid) {
            // Check if it's a MIME type error
            if (validation.error?.includes('Invalid file type')) {
                return NextResponse.json(
                    { error: `Invalid file type. Allowed types: ${ALLOWED_EXTENSIONS.join(', ')}` },
                    { status: 415 }
                );
            }
            return NextResponse.json(
                { error: validation.error },
                { status: validation.error?.includes('size') ? 413 : 400 }
            );
        }

        // Check if parent exists
        const repoPath = getRepoPath();
        const fsManager = new FileSystemManager(repoPath);

        if (!(await parentExists(fsManager, parentTypeResult.data, parentId))) {
            return NextResponse.json(
                { error: `${parentType === 'ticket' ? 'Ticket' : 'Doc'} not found: ${parentId}` },
                { status: 404 }
            );
        }

        // Create file attachment
        const fileManager = getFileManager();
        const fileAttachment = await fileManager.create({
            parentType: parentTypeResult.data,
            parentId,
            filename: file.name,
            buffer,
            mimeType: file.type,
        });

        // Git auto-commit
        const commitPaths = fileManager.getCommitPaths(fileAttachment);
        if (commitPaths.length > 0) {
            const git = getGitManager();
            await git.autoCommit(
                `[gitboard] Upload file: ${file.name} to ${parentType} ${parentId}`,
                commitPaths
            );
        }

        return NextResponse.json({
            success: true,
            file: fileAttachment,
        });
    } catch (error) {
        console.error('File upload error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to upload file' },
            { status: 500 }
        );
    }
}

/**
 * GET /api/files - List files or get file metadata
 *
 * Query params:
 * - parent_type: 'ticket' | 'doc'
 * - parent_id: The ID of the parent entity
 * - file_id: (optional) Get single file metadata
 */
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const fileId = searchParams.get('file_id');
        const parentType = searchParams.get('parent_type');
        const parentId = searchParams.get('parent_id');

        const fileManager = getFileManager();

        // If file_id is provided, get single file metadata
        if (fileId) {
            const file = await fileManager.read(fileId);
            if (!file) {
                return NextResponse.json(
                    { error: 'File not found' },
                    { status: 404 }
                );
            }
            return NextResponse.json({ file });
        }

        // Validate parent_type and parent_id for listing
        if (!parentType || !parentId) {
            return NextResponse.json(
                { error: 'parent_type and parent_id are required for listing files' },
                { status: 400 }
            );
        }

        const parentTypeResult = ParentTypeSchema.safeParse(parentType);
        if (!parentTypeResult.success) {
            return NextResponse.json(
                { error: 'Invalid parent_type. Must be "ticket" or "doc"' },
                { status: 400 }
            );
        }

        // List files for parent
        const files = await fileManager.listByParent(parentTypeResult.data, parentId);

        return NextResponse.json({ files });
    } catch (error) {
        console.error('File list error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to list files' },
            { status: 500 }
        );
    }
}

/**
 * DELETE /api/files - Delete a file
 *
 * Query params:
 * - file_id: The ID of the file to delete
 */
export async function DELETE(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const fileId = searchParams.get('file_id');

        if (!fileId) {
            return NextResponse.json(
                { error: 'file_id is required' },
                { status: 400 }
            );
        }

        const fileManager = getFileManager();

        // Delete the file
        const deletedFile = await fileManager.delete(fileId);

        // Git auto-commit
        const commitPaths = fileManager.getCommitPaths(deletedFile);
        if (commitPaths.length > 0) {
            const git = getGitManager();
            await git.autoCommit(
                `[gitboard] Delete file: ${deletedFile.original_filename} from ${deletedFile.parent_type} ${deletedFile.parent_id}`,
                commitPaths
            );
        }

        return NextResponse.json({
            success: true,
            message: `File ${deletedFile.original_filename} deleted successfully`,
        });
    } catch (error) {
        console.error('File delete error:', error);

        if (error instanceof Error && error.message.includes('not found')) {
            return NextResponse.json(
                { error: error.message },
                { status: 404 }
            );
        }

        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to delete file' },
            { status: 500 }
        );
    }
}
