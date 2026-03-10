/**
 * Storage Provider Interface
 *
 * Defines a common interface for file storage operations that can be implemented
 * by different storage backends (local filesystem, S3, etc.)
 */

/**
 * Result of a file upload operation
 */
export interface UploadResult {
    /** The storage path where the file was saved */
    storagePath: string;
    /** Size of the uploaded file in bytes */
    sizeBytes: number;
}

/**
 * Information about a stored file
 */
export interface FileInfo {
    /** The storage path of the file */
    path: string;
    /** Size in bytes */
    sizeBytes: number;
    /** Last modified timestamp */
    lastModified: Date;
}

/**
 * Options for upload operations
 */
export interface UploadOptions {
    /** MIME type of the file */
    mimeType: string;
    /** Optional custom filename (otherwise derived from path) */
    filename?: string;
}

/**
 * Storage Provider Interface
 *
 * All storage implementations must implement these methods to provide
 * a consistent API for file operations.
 */
export interface StorageProvider {
    /**
     * Upload a file to storage
     * @param path - The destination path (e.g., "tickets/PM-0001/image.png")
     * @param buffer - The file content as a Buffer
     * @param options - Upload options including MIME type
     * @returns Upload result with storage path and size
     */
    upload(path: string, buffer: Buffer, options: UploadOptions): Promise<UploadResult>;

    /**
     * Download a file from storage
     * @param path - The storage path of the file
     * @returns The file content as a Buffer
     * @throws Error if file not found
     */
    download(path: string): Promise<Buffer>;

    /**
     * Delete a file from storage
     * @param path - The storage path of the file
     * @throws Error if file not found
     */
    delete(path: string): Promise<void>;

    /**
     * Check if a file exists in storage
     * @param path - The storage path to check
     * @returns true if file exists, false otherwise
     */
    exists(path: string): Promise<boolean>;

    /**
     * List files with a given prefix
     * @param prefix - The path prefix to search (e.g., "tickets/PM-0001/")
     * @returns Array of file info objects
     */
    list(prefix: string): Promise<FileInfo[]>;

    /**
     * Get the URL or path for accessing a file
     * @param path - The storage path of the file
     * @returns URL or local path to access the file
     */
    getUrl(path: string): string;

    /**
     * Delete all files with a given prefix
     * @param prefix - The path prefix (e.g., "tickets/PM-0001/")
     * @returns Number of files deleted
     */
    deleteByPrefix(prefix: string): Promise<number>;
}
