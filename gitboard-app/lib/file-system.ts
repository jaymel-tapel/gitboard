import { promises as fs } from 'fs';
import { join, basename, dirname } from 'path';
import { existsSync } from 'fs';
import {
    TicketSchema, ConfigSchema, TeamSchema, InitiativeSchema,
    NextIDsSchema, DocPageSchema, AgentSchema, BoardSchema,
    TicketChatHistorySchema, ArtifactSchema,
    MCPConfigSchema,
    DEFAULT_STATUSES,
    type Ticket, type Config, type Team, type Initiative,
    type NextIDs, type DocPage, type Status, type Agent, type LocksFile,
    type StatusConfig, type Board, type TicketChatHistory, type Artifact,
    type Skill, type MCPConfig
} from './schemas';
import { parseSkillMarkdown, serializeSkillMarkdown } from './skill-parser';

/**
 * Detect if running in standalone mode (.gitboard/app/ structure)
 * Returns the data path if standalone, null otherwise
 */
export function detectStandaloneDataPath(): string | null {
    // Check if GITBOARD_DATA_PATH is explicitly set
    if (process.env.GITBOARD_DATA_PATH) {
        return process.env.GITBOARD_DATA_PATH;
    }

    // Check if we're in .gitboard/app/ structure
    const cwd = process.cwd();
    const parentDir = dirname(cwd);
    const parentName = basename(parentDir);
    const cwdName = basename(cwd);

    // If current dir is 'app' and parent is '.gitboard', we're in standalone mode
    if (cwdName === 'app' && parentName === '.gitboard') {
        const dataPath = join(parentDir, 'data');
        if (existsSync(dataPath)) {
            return dataPath;
        }
    }

    return null;
}

/**
 * File System Manager for GitBoard Standalone
 * Handles all file I/O operations for tickets, config, team, docs, and agents.
 */
export class FileSystemManager {
    private _dataPath: string | null = null;

    constructor(private repoPath: string) { }

    private get gitboardPath(): string {
        // Check for standalone mode data path (cached)
        if (this._dataPath === null) {
            this._dataPath = detectStandaloneDataPath() || '';
        }

        // If in standalone mode, use the detected data path
        if (this._dataPath) {
            return this._dataPath;
        }

        // Default: development mode with gitboard/ folder
        return join(this.repoPath, 'gitboard');
    }

    /**
     * Get the relative git path prefix (for git add/commit operations)
     * Returns '.gitboard/data' in standalone mode, 'gitboard' in dev mode
     */
    private get gitRelativePrefix(): string {
        if (this._dataPath === null) {
            this._dataPath = detectStandaloneDataPath() || '';
        }
        return this._dataPath ? '.gitboard/data' : 'gitboard';
    }

    public getRepoPath(): string {
        return this.repoPath;
    }

    /**
     * Get the data directory path (gitboard/ or .gitboard/data/)
     * Use this for reading/writing data files
     */
    public getDataPath(): string {
        return this.gitboardPath;
    }

    /**
     * Get the tickets path for a specific board
     */
    public getBoardTicketsPath(boardId: string): string {
        return join(this.gitboardPath, 'boards', boardId, 'tickets');
    }

    private getStatusPath(status: Status, boardId?: string): string {
        if (boardId) {
            return join(this.getBoardTicketsPath(boardId), status);
        }
        return join(this.gitboardPath, 'tickets', status);
    }

    // ============================================================================
    // Board Operations
    // ============================================================================

    private get boardsDir(): string {
        return join(this.gitboardPath, 'boards');
    }

    private getBoardMetadataPath(boardId: string): string {
        return join(this.boardsDir, boardId, 'board.json');
    }

    /**
     * Discover all boards by listing directories under gitboard/boards/
     * and reading each board's board.json metadata file.
     */
    async getBoards(): Promise<Board[]> {
        try {
            const entries = await fs.readdir(this.boardsDir, { withFileTypes: true });
            const boards: Board[] = [];

            for (const entry of entries) {
                if (entry.isDirectory()) {
                    try {
                        const board = await this.getBoardById(entry.name);
                        if (board) {
                            boards.push(board);
                        }
                    } catch {
                        // Skip boards with invalid/missing board.json
                    }
                }
            }

            return boards.sort((a, b) => a.created_at.localeCompare(b.created_at));
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                return [];
            }
            throw error;
        }
    }

    async getBoardById(boardId: string): Promise<Board | undefined> {
        const metadataPath = this.getBoardMetadataPath(boardId);
        try {
            const content = await fs.readFile(metadataPath, 'utf-8');
            return this.parseJSON(content, BoardSchema);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                return undefined;
            }
            throw error;
        }
    }

    async writeBoardMetadata(board: Board): Promise<void> {
        const boardDir = join(this.boardsDir, board.id);
        await this.ensureDir(boardDir);
        const metadataPath = this.getBoardMetadataPath(board.id);
        await fs.writeFile(metadataPath, this.serializeJSON(board), 'utf-8');
    }

    async createBoard(board: Board): Promise<void> {
        const boardDir = join(this.boardsDir, board.id);
        await this.ensureDir(boardDir);

        // Write board.json metadata
        await this.writeBoardMetadata(board);

        // Create tickets directory with status subdirectories
        const boardTicketsPath = this.getBoardTicketsPath(board.id);
        await this.ensureDir(boardTicketsPath);

        const statuses = board.statuses || await this.getStatuses(board.id);
        for (const status of statuses) {
            await this.ensureDir(join(boardTicketsPath, status.id));
        }
    }

    async updateBoard(boardId: string, updates: Partial<Omit<Board, 'id' | 'created_at'>>): Promise<void> {
        const board = await this.getBoardById(boardId);
        if (!board) {
            throw new Error(`Board "${boardId}" not found`);
        }
        const updated: Board = { ...board, ...updates };
        await this.writeBoardMetadata(updated);
    }

    async deleteBoard(boardId: string): Promise<void> {
        const boardPath = join(this.boardsDir, boardId);
        try {
            await fs.rm(boardPath, { recursive: true });
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
                throw error;
            }
        }
    }

    /**
     * Migrate existing tickets from gitboard/tickets/ to gitboard/boards/default/tickets/
     * Called on first load when no boards exist but gitboard/tickets/ does.
     */
    async migrateTicketsToDefaultBoard(): Promise<boolean> {
        const oldTicketsPath = join(this.gitboardPath, 'tickets');
        const boards = await this.getBoards();

        // Already have boards — no migration needed
        if (boards.length > 0) {
            return false;
        }

        const oldTicketsExist = await this.fileExists(oldTicketsPath);
        if (!oldTicketsExist) {
            // No old tickets, just create default board
            const defaultBoard: Board = {
                id: 'default',
                name: 'Default',
                created_at: new Date().toISOString(),
            };
            await this.createBoard(defaultBoard);
            return true;
        }

        // Create the default board directory
        const newTicketsPath = this.getBoardTicketsPath('default');
        await this.ensureDir(newTicketsPath);

        // Move all status directories from old location to new
        try {
            const entries = await fs.readdir(oldTicketsPath, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.isDirectory()) {
                    const oldStatusPath = join(oldTicketsPath, entry.name);
                    const newStatusPath = join(newTicketsPath, entry.name);
                    await this.ensureDir(newStatusPath);

                    // Move all ticket files
                    const files = await fs.readdir(oldStatusPath);
                    for (const file of files) {
                        if (file.endsWith('.json')) {
                            await fs.rename(
                                join(oldStatusPath, file),
                                join(newStatusPath, file)
                            );
                        }
                    }

                    // Remove old empty status directory
                    try {
                        await fs.rmdir(oldStatusPath);
                    } catch { /* may not be empty */ }
                }
            }

            // Remove old tickets directory if empty
            try {
                await fs.rmdir(oldTicketsPath);
            } catch { /* may not be empty */ }
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
                console.error('Migration error:', error);
            }
        }

        // Write board.json for the default board
        const defaultBoard: Board = {
            id: 'default',
            name: 'Default',
            created_at: new Date().toISOString(),
        };
        await this.writeBoardMetadata(defaultBoard);

        return true;
    }

    private async ensureDir(path: string): Promise<void> {
        try {
            await fs.mkdir(path, { recursive: true });
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
                throw error;
            }
        }
    }

    async fileExists(path: string): Promise<boolean> {
        try {
            await fs.access(path);
            return true;
        } catch {
            return false;
        }
    }

    // ============================================================================
    // JSON Helpers
    // ============================================================================

    private parseJSON<T>(content: string, schema: { parse: (data: unknown) => T }): T {
        const data = JSON.parse(content);
        return schema.parse(data);
    }

    private serializeJSON(data: unknown): string {
        return JSON.stringify(data, null, 2);
    }

    // ============================================================================
    // Ticket Operations
    // ============================================================================

    async readTicket(ticketId: string, status?: Status, boardId?: string): Promise<Ticket> {
        let filePath: string;

        if (status) {
            filePath = join(this.getStatusPath(status, boardId), `${ticketId}.json`);
        } else {
            filePath = await this.findTicketPath(ticketId, boardId);
        }

        const content = await fs.readFile(filePath, 'utf-8');
        return this.parseJSON(content, TicketSchema);
    }

    async writeTicket(ticketId: string, ticket: Ticket, status: Status, boardId?: string): Promise<void> {
        const statusPath = this.getStatusPath(status, boardId);
        await this.ensureDir(statusPath);
        const filePath = join(statusPath, `${ticketId}.json`);
        await fs.writeFile(filePath, this.serializeJSON(ticket), 'utf-8');
    }

    async moveTicket(ticketId: string, fromStatus: Status, toStatus: Status, position?: number, boardId?: string): Promise<void> {
        const fromPath = join(this.getStatusPath(fromStatus, boardId), `${ticketId}.json`);
        const toPath = join(this.getStatusPath(toStatus, boardId), `${ticketId}.json`);
        await this.ensureDir(this.getStatusPath(toStatus, boardId));

        // If position is provided, update the ticket metadata before moving
        if (position !== undefined) {
            const content = await fs.readFile(fromPath, 'utf-8');
            const ticket = this.parseJSON(content, TicketSchema);
            ticket.metadata.position = position;
            ticket.metadata.updated_at = new Date().toISOString();
            await fs.writeFile(fromPath, this.serializeJSON(ticket), 'utf-8');
        }

        await fs.rename(fromPath, toPath);
    }

    async deleteTicket(ticketId: string, status: Status, boardId?: string): Promise<void> {
        const filePath = join(this.getStatusPath(status, boardId), `${ticketId}.json`);
        await fs.unlink(filePath);
    }

    async findTicketPath(ticketId: string, boardId?: string): Promise<string> {
        const statuses = await this.getStatuses(boardId);

        for (const statusConfig of statuses) {
            const filePath = join(this.getStatusPath(statusConfig.id, boardId), `${ticketId}.json`);
            if (await this.fileExists(filePath)) {
                return filePath;
            }
        }

        throw new Error(`Ticket ${ticketId} not found in any status directory`);
    }

    async findTicketStatus(ticketId: string, boardId?: string): Promise<Status> {
        const statuses = await this.getStatuses(boardId);

        for (const statusConfig of statuses) {
            const filePath = join(this.getStatusPath(statusConfig.id, boardId), `${ticketId}.json`);
            if (await this.fileExists(filePath)) {
                return statusConfig.id;
            }
        }

        throw new Error(`Ticket ${ticketId} not found`);
    }

    async listTickets(status: Status, boardId?: string): Promise<string[]> {
        const statusPath = this.getStatusPath(status, boardId);

        try {
            const files = await fs.readdir(statusPath);
            return files
                .filter((file) => file.endsWith('.json'))
                .map((file) => basename(file, '.json'));
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                return [];
            }
            throw error;
        }
    }

    async listAllTickets(boardId?: string): Promise<Array<{ id: string; status: Status }>> {
        const statuses = await this.getStatuses(boardId);
        const tickets: Array<{ id: string; status: Status }> = [];

        for (const statusConfig of statuses) {
            const ids = await this.listTickets(statusConfig.id, boardId);
            tickets.push(...ids.map((id) => ({ id, status: statusConfig.id })));
        }

        return tickets;
    }

    // ============================================================================
    // Archive Operations
    // ============================================================================

    /**
     * Get the base archive path for a board
     * Returns: gitboard/boards/{boardId}/archive
     */
    getArchivePath(boardId: string): string {
        return join(this.gitboardPath, 'boards', boardId, 'archive');
    }

    /**
     * Get the archive folder path for a specific year-month
     * Returns: gitboard/boards/{boardId}/archive/{YYYY-MM}
     */
    getArchiveMonthPath(boardId: string, yearMonth: string): string {
        return join(this.getArchivePath(boardId), yearMonth);
    }

    /**
     * Get the full path for an archived ticket
     * Returns: gitboard/boards/{boardId}/archive/{YYYY-MM}/{ticketId}.json
     */
    getArchivedTicketPath(boardId: string, yearMonth: string, ticketId: string): string {
        return join(this.getArchiveMonthPath(boardId, yearMonth), `${ticketId}.json`);
    }

    /**
     * Get the relative git path for an archived ticket
     */
    getArchivedTicketRelativePath(boardId: string, yearMonth: string, ticketId: string): string {
        return `${this.gitRelativePrefix}/boards/${boardId}/archive/${yearMonth}/${ticketId}.json`;
    }

    /**
     * Get the current year-month string in YYYY-MM format
     */
    getCurrentYearMonth(): string {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        return `${year}-${month}`;
    }

    /**
     * Write a ticket to the archive
     */
    async writeArchivedTicket(boardId: string, yearMonth: string, ticketId: string, ticket: Ticket): Promise<void> {
        const archiveMonthPath = this.getArchiveMonthPath(boardId, yearMonth);
        await this.ensureDir(archiveMonthPath);
        const filePath = this.getArchivedTicketPath(boardId, yearMonth, ticketId);
        await fs.writeFile(filePath, this.serializeJSON(ticket), 'utf-8');
    }

    /**
     * Read an archived ticket from a specific year-month folder
     */
    async readArchivedTicket(boardId: string, yearMonth: string, ticketId: string): Promise<Ticket> {
        const filePath = this.getArchivedTicketPath(boardId, yearMonth, ticketId);
        const content = await fs.readFile(filePath, 'utf-8');
        return this.parseJSON(content, TicketSchema);
    }

    /**
     * Delete an archived ticket
     */
    async deleteArchivedTicket(boardId: string, yearMonth: string, ticketId: string): Promise<void> {
        const filePath = this.getArchivedTicketPath(boardId, yearMonth, ticketId);
        await fs.unlink(filePath);
    }

    /**
     * List all YYYY-MM folders in the archive
     */
    async listArchiveMonths(boardId: string): Promise<string[]> {
        const archivePath = this.getArchivePath(boardId);
        try {
            const entries = await fs.readdir(archivePath, { withFileTypes: true });
            return entries
                .filter((entry) => entry.isDirectory() && /^\d{4}-\d{2}$/.test(entry.name))
                .map((entry) => entry.name)
                .sort()
                .reverse(); // Most recent first
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                return [];
            }
            throw error;
        }
    }

    /**
     * List all ticket IDs in a specific archive month
     */
    async listArchivedTicketsInMonth(boardId: string, yearMonth: string): Promise<string[]> {
        const monthPath = this.getArchiveMonthPath(boardId, yearMonth);
        try {
            const files = await fs.readdir(monthPath);
            return files
                .filter((file) => file.endsWith('.json'))
                .map((file) => basename(file, '.json'));
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                return [];
            }
            throw error;
        }
    }

    /**
     * List all archived tickets across all months for a board
     * Returns: Array of { id, yearMonth } objects sorted by archive date (newest first)
     */
    async listAllArchivedTickets(boardId: string): Promise<Array<{ id: string; yearMonth: string }>> {
        const months = await this.listArchiveMonths(boardId);
        const results: Array<{ id: string; yearMonth: string }> = [];

        for (const yearMonth of months) {
            const ticketIds = await this.listArchivedTicketsInMonth(boardId, yearMonth);
            results.push(...ticketIds.map((id) => ({ id, yearMonth })));
        }

        return results;
    }

    /**
     * Find an archived ticket by ID across all year-month folders
     * Returns the yearMonth folder where the ticket was found, or null if not found
     */
    async findArchivedTicket(boardId: string, ticketId: string): Promise<{ yearMonth: string; ticket: Ticket } | null> {
        const months = await this.listArchiveMonths(boardId);

        for (const yearMonth of months) {
            const filePath = this.getArchivedTicketPath(boardId, yearMonth, ticketId);
            if (await this.fileExists(filePath)) {
                const ticket = await this.readArchivedTicket(boardId, yearMonth, ticketId);
                return { yearMonth, ticket };
            }
        }

        return null;
    }

    /**
     * Get the count of archived tickets for a board
     */
    async getArchivedTicketCount(boardId: string): Promise<number> {
        const tickets = await this.listAllArchivedTickets(boardId);
        return tickets.length;
    }

    // ============================================================================
    // Status Operations
    // ============================================================================

    /**
     * Get statuses for a board. Checks board-specific statuses first,
     * then falls back to global config, then defaults.
     */
    async getStatuses(boardId?: string): Promise<StatusConfig[]> {
        // Check board-specific statuses first
        if (boardId) {
            try {
                const board = await this.getBoardById(boardId);
                if (board?.statuses && board.statuses.length > 0) {
                    return [...board.statuses].sort((a, b) => a.order - b.order);
                }
            } catch {
                // Board might not exist, fall through
            }
        }

        // Fall back to global config statuses
        try {
            const config = await this.readConfig();
            if (config.statuses && config.statuses.length > 0) {
                return [...config.statuses].sort((a, b) => a.order - b.order);
            }
        } catch {
            // Config might not exist yet
        }
        return DEFAULT_STATUSES;
    }

    /**
     * Create a new status directory
     */
    async createStatusDirectory(statusId: string, boardId?: string): Promise<void> {
        const statusPath = this.getStatusPath(statusId, boardId);
        await this.ensureDir(statusPath);
    }

    /**
     * Delete a status directory (must be empty or tickets moved first)
     */
    async deleteStatusDirectory(statusId: string, boardId?: string): Promise<void> {
        const statusPath = this.getStatusPath(statusId, boardId);
        try {
            await fs.rmdir(statusPath);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
                throw error;
            }
        }
    }

    /**
     * Move all tickets from one status to another
     */
    async moveAllTicketsFromStatus(fromStatus: Status, toStatus: Status, boardId?: string): Promise<string[]> {
        const ticketIds = await this.listTickets(fromStatus, boardId);
        for (const id of ticketIds) {
            await this.moveTicket(id, fromStatus, toStatus, undefined, boardId);
        }
        return ticketIds;
    }

    /**
     * List all status directories that exist on the filesystem
     */
    async listStatusDirectories(boardId?: string): Promise<string[]> {
        const ticketsPath = boardId
            ? this.getBoardTicketsPath(boardId)
            : join(this.gitboardPath, 'tickets');
        try {
            const entries = await fs.readdir(ticketsPath, { withFileTypes: true });
            return entries
                .filter((entry) => entry.isDirectory())
                .map((entry) => entry.name);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                return [];
            }
            throw error;
        }
    }

    // ============================================================================
    // Config Operations
    // ============================================================================

    async readConfig(): Promise<Config> {
        const filePath = join(this.gitboardPath, 'config.json');
        const content = await fs.readFile(filePath, 'utf-8');
        return this.parseJSON(content, ConfigSchema);
    }

    async writeConfig(config: Config): Promise<void> {
        const filePath = join(this.gitboardPath, 'config.json');
        await fs.writeFile(filePath, this.serializeJSON(config), 'utf-8');
    }

    // ============================================================================
    // Team Operations
    // ============================================================================

    async readTeam(): Promise<Team> {
        const filePath = join(this.gitboardPath, 'team.json');
        const content = await fs.readFile(filePath, 'utf-8');
        return this.parseJSON(content, TeamSchema);
    }

    async writeTeam(team: Team): Promise<void> {
        const filePath = join(this.gitboardPath, 'team.json');
        await fs.writeFile(filePath, this.serializeJSON(team), 'utf-8');
    }

    // ============================================================================
    // Metadata Operations
    // ============================================================================

    async readNextIDs(): Promise<NextIDs> {
        const filePath = join(this.gitboardPath, '.metadata', 'next-ids.json');
        const content = await fs.readFile(filePath, 'utf-8');
        return this.parseJSON(content, NextIDsSchema);
    }

    async writeNextIDs(nextIds: NextIDs): Promise<void> {
        const metadataPath = join(this.gitboardPath, '.metadata');
        await this.ensureDir(metadataPath);
        const filePath = join(metadataPath, 'next-ids.json');
        await fs.writeFile(filePath, this.serializeJSON(nextIds), 'utf-8');
    }

    // ============================================================================
    // Docs Operations
    // ============================================================================

    private get docsPath(): string {
        return join(this.gitboardPath, 'docs');
    }

    private getDocPagePath(folder: string, slug: string): string {
        if (folder) {
            return join(this.docsPath, folder, `${slug}.json`);
        }
        return join(this.docsPath, `${slug}.json`);
    }

    async readDocPage(folder: string, slug: string): Promise<DocPage> {
        const filePath = this.getDocPagePath(folder, slug);
        const content = await fs.readFile(filePath, 'utf-8');
        const page = this.parseJSON(content, DocPageSchema);
        return { ...page, folder };
    }

    async writeDocPage(docPage: DocPage): Promise<void> {
        const folderPath = docPage.folder
            ? join(this.docsPath, docPage.folder)
            : this.docsPath;
        await this.ensureDir(folderPath);
        const filePath = this.getDocPagePath(docPage.folder, docPage.slug);
        await fs.writeFile(filePath, this.serializeJSON(docPage), 'utf-8');
    }

    async deleteDocPage(folder: string, slug: string): Promise<void> {
        const filePath = this.getDocPagePath(folder, slug);
        await fs.unlink(filePath);
    }

    async listDocsFolders(): Promise<string[]> {
        try {
            const entries = await fs.readdir(this.docsPath, { withFileTypes: true });
            return entries
                .filter((entry) => entry.isDirectory())
                .map((entry) => entry.name)
                .sort();
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                return [];
            }
            throw error;
        }
    }

    async listDocsPages(): Promise<Array<{ folder: string; slug: string }>> {
        const results: Array<{ folder: string; slug: string }> = [];

        try {
            const rootEntries = await fs.readdir(this.docsPath, { withFileTypes: true });
            for (const entry of rootEntries) {
                if (entry.isFile() && entry.name.endsWith('.json')) {
                    results.push({ folder: '', slug: basename(entry.name, '.json') });
                }
            }

            const folders = await this.listDocsFolders();
            for (const folder of folders) {
                const folderPath = join(this.docsPath, folder);
                const files = await fs.readdir(folderPath);
                for (const file of files) {
                    if (file.endsWith('.json')) {
                        results.push({ folder, slug: basename(file, '.json') });
                    }
                }
            }

            return results;
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                return [];
            }
            throw error;
        }
    }

    // ============================================================================
    // Agent Operations
    // ============================================================================

    private get agentsPath(): string {
        return join(this.gitboardPath, 'agents');
    }

    async readAgent(agentId: string): Promise<Agent> {
        const filePath = join(this.agentsPath, `${agentId}.json`);
        const content = await fs.readFile(filePath, 'utf-8');
        return this.parseJSON(content, AgentSchema);
    }

    async writeAgent(agent: Agent): Promise<void> {
        await this.ensureDir(this.agentsPath);
        const filePath = join(this.agentsPath, `${agent.id}.json`);
        await fs.writeFile(filePath, this.serializeJSON(agent), 'utf-8');
    }

    async deleteAgent(agentId: string): Promise<void> {
        const filePath = join(this.agentsPath, `${agentId}.json`);
        await fs.unlink(filePath);
    }

    async listAgents(): Promise<string[]> {
        try {
            const files = await fs.readdir(this.agentsPath);
            return files
                .filter((file) => file.endsWith('.json'))
                .map((file) => basename(file, '.json'));
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                return [];
            }
            throw error;
        }
    }

    // ============================================================================
    // Skill Operations (AgentSkills.io Specification)
    // Skills are stored in .claude/skills/{skillId}/SKILL.md for Claude Code compatibility
    // ============================================================================

    private get skillsPath(): string {
        return join(this.repoPath, '.claude', 'skills');
    }

    /**
     * Get the directory path for a specific skill
     */
    private getSkillDirPath(skillId: string): string {
        return join(this.skillsPath, skillId);
    }

    /**
     * Get the SKILL.md file path for a specific skill (new format)
     */
    private getSkillFilePath(skillId: string): string {
        return join(this.getSkillDirPath(skillId), 'SKILL.md');
    }

    /**
     * Get the legacy flat file path for a skill (old format)
     */
    private getLegacySkillFilePath(skillId: string): string {
        return join(this.skillsPath, `${skillId}.md`);
    }

    /**
     * Migrate a skill from legacy flat file format to new directory format
     * @returns true if migration occurred, false if already in new format or not found
     */
    private async migrateSkill(skillId: string): Promise<boolean> {
        const legacyPath = this.getLegacySkillFilePath(skillId);
        const newDirPath = this.getSkillDirPath(skillId);
        const newFilePath = this.getSkillFilePath(skillId);

        // Check if legacy file exists
        if (!(await this.fileExists(legacyPath))) {
            return false;
        }

        // Check if already migrated (new format exists)
        if (await this.fileExists(newFilePath)) {
            // Both exist - just remove the legacy file
            await fs.unlink(legacyPath);
            return true;
        }

        // Perform migration: create directory and move content
        await this.ensureDir(newDirPath);
        const content = await fs.readFile(legacyPath, 'utf-8');
        await fs.writeFile(newFilePath, content, 'utf-8');
        await fs.unlink(legacyPath);

        return true;
    }

    /**
     * Migrate all legacy skill files to the new directory format
     */
    private async migrateAllLegacySkills(): Promise<string[]> {
        const migratedSkills: string[] = [];

        try {
            const entries = await fs.readdir(this.skillsPath, { withFileTypes: true });

            for (const entry of entries) {
                if (entry.isFile() && entry.name.endsWith('.md')) {
                    const skillId = basename(entry.name, '.md');
                    const migrated = await this.migrateSkill(skillId);
                    if (migrated) {
                        migratedSkills.push(skillId);
                    }
                }
            }
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
                throw error;
            }
        }

        return migratedSkills;
    }

    /**
     * Read a skill from its SKILL.md file
     * Automatically migrates legacy flat file format if detected
     */
    async readSkill(skillId: string): Promise<Skill> {
        // Try to migrate if legacy format exists
        await this.migrateSkill(skillId);

        const filePath = this.getSkillFilePath(skillId);
        const content = await fs.readFile(filePath, 'utf-8');
        return parseSkillMarkdown(content, skillId);
    }

    /**
     * Write a skill to a SKILL.md file within its own directory
     */
    async writeSkill(skill: Skill): Promise<void> {
        const skillDir = this.getSkillDirPath(skill.id);
        await this.ensureDir(skillDir);
        const filePath = this.getSkillFilePath(skill.id);
        const content = serializeSkillMarkdown(skill);
        await fs.writeFile(filePath, content, 'utf-8');
    }

    /**
     * Delete a skill and its entire directory
     */
    async deleteSkill(skillId: string): Promise<void> {
        const skillDir = this.getSkillDirPath(skillId);
        try {
            await fs.rm(skillDir, { recursive: true });
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
                throw error;
            }
        }

        // Also clean up any legacy flat file that might exist
        const legacyPath = this.getLegacySkillFilePath(skillId);
        try {
            await fs.unlink(legacyPath);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
                throw error;
            }
        }
    }

    /**
     * List all skill IDs
     * Scans for directories containing SKILL.md files and migrates any legacy flat files
     */
    async listSkills(): Promise<string[]> {
        // First, migrate any legacy files
        await this.migrateAllLegacySkills();

        try {
            const entries = await fs.readdir(this.skillsPath, { withFileTypes: true });
            const skillIds: string[] = [];

            for (const entry of entries) {
                if (entry.isDirectory()) {
                    // Check if SKILL.md exists in the directory
                    const skillFilePath = join(this.skillsPath, entry.name, 'SKILL.md');
                    if (await this.fileExists(skillFilePath)) {
                        skillIds.push(entry.name);
                    }
                }
            }

            return skillIds;
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                return [];
            }
            throw error;
        }
    }

    /**
     * Get the relative git path for a skill file
     */
    getSkillRelativePath(skillId: string): string {
        return `.claude/skills/${skillId}/SKILL.md`;
    }

    // ============================================================================
    // MCP Operations (Model Context Protocol)
    // MCPs are stored in gitboard/mcp/{id}/ directories as config.json files
    // ============================================================================

    private get mcpPath(): string {
        return join(this.gitboardPath, 'mcp');
    }

    /**
     * Read an MCP config from its config.json file
     */
    async readMCP(mcpId: string): Promise<MCPConfig> {
        const filePath = join(this.mcpPath, mcpId, 'config.json');
        const content = await fs.readFile(filePath, 'utf-8');
        return this.parseJSON(content, MCPConfigSchema);
    }

    /**
     * Write an MCP config to a config.json file
     */
    async writeMCP(mcp: MCPConfig): Promise<void> {
        const mcpDir = join(this.mcpPath, mcp.id);
        await this.ensureDir(mcpDir);
        const filePath = join(mcpDir, 'config.json');
        await fs.writeFile(filePath, this.serializeJSON(mcp), 'utf-8');
    }

    /**
     * Delete an MCP config and its directory
     */
    async deleteMCP(mcpId: string): Promise<void> {
        const mcpDir = join(this.mcpPath, mcpId);
        try {
            await fs.rm(mcpDir, { recursive: true });
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
                throw error;
            }
        }
    }

    /**
     * List all MCP IDs
     */
    async listMCPs(): Promise<string[]> {
        try {
            const entries = await fs.readdir(this.mcpPath, { withFileTypes: true });
            const mcpIds: string[] = [];

            for (const entry of entries) {
                if (entry.isDirectory()) {
                    // Check if config.json exists in the directory
                    const configPath = join(this.mcpPath, entry.name, 'config.json');
                    if (await this.fileExists(configPath)) {
                        mcpIds.push(entry.name);
                    }
                }
            }

            return mcpIds;
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                return [];
            }
            throw error;
        }
    }

    /**
     * Get the relative git path for an MCP config file
     */
    getMCPRelativePath(mcpId: string): string {
        return `${this.gitRelativePrefix}/mcp/${mcpId}/config.json`;
    }

    // ============================================================================
    // Initiative Operations
    // ============================================================================

    async readInitiative(initiativeId: string): Promise<Initiative> {
        const filePath = join(this.gitboardPath, 'initiatives', `${initiativeId}.json`);
        const content = await fs.readFile(filePath, 'utf-8');
        return this.parseJSON(content, InitiativeSchema);
    }

    async writeInitiative(initiative: Initiative): Promise<void> {
        const initiativesPath = join(this.gitboardPath, 'initiatives');
        await this.ensureDir(initiativesPath);
        const filePath = join(initiativesPath, `${initiative.id}.json`);
        await fs.writeFile(filePath, this.serializeJSON(initiative), 'utf-8');
    }

    async listInitiatives(): Promise<string[]> {
        const initiativesPath = join(this.gitboardPath, 'initiatives');
        try {
            const files = await fs.readdir(initiativesPath);
            return files
                .filter((file) => file.endsWith('.json'))
                .map((file) => basename(file, '.json'));
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                return [];
            }
            throw error;
        }
    }

    // ============================================================================
    // Artifact Operations
    // ============================================================================

    private get artifactsPath(): string {
        return join(this.gitboardPath, 'artifacts');
    }

    private getTicketArtifactsPath(ticketId: string): string {
        return join(this.artifactsPath, ticketId);
    }

    /**
     * Read all artifacts for a ticket
     */
    async readTicketArtifacts(ticketId: string): Promise<Artifact[]> {
        const ticketArtifactsPath = this.getTicketArtifactsPath(ticketId);
        try {
            const files = await fs.readdir(ticketArtifactsPath);
            const artifacts: Artifact[] = [];

            for (const file of files) {
                if (file.endsWith('.json')) {
                    const filePath = join(ticketArtifactsPath, file);
                    const content = await fs.readFile(filePath, 'utf-8');
                    const artifact = this.parseJSON(content, ArtifactSchema);
                    artifacts.push(artifact);
                }
            }

            // Sort by creation date, oldest first (chronological order for chat)
            return artifacts.sort((a, b) =>
                new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
            );
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                return [];
            }
            throw error;
        }
    }

    /**
     * Read a specific artifact
     */
    async readArtifact(ticketId: string, artifactId: string): Promise<Artifact> {
        const filePath = join(this.getTicketArtifactsPath(ticketId), `${artifactId}.json`);
        const content = await fs.readFile(filePath, 'utf-8');
        return this.parseJSON(content, ArtifactSchema);
    }

    /**
     * Write an artifact to the file system
     */
    async writeArtifact(artifact: Artifact): Promise<void> {
        const ticketArtifactsPath = this.getTicketArtifactsPath(artifact.ticketId);
        await this.ensureDir(ticketArtifactsPath);
        const filePath = join(ticketArtifactsPath, `${artifact.id}.json`);
        await fs.writeFile(filePath, this.serializeJSON(artifact), 'utf-8');
    }

    /**
     * Delete a specific artifact
     */
    async deleteArtifact(ticketId: string, artifactId: string): Promise<void> {
        const filePath = join(this.getTicketArtifactsPath(ticketId), `${artifactId}.json`);
        await fs.unlink(filePath);
    }

    /**
     * Delete all artifacts for a ticket (used when deleting a ticket)
     */
    async deleteTicketArtifacts(ticketId: string): Promise<void> {
        const ticketArtifactsPath = this.getTicketArtifactsPath(ticketId);
        try {
            await fs.rm(ticketArtifactsPath, { recursive: true });
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
                throw error;
            }
        }
    }

    /**
     * List artifact IDs for a ticket
     */
    async listArtifactIds(ticketId: string): Promise<string[]> {
        const ticketArtifactsPath = this.getTicketArtifactsPath(ticketId);
        try {
            const files = await fs.readdir(ticketArtifactsPath);
            return files
                .filter((file) => file.endsWith('.json'))
                .map((file) => basename(file, '.json'));
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                return [];
            }
            throw error;
        }
    }

    // ============================================================================
    // Docs Folder Operations
    // ============================================================================

    async createDocsFolder(folderName: string): Promise<void> {
        const folderPath = join(this.docsPath, folderName);
        await this.ensureDir(folderPath);
    }

    async renameDocsFolder(oldName: string, newName: string): Promise<void> {
        const oldPath = join(this.docsPath, oldName);
        const newPath = join(this.docsPath, newName);
        await fs.rename(oldPath, newPath);
    }

    async deleteDocsFolder(folderName: string): Promise<void> {
        const folderPath = join(this.docsPath, folderName);
        await fs.rmdir(folderPath);
    }

    async isDocsFolderEmpty(folderName: string): Promise<boolean> {
        const folderPath = join(this.docsPath, folderName);
        try {
            const files = await fs.readdir(folderPath);
            return files.length === 0;
        } catch {
            return true;
        }
    }

    async moveDocPage(oldFolder: string, newFolder: string, slug: string): Promise<void> {
        const oldPath = this.getDocPagePath(oldFolder, slug);
        const newFolderPath = newFolder ? join(this.docsPath, newFolder) : this.docsPath;
        await this.ensureDir(newFolderPath);
        const newPath = this.getDocPagePath(newFolder, slug);
        await fs.rename(oldPath, newPath);
    }

    // ============================================================================
    // Lock Operations
    // ============================================================================

    private get locksFilePath(): string {
        return join(this.gitboardPath, '.locks.json');
    }

    async readLocks(): Promise<LocksFile> {
        try {
            const content = await fs.readFile(this.locksFilePath, 'utf-8');
            return JSON.parse(content) as LocksFile;
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                return { locks: [] };
            }
            throw error;
        }
    }

    async writeLocks(locksFile: LocksFile): Promise<void> {
        const content = JSON.stringify(locksFile, null, 2);
        await fs.writeFile(this.locksFilePath, content, 'utf-8');
    }

    // ============================================================================
    // Directory Structure
    // ============================================================================

    async initializeStructure(): Promise<void> {
        await this.ensureDir(this.gitboardPath);
        await this.ensureDir(join(this.gitboardPath, '.metadata'));
        await this.ensureDir(join(this.gitboardPath, 'boards'));

        // Initialize default board if no boards exist
        const existingBoards = await this.getBoards();
        if (existingBoards.length === 0) {
            await this.migrateTicketsToDefaultBoard();
        }

        // Create status directories for all boards
        const allBoards = await this.getBoards();
        for (const board of allBoards) {
            const statuses = await this.getStatuses(board.id);
            for (const status of statuses) {
                await this.ensureDir(join(this.getBoardTicketsPath(board.id), status.id));
            }
        }

        await this.ensureDir(join(this.gitboardPath, 'initiatives'));
        await this.ensureDir(join(this.gitboardPath, 'docs'));
        await this.ensureDir(join(this.gitboardPath, 'agents'));
        await this.ensureDir(join(this.gitboardPath, 'mcp'));
        // Skills are stored in .claude/skills/ for Claude Code compatibility
        await this.ensureDir(join(this.repoPath, '.claude', 'skills'));
    }

    /**
     * Ensure all status directories exist for a board based on current config
     */
    async syncStatusDirectories(boardId?: string): Promise<void> {
        if (boardId) {
            const statuses = await this.getStatuses(boardId);
            for (const status of statuses) {
                await this.createStatusDirectory(status.id, boardId);
            }
        } else {
            // Sync for all boards
            const allBoards = await this.getBoards();
            for (const board of allBoards) {
                const statuses = await this.getStatuses(board.id);
                for (const status of statuses) {
                    await this.createStatusDirectory(status.id, board.id);
                }
            }
        }
    }

    async isInitialized(): Promise<boolean> {
        return this.fileExists(join(this.gitboardPath, 'config.json'));
    }

    /**
     * Get the relative git path for a ticket file within a board
     */
    getTicketRelativePath(ticketId: string, status: Status, boardId?: string): string {
        if (boardId) {
            return `${this.gitRelativePrefix}/boards/${boardId}/tickets/${status}/${ticketId}.json`;
        }
        return `${this.gitRelativePrefix}/tickets/${status}/${ticketId}.json`;
    }

    /**
     * Save statuses for a specific board
     */
    async saveBoardStatuses(boardId: string, statuses: StatusConfig[]): Promise<void> {
        const board = await this.getBoardById(boardId);
        if (!board) {
            throw new Error(`Board "${boardId}" not found`);
        }
        await this.writeBoardMetadata({ ...board, statuses });
    }

    // ============================================================================
    // Ticket Chat History Operations
    // ============================================================================

    private get ticketChatPath(): string {
        return join(this.gitboardPath, 'ticketchat');
    }

    private getTicketChatFilePath(ticketId: string): string {
        return join(this.ticketChatPath, `${ticketId}.json`);
    }

    /**
     * Read chat history for a ticket
     */
    async readTicketChatHistory(ticketId: string): Promise<TicketChatHistory | null> {
        const filePath = this.getTicketChatFilePath(ticketId);
        try {
            const content = await fs.readFile(filePath, 'utf-8');
            return this.parseJSON(content, TicketChatHistorySchema);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                return null;
            }
            throw error;
        }
    }

    /**
     * Write chat history for a ticket
     */
    async writeTicketChatHistory(chatHistory: TicketChatHistory): Promise<void> {
        await this.ensureDir(this.ticketChatPath);
        const filePath = this.getTicketChatFilePath(chatHistory.ticketId);
        await fs.writeFile(filePath, this.serializeJSON(chatHistory), 'utf-8');
    }

    /**
     * Delete chat history for a ticket
     */
    async deleteTicketChatHistory(ticketId: string): Promise<void> {
        const filePath = this.getTicketChatFilePath(ticketId);
        try {
            await fs.unlink(filePath);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
                throw error;
            }
        }
    }

    /**
     * Get the relative git path for a ticket chat history file
     */
    getTicketChatRelativePath(ticketId: string): string {
        return `${this.gitRelativePrefix}/ticketchat/${ticketId}.json`;
    }

    /**
     * Get the relative git path for team.json
     */
    getTeamRelativePath(): string {
        return `${this.gitRelativePrefix}/team.json`;
    }

    /**
     * Get the relative git path for config.json
     */
    getConfigRelativePath(): string {
        return `${this.gitRelativePrefix}/config.json`;
    }

    /**
     * Get the relative git path for a board's board.json
     */
    getBoardRelativePath(boardId: string): string {
        return `${this.gitRelativePrefix}/boards/${boardId}/board.json`;
    }

    /**
     * Get the relative git path for an agent file
     */
    getAgentRelativePath(agentId: string): string {
        return `${this.gitRelativePrefix}/agents/${agentId}.json`;
    }

    /**
     * Get the relative git path for a doc page
     */
    getDocRelativePath(docPath: string): string {
        return `${this.gitRelativePrefix}/docs/${docPath}`;
    }

    /**
     * Get the relative git path for the docs folder
     */
    getDocsRelativePath(): string {
        return `${this.gitRelativePrefix}/docs/`;
    }

    /**
     * Get the relative git path for an artifact
     */
    getArtifactRelativePath(ticketId: string, artifactId: string): string {
        return `${this.gitRelativePrefix}/artifacts/${ticketId}/${artifactId}.json`;
    }

    /**
     * Get the relative git path for next-ids.json
     */
    getNextIdsRelativePath(): string {
        return `${this.gitRelativePrefix}/.metadata/next-ids.json`;
    }

    /**
     * Get the relative git path for a board directory
     */
    getBoardDirRelativePath(boardId: string): string {
        return `${this.gitRelativePrefix}/boards/${boardId}/`;
    }
}
