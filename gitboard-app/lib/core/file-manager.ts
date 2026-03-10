import { promises as fs } from 'fs';
import { join, dirname, basename, extname } from 'path';
import { randomUUID } from 'crypto';
import { FileSystemManager, detectStandaloneDataPath } from '../file-system';
import type { StorageProvider } from '../storage/storage-provider';
import {
    FileAttachmentSchema,
    type FileAttachment,
    type ParentType,
    MAX_FILE_SIZE_BYTES,
    ALLOWED_MIME_TYPES_LIST,
    ALLOWED_EXTENSIONS,
} from '../schemas';

/**
 * Options for creating a file attachment
 */
export interface CreateFileOptions {
    /** Parent entity type (ticket or doc) */
    parentType: ParentType;
    /** Parent entity ID (e.g., "PM-0001" or "folder/slug") */
    parentId: string;
    /** Original filename */
    filename: string;
    /** File content as Buffer */
    buffer: Buffer;
    /** MIME type of the file */
    mimeType: string;
}

/**
 * Result of file validation
 */
export interface FileValidationResult {
    valid: boolean;
    error?: string;
}

/**
 * Generate a unique file ID using UUID
 */
export function generateFileId(): string {
    return randomUUID();
}

/**
 * Sanitize a filename to be safe for filesystem storage
 * Removes unsafe characters while preserving the extension
 */
export function sanitizeFilename(filename: string): string {
    // Get the extension
    const ext = extname(filename);
    const nameWithoutExt = basename(filename, ext);

    // Replace unsafe characters with hyphens
    const safeName = nameWithoutExt
        .replace(/[^a-zA-Z0-9_-]/g, '-') // Replace special chars with hyphen
        .replace(/-+/g, '-') // Replace multiple hyphens with single
        .replace(/^-|-$/g, '') // Remove leading/trailing hyphens
        .toLowerCase()
        .substring(0, 100); // Limit length

    // Ensure we have at least some name
    const finalName = safeName || 'file';

    return `${finalName}${ext.toLowerCase()}`;
}

/**
 * Validate a file for upload
 */
export function validateFile(
    buffer: Buffer,
    mimeType: string,
    filename: string
): FileValidationResult {
    // Check file size
    if (buffer.length > MAX_FILE_SIZE_BYTES) {
        return {
            valid: false,
            error: 'File size exceeds maximum allowed size of 5MB',
        };
    }

    // Check MIME type
    if (!ALLOWED_MIME_TYPES_LIST.includes(mimeType)) {
        return {
            valid: false,
            error: `Invalid file type. Allowed types: ${ALLOWED_EXTENSIONS.join(', ')}`,
        };
    }

    // Check extension
    const ext = extname(filename).toLowerCase();
    if (ext && !(ALLOWED_EXTENSIONS as readonly string[]).includes(ext)) {
        return {
            valid: false,
            error: `Invalid file extension. Allowed extensions: ${ALLOWED_EXTENSIONS.join(', ')}`,
        };
    }

    return { valid: true };
}

/**
 * File Manager
 *
 * Handles file attachment operations: create, read, delete, list
 * Stores file metadata as JSON and delegates file storage to StorageProvider
 */
export class FileManager {
    private metadataBasePath: string;
    private isStandaloneMode: boolean;
    private standaloneDataPath: string | null;

    constructor(
        private fsManager: FileSystemManager,
        private storageProvider: StorageProvider,
        private getCurrentUser: () => string
    ) {
        // Check for standalone mode
        this.standaloneDataPath = detectStandaloneDataPath();
        this.isStandaloneMode = !!this.standaloneDataPath;

        if (this.standaloneDataPath) {
            this.metadataBasePath = join(this.standaloneDataPath, 'files');
        } else {
            this.metadataBasePath = join(fsManager.getRepoPath(), 'gitboard', 'files');
        }
    }

    /**
     * Get the metadata directory path for a parent entity
     */
    private getMetadataDir(parentType: ParentType, parentId: string): string {
        if (parentType === 'ticket') {
            return join(this.metadataBasePath, 'tickets', parentId);
        } else {
            // For docs, parentId is "folder/slug" format
            return join(this.metadataBasePath, 'docs', parentId);
        }
    }

    /**
     * Get the metadata file path for a file
     */
    private getMetadataPath(parentType: ParentType, parentId: string, fileId: string): string {
        return join(this.getMetadataDir(parentType, parentId), `${fileId}.json`);
    }

    /**
     * Get the storage path prefix for a parent entity
     */
    private getStoragePrefix(parentType: ParentType, parentId: string): string {
        if (parentType === 'ticket') {
            return `tickets/${parentId}`;
        } else {
            return `docs/${parentId}`;
        }
    }

    /**
     * Ensure a directory exists
     */
    private async ensureDir(dirPath: string): Promise<void> {
        try {
            await fs.mkdir(dirPath, { recursive: true });
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
                throw error;
            }
        }
    }

    /**
     * Create a new file attachment
     */
    async create(options: CreateFileOptions): Promise<FileAttachment> {
        const { parentType, parentId, filename, buffer, mimeType } = options;

        // Validate the file
        const validation = validateFile(buffer, mimeType, filename);
        if (!validation.valid) {
            throw new Error(validation.error);
        }

        // Generate file ID
        const fileId = generateFileId();

        // Sanitize filename
        const safeFilename = sanitizeFilename(filename);

        // Build storage path
        const storagePrefix = this.getStoragePrefix(parentType, parentId);
        const storagePath = `${storagePrefix}/${safeFilename}`;

        // Upload file to storage
        const uploadResult = await this.storageProvider.upload(storagePath, buffer, {
            mimeType,
            filename: safeFilename,
        });

        // Create file attachment metadata
        const now = new Date().toISOString();
        const user = this.getCurrentUser();

        const fileAttachment: FileAttachment = {
            id: fileId,
            original_filename: filename,
            storage_path: uploadResult.storagePath,
            size_bytes: uploadResult.sizeBytes,
            mime_type: mimeType,
            parent_type: parentType,
            parent_id: parentId,
            metadata: {
                created_at: now,
                created_by: user,
            },
        };

        // Validate against schema
        FileAttachmentSchema.parse(fileAttachment);

        // Save metadata to JSON file
        const metadataDir = this.getMetadataDir(parentType, parentId);
        await this.ensureDir(metadataDir);

        const metadataPath = this.getMetadataPath(parentType, parentId, fileId);
        await fs.writeFile(metadataPath, JSON.stringify(fileAttachment, null, 2), 'utf-8');

        return fileAttachment;
    }

    /**
     * Read a file attachment by ID
     * Searches in all parent directories if parentType/parentId not provided
     */
    async read(fileId: string): Promise<FileAttachment | null> {
        // Search in tickets directory
        const ticketsDir = join(this.metadataBasePath, 'tickets');
        const ticketFile = await this.findFileInDir(ticketsDir, fileId);
        if (ticketFile) return ticketFile;

        // Search in docs directory
        const docsDir = join(this.metadataBasePath, 'docs');
        const docFile = await this.findFileInDir(docsDir, fileId);
        if (docFile) return docFile;

        return null;
    }

    /**
     * Find a file by ID in a directory (recursive)
     */
    private async findFileInDir(dir: string, fileId: string): Promise<FileAttachment | null> {
        try {
            const entries = await fs.readdir(dir, { withFileTypes: true });

            for (const entry of entries) {
                const entryPath = join(dir, entry.name);

                if (entry.isFile() && entry.name === `${fileId}.json`) {
                    const content = await fs.readFile(entryPath, 'utf-8');
                    return FileAttachmentSchema.parse(JSON.parse(content));
                }

                if (entry.isDirectory()) {
                    const found = await this.findFileInDir(entryPath, fileId);
                    if (found) return found;
                }
            }
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                return null;
            }
            throw error;
        }

        return null;
    }

    /**
     * Read a file attachment with known parent info
     */
    async readByParent(
        parentType: ParentType,
        parentId: string,
        fileId: string
    ): Promise<FileAttachment> {
        const metadataPath = this.getMetadataPath(parentType, parentId, fileId);

        try {
            const content = await fs.readFile(metadataPath, 'utf-8');
            return FileAttachmentSchema.parse(JSON.parse(content));
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                throw new Error(`File not found: ${fileId}`);
            }
            throw error;
        }
    }

    /**
     * Delete a file attachment by ID
     */
    async delete(fileId: string): Promise<FileAttachment> {
        // Find the file first
        const file = await this.read(fileId);
        if (!file) {
            throw new Error(`File not found: ${fileId}`);
        }

        // Delete from storage
        try {
            await this.storageProvider.delete(file.storage_path);
        } catch (error) {
            // Log but don't fail if storage file is already gone
            console.warn(`Storage file not found for ${fileId}:`, error);
        }

        // Delete metadata file
        const metadataPath = this.getMetadataPath(file.parent_type, file.parent_id, fileId);
        await fs.unlink(metadataPath);

        return file;
    }

    /**
     * List all files attached to a parent entity
     */
    async listByParent(parentType: ParentType, parentId: string): Promise<FileAttachment[]> {
        const metadataDir = this.getMetadataDir(parentType, parentId);
        const files: FileAttachment[] = [];

        try {
            const entries = await fs.readdir(metadataDir);

            for (const entry of entries) {
                if (entry.endsWith('.json')) {
                    const filePath = join(metadataDir, entry);
                    const content = await fs.readFile(filePath, 'utf-8');

                    try {
                        const file = FileAttachmentSchema.parse(JSON.parse(content));
                        files.push(file);
                    } catch (error) {
                        console.error(`Invalid file metadata: ${filePath}`, error);
                    }
                }
            }
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                return [];
            }
            throw error;
        }

        // Sort by creation date (newest first)
        return files.sort((a, b) =>
            new Date(b.metadata.created_at).getTime() - new Date(a.metadata.created_at).getTime()
        );
    }

    /**
     * Delete all files attached to a parent entity
     * Used for cascade deletion when a ticket or doc is deleted
     */
    async deleteByParent(parentType: ParentType, parentId: string): Promise<number> {
        // Get all files for this parent
        const files = await this.listByParent(parentType, parentId);
        let deletedCount = 0;

        // Delete each file from storage
        for (const file of files) {
            try {
                await this.storageProvider.delete(file.storage_path);
                deletedCount++;
            } catch (error) {
                console.warn(`Failed to delete storage file: ${file.storage_path}`, error);
            }
        }

        // Delete the metadata directory
        const metadataDir = this.getMetadataDir(parentType, parentId);
        try {
            // Delete all files in the directory
            const entries = await fs.readdir(metadataDir);
            for (const entry of entries) {
                await fs.unlink(join(metadataDir, entry));
            }
            // Remove the directory
            await fs.rmdir(metadataDir);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
                console.warn(`Failed to delete metadata directory: ${metadataDir}`, error);
            }
        }

        // Also delete the storage directory
        const storagePrefix = this.getStoragePrefix(parentType, parentId);
        try {
            await this.storageProvider.deleteByPrefix(storagePrefix);
        } catch (error) {
            console.warn(`Failed to delete storage prefix: ${storagePrefix}`, error);
        }

        return deletedCount;
    }

    /**
     * Get the download URL for a file
     */
    getDownloadUrl(file: FileAttachment): string {
        return this.storageProvider.getUrl(file.storage_path);
    }

    /**
     * Download file content
     */
    async downloadFile(fileId: string): Promise<{ buffer: Buffer; file: FileAttachment }> {
        const file = await this.read(fileId);
        if (!file) {
            throw new Error(`File not found: ${fileId}`);
        }

        const buffer = await this.storageProvider.download(file.storage_path);
        return { buffer, file };
    }

    /**
     * Get all paths that need to be committed for a file operation
     */
    getCommitPaths(file: FileAttachment): string[] {
        if (this.isStandaloneMode) {
            // Standalone mode uses .gitboard/data/ structure
            const metadataPath = `.gitboard/data/files/${file.parent_type === 'ticket' ? 'tickets' : 'docs'}/${file.parent_id}/${file.id}.json`;
            const storagePath = `.gitboard/data/uploads/${file.storage_path}`;
            return [metadataPath, storagePath];
        }

        const metadataPath = `gitboard/files/${file.parent_type === 'ticket' ? 'tickets' : 'docs'}/${file.parent_id}/${file.id}.json`;
        const storagePath = `gitboard/uploads/${file.storage_path}`;
        return [metadataPath, storagePath];
    }

    /**
     * Check if running in standalone mode
     */
    isStandalone(): boolean {
        return this.isStandaloneMode;
    }
}
