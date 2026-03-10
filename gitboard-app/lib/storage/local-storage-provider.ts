import { promises as fs } from 'fs';
import { join, dirname, basename } from 'path';
import type {
    StorageProvider,
    UploadResult,
    FileInfo,
    UploadOptions,
} from './storage-provider';
import { detectStandaloneDataPath } from '../file-system';

/**
 * Local Storage Provider
 *
 * Implements StorageProvider interface using the local filesystem.
 * Files are stored under the gitboard/uploads/ directory (or .gitboard/data/uploads/ in standalone mode).
 */
export class LocalStorageProvider implements StorageProvider {
    private basePath: string;

    /**
     * Create a new LocalStorageProvider
     * @param repoPath - The repository root path
     */
    constructor(repoPath: string) {
        // Check for standalone mode
        const standaloneDataPath = detectStandaloneDataPath();
        if (standaloneDataPath) {
            this.basePath = join(standaloneDataPath, 'uploads');
        } else {
            this.basePath = join(repoPath, 'gitboard', 'uploads');
        }
    }

    /**
     * Get the full filesystem path for a storage path
     */
    private getFullPath(storagePath: string): string {
        // Sanitize path to prevent directory traversal attacks
        const sanitized = this.sanitizePath(storagePath);
        return join(this.basePath, sanitized);
    }

    /**
     * Sanitize a path to prevent directory traversal attacks
     */
    private sanitizePath(inputPath: string): string {
        // Remove any .. segments and normalize
        const segments = inputPath.split('/').filter(segment => {
            return segment !== '' && segment !== '.' && segment !== '..';
        });
        return segments.join('/');
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
     * Generate a unique filename if file already exists
     */
    private async getUniqueFilename(fullPath: string): Promise<string> {
        const dir = dirname(fullPath);
        const ext = fullPath.includes('.') ? '.' + fullPath.split('.').pop() : '';
        const baseName = basename(fullPath, ext);

        let finalPath = fullPath;
        let counter = 1;

        while (await this.fileExists(finalPath)) {
            finalPath = join(dir, `${baseName}-${counter}${ext}`);
            counter++;
        }

        return finalPath;
    }

    /**
     * Check if a file exists
     */
    private async fileExists(filePath: string): Promise<boolean> {
        try {
            await fs.access(filePath);
            return true;
        } catch {
            return false;
        }
    }

    async upload(
        path: string,
        buffer: Buffer,
        options: UploadOptions
    ): Promise<UploadResult> {
        const fullPath = this.getFullPath(path);
        const dir = dirname(fullPath);

        // Ensure directory exists
        await this.ensureDir(dir);

        // Get unique filename if file already exists
        const finalPath = await this.getUniqueFilename(fullPath);

        // Write the file
        await fs.writeFile(finalPath, buffer);

        // Calculate the relative storage path
        const storagePath = finalPath.replace(this.basePath + '/', '');

        return {
            storagePath,
            sizeBytes: buffer.length,
        };
    }

    async download(path: string): Promise<Buffer> {
        const fullPath = this.getFullPath(path);

        try {
            return await fs.readFile(fullPath);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                throw new Error(`File not found: ${path}`);
            }
            throw error;
        }
    }

    async delete(path: string): Promise<void> {
        const fullPath = this.getFullPath(path);

        try {
            await fs.unlink(fullPath);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                throw new Error(`File not found: ${path}`);
            }
            throw error;
        }
    }

    async exists(path: string): Promise<boolean> {
        const fullPath = this.getFullPath(path);
        return this.fileExists(fullPath);
    }

    async list(prefix: string): Promise<FileInfo[]> {
        const fullPath = this.getFullPath(prefix);
        const results: FileInfo[] = [];

        try {
            const entries = await fs.readdir(fullPath, { withFileTypes: true });

            for (const entry of entries) {
                if (entry.isFile()) {
                    const filePath = join(fullPath, entry.name);
                    const stats = await fs.stat(filePath);
                    const relativePath = join(prefix, entry.name);

                    results.push({
                        path: relativePath,
                        sizeBytes: stats.size,
                        lastModified: stats.mtime,
                    });
                }
            }
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                return [];
            }
            throw error;
        }

        return results;
    }

    getUrl(path: string): string {
        // For local storage, return the API endpoint path
        return `/api/files/download?path=${encodeURIComponent(path)}`;
    }

    async deleteByPrefix(prefix: string): Promise<number> {
        const fullPath = this.getFullPath(prefix);
        let deletedCount = 0;

        try {
            const entries = await fs.readdir(fullPath, { withFileTypes: true });

            for (const entry of entries) {
                const entryPath = join(fullPath, entry.name);

                if (entry.isFile()) {
                    await fs.unlink(entryPath);
                    deletedCount++;
                } else if (entry.isDirectory()) {
                    // Recursively delete subdirectories
                    const subPrefix = join(prefix, entry.name);
                    deletedCount += await this.deleteByPrefix(subPrefix);
                }
            }

            // Remove the directory itself if it's empty
            try {
                await fs.rmdir(fullPath);
            } catch {
                // Directory might not be empty or might not exist, ignore
            }
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                return 0;
            }
            throw error;
        }

        return deletedCount;
    }
}
