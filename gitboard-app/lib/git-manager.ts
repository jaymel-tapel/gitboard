import { simpleGit, SimpleGit } from 'simple-git';
import * as path from 'path';
import * as fs from 'fs';

export interface GitCommitOptions {
    message: string;
    files?: string[];
}

export interface GitLogEntry {
    hash: string;
    date: string;
    message: string;
    author: string;
    body: string;
}

export interface WorktreeInfo {
    path: string;
    branch: string;
    head: string;
}

/**
 * Git Manager for GitBoard Standalone
 * Handles all git operations: commit, log, diff, status, branches, and worktrees
 */
export class GitManager {
    private git: SimpleGit;
    private repoPath: string;

    constructor(repoPath: string) {
        this.git = simpleGit(repoPath);
        this.repoPath = repoPath;
    }

    /**
     * Get the repository root path
     */
    getRepoPath(): string {
        return this.repoPath;
    }

    /**
     * Get the standard worktree path for a ticket ID
     * Returns: {repoRoot}/.worktrees/{ticketId}
     */
    getWorktreePath(ticketId: string): string {
        return path.join(this.repoPath, '.worktrees', ticketId);
    }

    /**
     * Check if a branch exists
     */
    async branchExists(branchName: string): Promise<boolean> {
        try {
            const branches = await this.git.branchLocal();
            return branches.all.includes(branchName);
        } catch {
            return false;
        }
    }

    /**
     * Create a new branch from a base branch
     */
    async createBranch(branchName: string, baseBranch: string): Promise<void> {
        await this.git.checkoutBranch(branchName, baseBranch);
        // Switch back to the original branch
        await this.git.checkout(baseBranch);
    }

    /**
     * List all local branches
     * Returns array of branch names with the default branch (main/master) first
     */
    async listBranches(): Promise<{ branches: string[]; defaultBranch: string }> {
        const result = await this.git.branchLocal();
        const branches = result.all;

        // Determine default branch (prefer main over master)
        let defaultBranch = 'main';
        if (branches.includes('main')) {
            defaultBranch = 'main';
        } else if (branches.includes('master')) {
            defaultBranch = 'master';
        } else if (branches.length > 0) {
            defaultBranch = result.current || branches[0];
        }

        // Sort branches with default first, then alphabetically
        const sortedBranches = [...branches].sort((a, b) => {
            if (a === defaultBranch) return -1;
            if (b === defaultBranch) return 1;
            return a.localeCompare(b);
        });

        return { branches: sortedBranches, defaultBranch };
    }

    /**
     * Get the current branch name
     */
    async getCurrentBranch(): Promise<string> {
        const result = await this.git.branchLocal();
        return result.current;
    }

    /**
     * Check if a worktree exists at the given path
     */
    async worktreeExists(worktreePath: string): Promise<boolean> {
        try {
            // Check if directory exists and is a valid worktree
            if (!fs.existsSync(worktreePath)) {
                return false;
            }

            const worktrees = await this.listWorktrees();
            return worktrees.some(wt => wt.path === worktreePath);
        } catch {
            return false;
        }
    }

    /**
     * Prune stale worktree references (needed when worktree folder was manually deleted)
     */
    async pruneWorktrees(): Promise<void> {
        try {
            await this.git.raw(['worktree', 'prune']);
        } catch {
            // Ignore errors - pruning is best-effort
        }
    }

    /**
     * Create a worktree for a branch at the specified path
     */
    async createWorktree(branchName: string, worktreePath: string): Promise<void> {
        // Prune stale worktree references first (handles manually deleted worktrees)
        await this.pruneWorktrees();

        // Ensure parent directory exists
        const parentDir = path.dirname(worktreePath);
        if (!fs.existsSync(parentDir)) {
            fs.mkdirSync(parentDir, { recursive: true });
        }

        // Create worktree
        await this.git.raw(['worktree', 'add', worktreePath, branchName]);
    }

    /**
     * List all existing worktrees
     */
    async listWorktrees(): Promise<WorktreeInfo[]> {
        try {
            const result = await this.git.raw(['worktree', 'list', '--porcelain']);
            const worktrees: WorktreeInfo[] = [];

            const lines = result.split('\n');
            let current: Partial<WorktreeInfo> = {};

            for (const line of lines) {
                if (line.startsWith('worktree ')) {
                    current.path = line.substring(9);
                } else if (line.startsWith('HEAD ')) {
                    current.head = line.substring(5);
                } else if (line.startsWith('branch ')) {
                    // Format: refs/heads/branch-name
                    current.branch = line.substring(7).replace('refs/heads/', '');
                } else if (line === '' && current.path) {
                    if (current.path && current.head) {
                        worktrees.push({
                            path: current.path,
                            branch: current.branch || '',
                            head: current.head
                        });
                    }
                    current = {};
                }
            }

            // Handle last worktree if no trailing newline
            if (current.path && current.head) {
                worktrees.push({
                    path: current.path,
                    branch: current.branch || '',
                    head: current.head
                });
            }

            return worktrees;
        } catch {
            return [];
        }
    }

    /**
     * Remove a worktree (but keep the branch)
     */
    async removeWorktree(worktreePath: string, force: boolean = false): Promise<void> {
        const args = ['worktree', 'remove'];
        if (force) {
            args.push('--force');
        }
        args.push(worktreePath);
        await this.git.raw(args);
    }

    /**
     * Ensure the .worktrees directory exists
     */
    ensureWorktreesDirectory(): void {
        const worktreesDir = path.join(this.repoPath, '.worktrees');
        if (!fs.existsSync(worktreesDir)) {
            fs.mkdirSync(worktreesDir, { recursive: true });
        }
    }

    async isGitRepo(): Promise<boolean> {
        try {
            await this.git.revparse(['--git-dir']);
            return true;
        } catch {
            return false;
        }
    }

    async commit(options: GitCommitOptions): Promise<string> {
        const { message, files } = options;

        if (files && files.length > 0) {
            await this.git.add(files);
        } else {
            await this.git.add('.');
        }

        const result = await this.git.commit(message);
        return result.commit;
    }

    async log(options?: {
        file?: string;
        grep?: string;
        maxCount?: number;
    }): Promise<GitLogEntry[]> {
        const logOptions: Record<string, unknown> = {
            format: {
                hash: '%H',
                date: '%ai',
                message: '%s',
                author: '%an',
                body: '%b',
            },
        };

        if (options?.maxCount) {
            logOptions.maxCount = options.maxCount;
        }

        if (options?.file) {
            logOptions.file = options.file;
        }

        const result = await this.git.log(logOptions as any);

        let entries = result.all.map((commit) => ({
            hash: commit.hash,
            date: commit.date,
            message: commit.message,
            author: commit.author_name || '',
            body: commit.body || '',
        }));

        if (options?.grep) {
            const regex = new RegExp(options.grep);
            entries = entries.filter((entry) => regex.test(entry.message));
        }

        return entries;
    }

    async status(): Promise<{
        modified: string[];
        added: string[];
        deleted: string[];
        untracked: string[];
        staged: string[];
    }> {
        const status = await this.git.status();

        return {
            modified: status.modified,
            added: status.created,
            deleted: status.deleted,
            untracked: status.not_added,
            staged: status.staged,
        };
    }

    async autoCommit(message: string, files: string[]): Promise<string | null> {
        const status = await this.status();
        const hasChanges = files.some(
            (file) =>
                status.modified.includes(file) ||
                status.added.includes(file) ||
                status.deleted.includes(file) ||
                status.untracked.includes(file)
        );

        if (!hasChanges) {
            return null;
        }

        return this.commit({ message, files });
    }

    async getRecentActivity(maxCount: number = 20): Promise<GitLogEntry[]> {
        return this.log({
            grep: '^\\[gitboard\\]',
            maxCount,
        });
    }
}
