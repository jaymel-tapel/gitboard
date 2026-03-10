import { FileSystemManager } from '../file-system';
import type { Lock } from '../schemas';

/**
 * Lock Manager
 *
 * Handles file/directory locking to prevent conflicts when multiple
 * agents or humans work on the same resources.
 */
export class LockManager {
    constructor(
        private fs: FileSystemManager,
        private getCurrentUser: () => string
    ) {}

    /**
     * Acquire a lock on a path
     */
    async acquire(path: string): Promise<Lock> {
        const normalizedPath = this.normalizePath(path);
        const user = this.getCurrentUser();

        const conflictingLock = await this.findConflictingLock(
            normalizedPath,
            user
        );
        if (conflictingLock) {
            throw new Error(
                `Path "${normalizedPath}" is already locked by ${conflictingLock.locked_by} (locked: ${conflictingLock.path})`
            );
        }

        const lock: Lock = {
            path: normalizedPath,
            locked_by: user,
            locked_at: new Date().toISOString(),
        };

        const locksFile = await this.fs.readLocks();
        locksFile.locks.push(lock);
        await this.fs.writeLocks(locksFile);

        return lock;
    }

    /**
     * Release a lock on a path
     */
    async release(path: string, force: boolean = false): Promise<void> {
        const normalizedPath = this.normalizePath(path);
        const user = this.getCurrentUser();

        const locksFile = await this.fs.readLocks();
        const lockIndex = locksFile.locks.findIndex(
            (l) => l.path === normalizedPath
        );

        if (lockIndex === -1) {
            throw new Error(`No lock found for path "${normalizedPath}"`);
        }

        const lock = locksFile.locks[lockIndex]!;

        if (lock.locked_by !== user && !force) {
            throw new Error(
                `Cannot unlock "${normalizedPath}" - locked by ${lock.locked_by}. Use force to override.`
            );
        }

        locksFile.locks.splice(lockIndex, 1);
        await this.fs.writeLocks(locksFile);
    }

    /**
     * Check if a path is locked
     */
    async isLocked(path: string): Promise<Lock | null> {
        const normalizedPath = this.normalizePath(path);
        const locksFile = await this.fs.readLocks();
        return locksFile.locks.find((l) => l.path === normalizedPath) || null;
    }

    /**
     * List all active locks
     */
    async listAll(): Promise<Lock[]> {
        const locksFile = await this.fs.readLocks();
        return locksFile.locks;
    }

    /**
     * Find a conflicting lock for a given path
     */
    async findConflictingLock(
        path: string,
        currentUser: string
    ): Promise<Lock | null> {
        const normalizedPath = this.normalizePath(path);
        const locksFile = await this.fs.readLocks();

        for (const lock of locksFile.locks) {
            if (lock.locked_by === currentUser) {
                continue;
            }

            if (lock.path === normalizedPath) {
                return lock;
            }

            if (this.isChildPath(normalizedPath, lock.path)) {
                return lock;
            }

            if (this.isChildPath(lock.path, normalizedPath)) {
                return lock;
            }
        }

        return null;
    }

    /**
     * Check if childPath is inside parentPath
     */
    private isChildPath(childPath: string, parentPath: string): boolean {
        const normalizedParent = parentPath.endsWith('/')
            ? parentPath
            : parentPath + '/';
        return childPath.startsWith(normalizedParent);
    }

    /**
     * Normalize a path for consistent comparison
     */
    private normalizePath(path: string): string {
        let normalized = path.replace(/^\.\//, '');
        normalized = normalized.replace(/^\//, '');
        return normalized;
    }
}
