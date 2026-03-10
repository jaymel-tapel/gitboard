'use server'

import { revalidatePath } from 'next/cache'
import { join, dirname, basename } from 'path'
import { existsSync } from 'fs'
import { execSync } from 'child_process'
import { FileSystemManager } from '@/lib/file-system'
import { GitManager } from '@/lib/git-manager'
import { FileManager, validateFile } from '@/lib/core/file-manager'
import { getStorageProvider } from '@/lib/storage'
import { DEFAULT_STATUSES, MAX_FILE_SIZE_BYTES, ALLOWED_EXTENSIONS } from '@/lib/schemas'
import type { Ticket, Status, DocPage, TeamMember, Agent, StatusConfig, Config, ParentType, FileAttachment, Board, Skill, MCPConfig, PipelineExecutionSettings } from '@/lib/schemas'

// Cache the repo path
let cachedRepoPath: string | null = null

/**
 * Detect if running in standalone mode (.gitboard/app/ structure)
 * Returns the project root path if standalone, null otherwise
 */
function detectStandaloneMode(): string | null {
    const cwd = process.cwd()
    const parentDir = dirname(cwd)
    const parentName = basename(parentDir)
    const cwdName = basename(cwd)

    // If current dir is 'app' and parent is '.gitboard', we're in standalone mode
    if (cwdName === 'app' && parentName === '.gitboard') {
        const projectRoot = dirname(parentDir)
        const dataPath = join(parentDir, 'data')
        if (existsSync(dataPath)) {
            return projectRoot
        }
    }

    return null
}

// Get repo path - monorepo friendly
// Priority: 1. Standalone mode, 2. GITBOARD_REPO_PATH env, 3. Git root, 4. Find gitboard/ folder
function getRepoPath(): string {
    if (cachedRepoPath) return cachedRepoPath

    // 0. Check for standalone mode (.gitboard/app/ structure)
    const standaloneRoot = detectStandaloneMode()
    if (standaloneRoot) {
        cachedRepoPath = standaloneRoot
        return cachedRepoPath
    }

    // 1. Check environment variable
    if (process.env.GITBOARD_REPO_PATH) {
        cachedRepoPath = process.env.GITBOARD_REPO_PATH
        return cachedRepoPath
    }

    // 2. Try to get git root (works in monorepos)
    try {
        const gitRoot = execSync('git rev-parse --show-toplevel', {
            encoding: 'utf-8',
            cwd: process.cwd(),
        }).trim()

        // Verify gitboard/ exists at git root
        if (existsSync(join(gitRoot, 'gitboard'))) {
            cachedRepoPath = gitRoot
            return cachedRepoPath
        }
    } catch {
        // Git command failed, continue to fallback
    }

    // 3. Traverse up looking for gitboard/ folder OR .gitboard/data/ folder
    let current = process.cwd()
    for (let i = 0; i < 10; i++) {
        if (existsSync(join(current, 'gitboard'))) {
            cachedRepoPath = current
            return cachedRepoPath
        }
        // Also check for .gitboard/data/ structure
        if (existsSync(join(current, '.gitboard', 'data'))) {
            cachedRepoPath = current
            return cachedRepoPath
        }
        const parent = dirname(current)
        if (parent === current) break
        current = parent
    }

    // 4. Fallback to parent directory
    cachedRepoPath = join(process.cwd(), '..')
    return cachedRepoPath
}

function getFs(): FileSystemManager {
    return new FileSystemManager(getRepoPath())
}

function getGit(): GitManager {
    return new GitManager(getRepoPath())
}

/**
 * Auto-commit changes to git
 * Works in both development mode (gitboard/) and standalone mode (.gitboard/data/)
 */
async function safeAutoCommit(message: string, paths: string[]): Promise<void> {
    try {
        const git = getGit()
        await git.autoCommit(message, paths)
    } catch (error) {
        // Log but don't fail if git commit fails (e.g., not a git repo)
        console.warn('[GitBoard] Git commit failed:', error)
    }
}

function getFileManager(): FileManager {
    const repoPath = getRepoPath()
    const fsManager = new FileSystemManager(repoPath)
    const storageProvider = getStorageProvider(repoPath)
    return new FileManager(fsManager, storageProvider, () => 'GitBoard User')
}

// ============================================================================
// Position Helper
// ============================================================================

/**
 * Calculate the next top position for a ticket in a column.
 * Returns minPosition - 1 to place the ticket at the top.
 * Returns 0 if the column is empty.
 */
function getNextTopPosition(tickets: Array<{ metadata: { position?: number } }>): number {
    if (tickets.length === 0) return 0;

    const positions = tickets
        .map(t => t.metadata.position ?? 999)
        .filter(p => typeof p === 'number');

    if (positions.length === 0) return 0;

    const minPosition = Math.min(...positions);
    return minPosition - 1;
}

// ============================================================================
// Board Actions
// ============================================================================

export async function getBoards(): Promise<Board[]> {
    const fs = getFs()
    // Ensure migration has happened
    await fs.migrateTicketsToDefaultBoard()
    return fs.getBoards()
}

export async function createBoard(name: string, ticketPrefix?: string): Promise<{ success: boolean; board?: Board; error?: string }> {
    const fs = getFs()
    const git = getGit()

    const id = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    if (!id) {
        return { success: false, error: 'Invalid board name' }
    }

    // Check for duplicate
    const boards = await fs.getBoards()
    if (boards.some(b => b.id === id)) {
        return { success: false, error: 'A board with this name already exists' }
    }

    // Calculate next order value
    const maxOrder = boards.reduce((max, b) => Math.max(max, b.order ?? 0), -1)

    const board: Board = {
        id,
        name,
        ticket_prefix: ticketPrefix || undefined,
        next_ticket_id: ticketPrefix ? 1 : undefined,
        created_at: new Date().toISOString(),
        pinned: true,
        order: maxOrder + 1,
    }

    await fs.createBoard(board)

    await safeAutoCommit(
        `[gitboard] Create board: ${name}`,
        [fs.getBoardRelativePath(id)]
    )

    revalidatePath('/board')
    return { success: true, board }
}

export async function updateBoard(boardId: string, updates: { name?: string; ticket_prefix?: string; pinned?: boolean; order?: number }): Promise<{ success: boolean; error?: string }> {
    const fs = getFs()
    const git = getGit()

    try {
        await fs.updateBoard(boardId, updates)
    } catch (error) {
        return { success: false, error: (error as Error).message }
    }

    await safeAutoCommit(
        `[gitboard] Update board: ${boardId}`,
        [fs.getBoardRelativePath(boardId)]
    )

    revalidatePath('/board')
    return { success: true }
}

export async function reorderBoards(boardIds: string[]): Promise<{ success: boolean; error?: string }> {
    const fs = getFs()
    const git = getGit()

    const changedFiles: string[] = []

    try {
        for (let i = 0; i < boardIds.length; i++) {
            const boardId = boardIds[i]
            await fs.updateBoard(boardId!, { order: i })
            changedFiles.push(fs.getBoardRelativePath(boardId!))
        }
    } catch (error) {
        return { success: false, error: (error as Error).message }
    }

    await safeAutoCommit(
        `[gitboard] Reorder boards`,
        changedFiles
    )

    revalidatePath('/board')
    return { success: true }
}

export async function deleteBoard(boardId: string): Promise<{ success: boolean; error?: string }> {
    const fs = getFs()
    const git = getGit()

    const boards = await fs.getBoards()
    if (boards.length <= 1) {
        return { success: false, error: 'Cannot delete the last board' }
    }

    try {
        await fs.deleteBoard(boardId)
    } catch (error) {
        return { success: false, error: (error as Error).message }
    }

    await safeAutoCommit(
        `[gitboard] Delete board: ${boardId}`,
        [fs.getBoardDirRelativePath(boardId)]
    )

    revalidatePath('/board')
    return { success: true }
}

// ============================================================================
// Status Actions
// ============================================================================

export async function getStatuses(boardId?: string): Promise<StatusConfig[]> {
    const fs = getFs()
    return fs.getStatuses(boardId)
}

export async function createStatus(name: string, color: StatusConfig['color'] = 'gray', boardId?: string): Promise<{ success: boolean; status?: StatusConfig; error?: string }> {
    const fs = getFs()
    const git = getGit()

    // Generate ID from name
    const id = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    if (!id) {
        return { success: false, error: 'Invalid status name' }
    }

    const statuses = await fs.getStatuses(boardId)

    // Check for duplicate
    if (statuses.some(s => s.id === id)) {
        return { success: false, error: 'Status with this ID already exists' }
    }

    // Add new status at the end
    const newStatus: StatusConfig = {
        id,
        name,
        order: statuses.length,
        color,
        autoExecute: false,
    }
    const updatedStatuses = [...statuses, newStatus]

    // Save statuses to the appropriate location
    if (boardId) {
        await fs.saveBoardStatuses(boardId, updatedStatuses)
    } else {
        const config = await fs.readConfig()
        const updatedConfig: Config = { ...config, statuses: updatedStatuses }
        await fs.writeConfig(updatedConfig)
    }

    // Create directory
    await fs.createStatusDirectory(id, boardId)

    await safeAutoCommit(
        `[gitboard] Create status: ${name}`,
        [boardId ? fs.getBoardRelativePath(boardId) : fs.getConfigRelativePath()]
    )

    revalidatePath('/board')
    return { success: true, status: newStatus }
}

export async function updateStatus(id: string, updates: { name?: string; color?: StatusConfig['color']; assignedAgent?: string; autoExecute?: boolean; pipelineSettings?: Partial<PipelineExecutionSettings> }, boardId?: string): Promise<{ success: boolean; error?: string }> {
    const fs = getFs()
    const git = getGit()

    const statuses = await fs.getStatuses(boardId)

    const statusIndex = statuses.findIndex(s => s.id === id)
    if (statusIndex === -1) {
        return { success: false, error: 'Status not found' }
    }

    // Update the status
    const existingStatus = statuses[statusIndex]!;
    statuses[statusIndex] = {
        ...existingStatus,
        ...updates,
        pipelineSettings: updates.pipelineSettings
            ? { ...existingStatus.pipelineSettings, ...updates.pipelineSettings }
            : existingStatus.pipelineSettings
    } as typeof existingStatus;

    if (boardId) {
        await fs.saveBoardStatuses(boardId, statuses)
    } else {
        const config = await fs.readConfig()
        const updatedConfig: Config = { ...config, statuses }
        await fs.writeConfig(updatedConfig)
    }

    await safeAutoCommit(
        `[gitboard] Update status: ${statuses[statusIndex]!.name}`,
        [boardId ? fs.getBoardRelativePath(boardId) : fs.getConfigRelativePath()]
    )

    revalidatePath('/board')
    return { success: true }
}

export async function deleteStatus(id: string, boardId?: string): Promise<{ success: boolean; movedTickets?: string[]; error?: string }> {
    const fs = getFs()
    const git = getGit()

    const statuses = await fs.getStatuses(boardId)

    if (statuses.length <= 1) {
        return { success: false, error: 'Cannot delete the last status' }
    }

    const statusIndex = statuses.findIndex(s => s.id === id)
    if (statusIndex === -1) {
        return { success: false, error: 'Status not found' }
    }

    // Get the first status (to move tickets to)
    const firstStatus = statuses.find(s => s.id !== id)!

    // Move all tickets from deleted status to first status
    const movedTickets = await fs.moveAllTicketsFromStatus(id, firstStatus.id, boardId)

    // Delete the status directory
    await fs.deleteStatusDirectory(id, boardId)

    // Remove from config and reorder
    const newStatuses = statuses
        .filter(s => s.id !== id)
        .map((s, index) => ({ ...s, order: index }))

    if (boardId) {
        await fs.saveBoardStatuses(boardId, newStatuses)
    } else {
        const config = await fs.readConfig()
        const updatedConfig: Config = { ...config, statuses: newStatuses }
        await fs.writeConfig(updatedConfig)
    }

    // Build commit paths
    const commitPaths = [boardId ? fs.getBoardRelativePath(boardId) : fs.getConfigRelativePath()]
    for (const ticketId of movedTickets) {
        commitPaths.push(fs.getTicketRelativePath(ticketId, firstStatus.id, boardId))
    }

    await safeAutoCommit(
        `[gitboard] Delete status: ${statuses[statusIndex]!.name}${movedTickets.length > 0 ? ` (moved ${movedTickets.length} tickets to ${firstStatus.name})` : ''}`,
        commitPaths
    )

    revalidatePath('/board')
    return { success: true, movedTickets }
}

export async function reorderStatuses(statusIds: string[], boardId?: string): Promise<{ success: boolean; error?: string }> {
    const fs = getFs()
    const git = getGit()

    const statuses = await fs.getStatuses(boardId)

    // Verify all IDs exist
    const existingIds = new Set(statuses.map(s => s.id))
    for (const id of statusIds) {
        if (!existingIds.has(id)) {
            return { success: false, error: `Unknown status ID: ${id}` }
        }
    }

    // Reorder statuses based on the new order
    const reordered = statusIds.map((id, index) => {
        const status = statuses.find(s => s.id === id)!
        return { ...status, order: index }
    })

    if (boardId) {
        await fs.saveBoardStatuses(boardId, reordered)
    } else {
        const config = await fs.readConfig()
        const updatedConfig: Config = { ...config, statuses: reordered }
        await fs.writeConfig(updatedConfig)
    }

    await safeAutoCommit(
        `[gitboard] Reorder statuses`,
        [boardId ? fs.getBoardRelativePath(boardId) : fs.getConfigRelativePath()]
    )

    revalidatePath('/board')
    return { success: true }
}

// ============================================================================
// Ticket Actions
// ============================================================================

export async function getTickets(boardId?: string) {
    const fs = getFs()
    // Ensure boards are initialized
    await fs.migrateTicketsToDefaultBoard()

    // Resolve board ID
    const resolvedBoardId = boardId || 'default'

    const statuses = await fs.getStatuses(resolvedBoardId)
    const result: Record<string, Ticket[]> = {}

    // Initialize empty arrays for each status
    for (const status of statuses) {
        result[status.id] = []
    }

    // Load tickets for each status
    for (const status of statuses) {
        const ids = await fs.listTickets(status.id, resolvedBoardId)
        for (const id of ids) {
            try {
                const ticket = await fs.readTicket(id, status.id, resolvedBoardId)
                result[status.id]!.push(ticket)
            } catch (e) {
                console.error(`Failed to read ticket ${id}:`, e)
            }
        }
    }

    return result
}

export async function getTicket(id: string, boardId?: string) {
    const fs = getFs()
    const resolvedBoardId = boardId || 'default'
    return fs.readTicket(id, undefined, resolvedBoardId)
}

export async function createTicket(input: FormData | {
    title: string
    description: string
    priority?: 'low' | 'medium' | 'high' | 'critical'
}, boardId?: string) {
    const fs = getFs()
    const git = getGit()

    // Resolve board ID
    const resolvedBoardId = boardId || 'default'

    // Handle both FormData and plain object
    let title: string
    let description: string
    let priority: 'low' | 'medium' | 'high' | 'critical' = 'medium'
    let acceptanceCriteria: Array<{ text: string; completed: boolean }> = []
    let implementationSteps: Array<{ text: string; completed: boolean }> = []
    let formBoardId: string | undefined

    if (input instanceof FormData) {
        title = input.get('title') as string
        description = input.get('description') as string || ''
        priority = (input.get('priority') as any) || 'medium'
        formBoardId = input.get('boardId') as string || undefined

        // Parse JSON arrays for acceptance criteria and implementation steps
        const acJson = input.get('acceptance_criteria') as string
        const isJson = input.get('implementation_steps') as string

        if (acJson) {
            try {
                acceptanceCriteria = JSON.parse(acJson)
            } catch { }
        }
        if (isJson) {
            try {
                implementationSteps = JSON.parse(isJson)
            } catch { }
        }
    } else {
        title = input.title
        description = input.description
        priority = input.priority || 'medium'
    }

    // Use form boardId if available, otherwise resolved
    const effectiveBoardId = formBoardId || resolvedBoardId

    // Determine prefix and next ID from board or global config
    const board = await fs.getBoardById(effectiveBoardId)
    let prefix: string
    let nextId: number

    if (board?.ticket_prefix) {
        // Board-specific prefix and counter
        prefix = board.ticket_prefix
        nextId = board.next_ticket_id || 1
    } else {
        // Fall back to global config
        const nextIds = await fs.readNextIDs()
        prefix = nextIds.ticket_prefix || 'PM'
        nextId = nextIds.next_ticket_id
    }

    const id = `${prefix}-${String(nextId).padStart(4, '0')}`

    // Get existing tickets in first status to calculate position
    const statuses = await fs.getStatuses(effectiveBoardId)
    const firstStatus = statuses[0]?.id || 'todo'
    const existingIds = await fs.listTickets(firstStatus, effectiveBoardId)
    const existingTickets: Array<{ metadata: { position?: number } }> = []
    for (const ticketId of existingIds) {
        try {
            const ticket = await fs.readTicket(ticketId, firstStatus, effectiveBoardId)
            existingTickets.push(ticket)
        } catch { /* ignore read errors */ }
    }
    const position = getNextTopPosition(existingTickets)

    const now = new Date().toISOString()
    const ticket: Ticket = {
        id,
        title,
        description,
        priority,
        tags: [],
        acceptance_criteria: acceptanceCriteria,
        implementation_steps: implementationSteps,
        metadata: {
            created_at: now,
            updated_at: now,
            created_by: 'GitBoard User',
            updated_by: 'GitBoard User',
            position,
        },
        links: {
            related_tickets: [],
            blocks: [],
            blocked_by: [],
            pull_requests: [],
            github_issues: [],
        },
        custom_fields: {},
    }

    await fs.writeTicket(id, ticket, firstStatus, effectiveBoardId)

    // Update next ID
    if (board?.ticket_prefix) {
        // Update board-level counter
        await fs.updateBoard(effectiveBoardId, { next_ticket_id: nextId + 1 })
    } else {
        // Update global counter
        const nextIds = await fs.readNextIDs()
        nextIds.next_ticket_id++
        await fs.writeNextIDs(nextIds)
    }

    // Auto-commit
    const ticketPath = fs.getTicketRelativePath(id, firstStatus, effectiveBoardId)
    const commitPaths = [ticketPath]
    if (board?.ticket_prefix) {
        commitPaths.push(fs.getBoardRelativePath(effectiveBoardId))
    } else {
        commitPaths.push(fs.getNextIdsRelativePath())
    }

    await safeAutoCommit(
        `[gitboard] Create ${id}: ${title}`,
        commitPaths
    )

    revalidatePath('/')
    return { success: true, ticket }
}

export async function updateTicket(id: string, data: Partial<Ticket>, boardId?: string) {
    const fs = getFs()
    const git = getGit()

    const resolvedBoardId = boardId || 'default'

    const status = await fs.findTicketStatus(id, resolvedBoardId)
    const ticket = await fs.readTicket(id, status, resolvedBoardId)

    const updated: Ticket = {
        ...ticket,
        ...data,
        metadata: {
            ...ticket.metadata,
            updated_at: new Date().toISOString(),
            updated_by: 'GitBoard User',
        },
    }

    await fs.writeTicket(id, updated, status, resolvedBoardId)

    await safeAutoCommit(
        `[gitboard] Update ${id}: ${updated.title}`,
        [fs.getTicketRelativePath(id, status, resolvedBoardId)]
    )

    revalidatePath('/')
    return { success: true, ticket: updated }
}

export async function moveTicket(id: string, toStatus: Status, targetIndex?: number, boardId?: string) {
    const fs = getFs()
    const git = getGit()

    const resolvedBoardId = boardId || 'default'

    const fromStatus = await fs.findTicketStatus(id, resolvedBoardId)
    if (fromStatus === toStatus) return { success: true }

    // Get existing tickets in destination column to calculate position
    const existingIds = await fs.listTickets(toStatus, resolvedBoardId)
    const existingTickets: Array<{ id: string; metadata: { position?: number } }> = []
    for (const ticketId of existingIds) {
        try {
            const ticket = await fs.readTicket(ticketId, toStatus, resolvedBoardId)
            existingTickets.push({ id: ticketId, metadata: ticket.metadata })
        } catch { /* ignore read errors */ }
    }

    if (targetIndex !== undefined) {
        // Place at specific index: move first, then reorder the destination column
        const position = getNextTopPosition(existingTickets)
        await fs.moveTicket(id, fromStatus, toStatus, position, resolvedBoardId)

        // Now reorder destination column to place ticket at the right index
        const allIds = await fs.listTickets(toStatus, resolvedBoardId)
        const allTickets: Array<{ id: string; metadata: { position?: number } }> = []
        for (const ticketId of allIds) {
            try {
                const ticket = await fs.readTicket(ticketId, toStatus, resolvedBoardId)
                allTickets.push({ id: ticketId, metadata: ticket.metadata })
            } catch { /* ignore read errors */ }
        }
        allTickets.sort((a, b) => (a.metadata.position ?? 999) - (b.metadata.position ?? 999))

        // Remove the moved ticket and re-insert at targetIndex
        const movedIdx = allTickets.findIndex(t => t.id === id)
        if (movedIdx !== -1) {
            const [moved] = allTickets.splice(movedIdx, 1)
            allTickets.splice(targetIndex, 0, moved!)

            // Re-number positions
            for (let i = 0; i < allTickets.length; i++) {
                const ticket = await fs.readTicket(allTickets[i]!.id, toStatus, resolvedBoardId)
                ticket.metadata.position = i
                ticket.metadata.updated_at = new Date().toISOString()
                await fs.writeTicket(allTickets[i]!.id, ticket, toStatus, resolvedBoardId)
            }
        }
    } else {
        // Default: place at top
        const position = getNextTopPosition(existingTickets)
        await fs.moveTicket(id, fromStatus, toStatus, position, resolvedBoardId)
    }

    await safeAutoCommit(
        `[gitboard] Move ${id} to ${toStatus}`,
        [
            fs.getTicketRelativePath(id, fromStatus, resolvedBoardId),
            fs.getTicketRelativePath(id, toStatus, resolvedBoardId),
        ]
    )

    revalidatePath('/')
    return { success: true }
}

export async function reorderTicketInColumn(ticketId: string, status: Status, newIndex: number, boardId?: string) {
    const fs = getFs()

    const resolvedBoardId = boardId || 'default'

    // Get all tickets in this column
    const ticketIds = await fs.listTickets(status, resolvedBoardId)
    const tickets: Array<{ id: string; metadata: { position?: number } }> = []
    for (const id of ticketIds) {
        try {
            const ticket = await fs.readTicket(id, status, resolvedBoardId)
            tickets.push({ id, metadata: ticket.metadata })
        } catch { /* ignore read errors */ }
    }

    // Sort by current position
    tickets.sort((a, b) => (a.metadata.position ?? 999) - (b.metadata.position ?? 999))

    // Find and remove the moved ticket
    const currentIndex = tickets.findIndex(t => t.id === ticketId)
    if (currentIndex === -1) return { success: false }
    if (currentIndex === newIndex) return { success: true }

    const [moved] = tickets.splice(currentIndex, 1)
    // Insert at new position
    tickets.splice(newIndex, 0, moved!)

    // Re-number positions sequentially
    for (let i = 0; i < tickets.length; i++) {
        const ticket = await fs.readTicket(tickets[i]!.id, status, resolvedBoardId)
        ticket.metadata.position = i
        ticket.metadata.updated_at = new Date().toISOString()
        await fs.writeTicket(tickets[i]!.id, ticket, status, resolvedBoardId)
    }

    revalidatePath('/')
    return { success: true }
}

export async function deleteTicket(id: string, boardId?: string) {
    const fs = getFs()
    const git = getGit()

    const resolvedBoardId = boardId || 'default'

    const status = await fs.findTicketStatus(id, resolvedBoardId)
    await fs.deleteTicket(id, status, resolvedBoardId)

    // Also delete associated artifacts and chat history
    await fs.deleteTicketArtifacts(id)
    await fs.deleteTicketChatHistory(id)

    await safeAutoCommit(
        `[gitboard] Delete ${id}`,
        [fs.getTicketRelativePath(id, status, resolvedBoardId)]
    )

    revalidatePath('/')
    return { success: true }
}

// ============================================================================
// Archive Actions
// ============================================================================

export async function archiveTicket(id: string, boardId?: string): Promise<{ success: boolean; error?: string }> {
    const fs = getFs()
    const git = getGit()

    const resolvedBoardId = boardId || 'default'

    try {
        // Find the ticket's current status
        const currentStatus = await fs.findTicketStatus(id, resolvedBoardId)

        // Read the ticket
        const ticket = await fs.readTicket(id, currentStatus, resolvedBoardId)

        // Get current year-month for archive folder
        const yearMonth = fs.getCurrentYearMonth()

        // Update ticket metadata with archive info
        const now = new Date().toISOString()
        const archivedTicket = {
            ...ticket,
            metadata: {
                ...ticket.metadata,
                archived_at: now,
                original_status: currentStatus,
                updated_at: now,
                updated_by: 'GitBoard User',
            },
        }

        // Write to archive location
        await fs.writeArchivedTicket(resolvedBoardId, yearMonth, id, archivedTicket)

        // Delete from original status location
        await fs.deleteTicket(id, currentStatus, resolvedBoardId)

        // Git auto-commit
        await safeAutoCommit(
            `[gitboard] Archive ${id} from ${currentStatus}`,
            [
                fs.getTicketRelativePath(id, currentStatus, resolvedBoardId),
                fs.getArchivedTicketRelativePath(resolvedBoardId, yearMonth, id),
            ]
        )

        revalidatePath('/')
        return { success: true }
    } catch (error) {
        console.error('Failed to archive ticket:', error)
        return { success: false, error: (error as Error).message }
    }
}

export async function restoreTicket(
    id: string,
    targetStatus: string,
    boardId?: string
): Promise<{ success: boolean; error?: string }> {
    const fs = getFs()
    const git = getGit()

    const resolvedBoardId = boardId || 'default'

    try {
        // Validate target status exists
        const statuses = await fs.getStatuses(resolvedBoardId)
        if (!statuses.some(s => s.id === targetStatus)) {
            return { success: false, error: `Invalid target status: ${targetStatus}` }
        }

        // Find the archived ticket
        const found = await fs.findArchivedTicket(resolvedBoardId, id)
        if (!found) {
            return { success: false, error: `Archived ticket not found: ${id}` }
        }

        const { yearMonth, ticket } = found

        // Get existing tickets in target column to calculate position
        const existingIds = await fs.listTickets(targetStatus, resolvedBoardId)
        const existingTickets: Array<{ metadata: { position?: number } }> = []
        for (const ticketId of existingIds) {
            try {
                const t = await fs.readTicket(ticketId, targetStatus, resolvedBoardId)
                existingTickets.push(t)
            } catch { /* ignore read errors */ }
        }
        const position = getNextTopPosition(existingTickets)

        // Remove archive metadata and update
        const now = new Date().toISOString()
        const restoredTicket = {
            ...ticket,
            metadata: {
                ...ticket.metadata,
                archived_at: undefined, // Remove archived_at
                // Keep original_status for historical reference
                updated_at: now,
                updated_by: 'GitBoard User',
                position,
            },
        }

        // Write to target status location
        await fs.writeTicket(id, restoredTicket, targetStatus, resolvedBoardId)

        // Delete from archive
        await fs.deleteArchivedTicket(resolvedBoardId, yearMonth, id)

        // Git auto-commit
        await safeAutoCommit(
            `[gitboard] Restore ${id} to ${targetStatus}`,
            [
                fs.getArchivedTicketRelativePath(resolvedBoardId, yearMonth, id),
                fs.getTicketRelativePath(id, targetStatus, resolvedBoardId),
            ]
        )

        revalidatePath('/')
        return { success: true }
    } catch (error) {
        console.error('Failed to restore ticket:', error)
        return { success: false, error: (error as Error).message }
    }
}

export async function getArchivedTickets(boardId?: string): Promise<{
    tickets: Array<{
        ticket: Ticket;
        yearMonth: string;
    }>;
    count: number;
}> {
    const fs = getFs()
    const resolvedBoardId = boardId || 'default'

    const archivedList = await fs.listAllArchivedTickets(resolvedBoardId)
    const tickets: Array<{ ticket: Ticket; yearMonth: string }> = []

    for (const { id, yearMonth } of archivedList) {
        try {
            const ticket = await fs.readArchivedTicket(resolvedBoardId, yearMonth, id)
            tickets.push({ ticket, yearMonth })
        } catch (error) {
            console.error(`Failed to read archived ticket ${id}:`, error)
        }
    }

    // Sort by archived_at date (newest first)
    tickets.sort((a, b) => {
        const dateA = a.ticket.metadata.archived_at || ''
        const dateB = b.ticket.metadata.archived_at || ''
        return dateB.localeCompare(dateA)
    })

    return { tickets, count: tickets.length }
}

export async function getArchivedTicketCount(boardId?: string): Promise<number> {
    const fs = getFs()
    const resolvedBoardId = boardId || 'default'
    return fs.getArchivedTicketCount(resolvedBoardId)
}

// ============================================================================
// Docs Actions
// ============================================================================

export async function getDocsPages() {
    const fs = getFs()
    const pages = await fs.listDocsPages()
    const result: DocPage[] = []

    for (const { folder, slug } of pages) {
        try {
            const page = await fs.readDocPage(folder, slug)
            result.push(page)
        } catch (e) {
            console.error(`Failed to read doc page ${folder}/${slug}:`, e)
        }
    }

    return result
}

export async function getDocPage(folder: string, slug: string) {
    const fs = getFs()
    return fs.readDocPage(folder, slug)
}

export async function createDocPage(data: {
    slug: string
    folder: string
    title: string
    content: string
}) {
    const fs = getFs()
    const git = getGit()

    const now = new Date().toISOString()
    const page: DocPage = {
        slug: data.slug,
        folder: data.folder,
        title: data.title,
        content: data.content,
        tags: [],
        metadata: {
            created_at: now,
            updated_at: now,
            created_by: 'GitBoard User',
            updated_by: 'GitBoard User',
        },
    }

    await fs.writeDocPage(page)

    const docPath = data.folder
        ? fs.getDocRelativePath(`${data.folder}/${data.slug}.json`)
        : fs.getDocRelativePath(`${data.slug}.json`)

    await safeAutoCommit(`[gitboard] Create doc page: ${data.title}`, [docPath])

    revalidatePath('/docs')
    return { success: true, page }
}

// ============================================================================
// Team Actions
// ============================================================================

export async function getTeam() {
    const fs = getFs()
    return fs.readTeam()
}

export async function addTeamMember(member: TeamMember) {
    const fs = getFs()
    const git = getGit()

    const team = await fs.readTeam()
    team.team.push(member)
    await fs.writeTeam(team)

    await safeAutoCommit(`[gitboard] Add team member: ${member.name}`, [fs.getTeamRelativePath()])

    revalidatePath('/team')
    return { success: true }
}

// ============================================================================
// Config Actions
// ============================================================================

export async function getConfig() {
    const fs = getFs()
    return fs.readConfig()
}

// ============================================================================
// Activity Actions
// ============================================================================

export async function getRecentActivity() {
    const git = getGit()
    return git.getRecentActivity(10)
}

export async function getGitHistory(limit: number = 20) {
    const git = getGit()
    return git.getRecentActivity(limit)
}

// ============================================================================
// Ticket Status Actions (alias for moveTicket)
// ============================================================================

export async function updateTicketStatus(
    id: string,
    toStatus: Status,
    targetIndex?: number,
    boardId?: string
): Promise<{ success: boolean; error?: string; autoExecute?: { agentId: string; ticketId: string } }> {
    const result = await moveTicket(id, toStatus, targetIndex, boardId);

    if (!result.success) {
        return result;
    }

    // Check if destination column has auto-execute enabled
    try {
        const fs = getFs();
        const resolvedBoardId = boardId || 'default';
        const statuses = await fs.getStatuses(resolvedBoardId);
        const targetStatus = statuses.find(s => s.id === toStatus);

        if (targetStatus?.autoExecute && targetStatus.assignedAgent) {
            return {
                success: true,
                autoExecute: {
                    agentId: targetStatus.assignedAgent,
                    ticketId: id,
                },
            };
        }
    } catch {
        // If status check fails, still return success for the move
    }

    return { success: true };
}

// ============================================================================
// Docs Folder Actions
// ============================================================================

export async function getDocsFolders() {
    const fs = getFs()
    return fs.listDocsFolders()
}

export async function updateDocPage(
    folder: string,
    slug: string,
    updates: { title?: string; content?: string; tags?: string[] }
) {
    const fs = getFs()
    const git = getGit()

    const page = await fs.readDocPage(folder, slug)
    const updated: DocPage = {
        ...page,
        ...updates,
        metadata: {
            ...page.metadata,
            updated_at: new Date().toISOString(),
            updated_by: 'GitBoard User',
        },
    }

    await fs.writeDocPage(updated)

    const docPath = folder
        ? fs.getDocRelativePath(`${folder}/${slug}.json`)
        : fs.getDocRelativePath(`${slug}.json`)

    await safeAutoCommit(`[gitboard] Update doc page: ${updated.title}`, [docPath])

    revalidatePath('/docs')
    return { success: true, docPage: updated }
}

export async function deleteDocPage(folder: string, slug: string) {
    const fs = getFs()
    const git = getGit()

    const page = await fs.readDocPage(folder, slug)
    await fs.deleteDocPage(folder, slug)

    const docPath = folder
        ? fs.getDocRelativePath(`${folder}/${slug}.json`)
        : fs.getDocRelativePath(`${slug}.json`)

    await safeAutoCommit(`[gitboard] Delete doc page: ${page.title}`, [docPath])

    revalidatePath('/docs')
    return { success: true }
}

export async function createDocsFolder(folderName: string) {
    const fs = getFs()
    await fs.createDocsFolder(folderName)
    revalidatePath('/docs')
    return { success: true }
}

export async function renameDocsFolder(oldName: string, newName: string) {
    const fs = getFs()
    const git = getGit()

    await fs.renameDocsFolder(oldName, newName)

    await safeAutoCommit(
        `[gitboard] Rename docs folder: ${oldName} -> ${newName}`,
        [fs.getDocsRelativePath()]
    )

    revalidatePath('/docs')
    return { success: true }
}

export async function deleteDocsFolder(folderName: string, _force: boolean = false) {
    const fs = getFs()
    const git = getGit()

    await fs.deleteDocsFolder(folderName)

    await safeAutoCommit(`[gitboard] Delete docs folder: ${folderName}`, [fs.getDocsRelativePath()])

    revalidatePath('/docs')
    return { success: true }
}

export async function moveDocPage(oldFolder: string, newFolder: string, slug: string) {
    const fs = getFs()
    const git = getGit()

    const page = await fs.readDocPage(oldFolder, slug)
    await fs.moveDocPage(oldFolder, newFolder, slug)

    await safeAutoCommit(
        `[gitboard] Move doc page: ${page.title} to ${newFolder || 'root'}`,
        [fs.getDocsRelativePath()]
    )

    revalidatePath('/docs')
    return { success: true, docPage: { ...page, folder: newFolder } }
}

// ============================================================================
// Team Management Actions (Extended)
// ============================================================================

export async function updateTeamMember(memberId: string, formData: FormData) {
    const fs = getFs()
    const git = getGit()

    const roleTitle = formData.get('roleTitle') as string
    const roleLevel = formData.get('roleLevel') as string
    const wipLimit = parseInt(formData.get('wipLimit') as string) || 3
    const cliProfile = formData.get('cliProfile') as string

    const team = await fs.readTeam()
    const memberIndex = team.team.findIndex((m) => m.id === memberId)

    if (memberIndex === -1) {
        throw new Error(`Team member ${memberId} not found`)
    }

    const member = team.team[memberIndex]!
    member.role.title = roleTitle
    member.role.level = roleLevel as any
    member.capabilities.wip_limit = wipLimit

    if (cliProfile && member.ai_config) {
        member.ai_config.cli_profile = cliProfile
    }

    await fs.writeTeam(team)

    await safeAutoCommit(`[gitboard] Update team member: ${member.name}`, [fs.getTeamRelativePath()])

    revalidatePath('/team')
    return { success: true }
}

export async function removeTeamMember(memberId: string) {
    const fs = getFs()
    const git = getGit()

    const team = await fs.readTeam()
    const member = team.team.find((m) => m.id === memberId)

    if (!member) {
        throw new Error(`Team member ${memberId} not found`)
    }

    team.team = team.team.filter((m) => m.id !== memberId)
    await fs.writeTeam(team)

    await safeAutoCommit(`[gitboard] Remove team member: ${member.name}`, [fs.getTeamRelativePath()])

    revalidatePath('/team')
    return { success: true }
}

export async function addTeamMemberFromForm(formData: FormData) {
    const fs = getFs()
    const git = getGit()

    const name = formData.get('name') as string
    const type = formData.get('type') as 'human' | 'ai_agent'
    const roleTitle = formData.get('roleTitle') as string
    const roleLevel = (formData.get('roleLevel') as string) || 'mid'
    const wipLimit = parseInt(formData.get('wipLimit') as string) || 3

    const id = name.toLowerCase().replace(/\s+/g, '-')
    const now = new Date().toISOString()

    const memberData: TeamMember = {
        id,
        name,
        type,
        metadata: {
            joined_at: now,
        },
        role: {
            title: roleTitle,
            level: roleLevel as any,
            specializations: [],
        },
        availability: {
            status: 'active',
            hours_per_week: type === 'ai_agent' ? 168 : 40,
            timezone: 'UTC',
        },
        capabilities: {
            wip_limit: wipLimit,
            areas: [],
            skills: [],
        },
    }

    if (type === 'ai_agent') {
        const cliProfile = formData.get('cliProfile') as string
        memberData.ai_config = {
            provider: 'anthropic',
            model: 'claude-3-5-sonnet-20241022',
            cli_profile: cliProfile || id,
            capabilities: ['code', 'tests', 'docs'],
            auto_assign: false,
            requires_review: true,
        }
    }

    const team = await fs.readTeam()
    team.team.push(memberData)
    await fs.writeTeam(team)

    await safeAutoCommit(`[gitboard] Add team member: ${name}`, [fs.getTeamRelativePath()])

    revalidatePath('/team')
    return { success: true, member: memberData }
}

// ============================================================================
// Agent Actions
// ============================================================================

export async function getAgents(): Promise<Agent[]> {
    const fs = getFs()
    const agentIds = await fs.listAgents()
    const agents: Agent[] = []

    for (const id of agentIds) {
        try {
            const agent = await fs.readAgent(id)
            agents.push(agent)
        } catch {
            console.error(`Failed to read agent ${id}`)
        }
    }

    return agents
}

export async function saveAgent(agentData: Agent) {
    const fs = getFs()
    const git = getGit()

    const now = new Date().toISOString()
    const existing = await fs.readAgent(agentData.id).catch(() => null)

    const agent: Agent = {
        ...agentData,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
    }

    await fs.writeAgent(agent)

    await safeAutoCommit(
        `[gitboard] ${existing ? 'Update' : 'Create'} agent: ${agent.name}`,
        [fs.getAgentRelativePath(agent.id)]
    )

    revalidatePath('/agents')
    return { success: true, agent }
}

export async function deleteAgent(agentId: string) {
    const fs = getFs()
    const git = getGit()

    await fs.deleteAgent(agentId)

    await safeAutoCommit(`[gitboard] Delete agent: ${agentId}`, [fs.getAgentRelativePath(agentId)])

    revalidatePath('/agents')
    return { success: true }
}

// ============================================================================
// Skill Actions (AgentSkills.io Specification)
// ============================================================================

export async function getSkills(): Promise<Skill[]> {
    const fs = getFs()
    const skillIds = await fs.listSkills()
    const skills: Skill[] = []

    for (const id of skillIds) {
        try {
            const skill = await fs.readSkill(id)
            skills.push(skill)
        } catch {
            console.error(`Failed to read skill ${id}`)
        }
    }

    return skills
}

export async function getSkill(skillId: string): Promise<Skill | null> {
    const fs = getFs()
    try {
        return await fs.readSkill(skillId)
    } catch {
        return null
    }
}

export async function saveSkill(skillData: Partial<Skill> & { id: string; name: string }) {
    const fs = getFs()
    const git = getGit()

    const now = new Date().toISOString()
    const existing = await fs.readSkill(skillData.id).catch(() => null)

    const skill: Skill = {
        id: skillData.id,
        name: skillData.name,
        description: skillData.description,
        license: skillData.license,
        version: skillData.version,
        compatibility: skillData.compatibility,
        instructions: skillData.instructions || '',
        metadata: {
            created_at: existing?.metadata.created_at || now,
            updated_at: now,
            created_by: existing?.metadata.created_by || 'GitBoard User',
            updated_by: 'GitBoard User',
        },
    }

    await fs.writeSkill(skill)

    await safeAutoCommit(
        `[gitboard] ${existing ? 'Update' : 'Create'} skill: ${skill.name}`,
        [fs.getSkillRelativePath(skill.id)]
    )

    revalidatePath('/skills')
    return { success: true, skill }
}

export async function deleteSkill(skillId: string) {
    const fs = getFs()
    const git = getGit()

    await fs.deleteSkill(skillId)

    await safeAutoCommit(`[gitboard] Delete skill: ${skillId}`, [fs.getSkillRelativePath(skillId)])

    revalidatePath('/skills')
    return { success: true }
}

// ============================================================================
// MCP Actions (Model Context Protocol)
// ============================================================================

export async function getMCPs(): Promise<MCPConfig[]> {
    const fs = getFs()
    const mcpIds = await fs.listMCPs()
    const mcps: MCPConfig[] = []

    for (const id of mcpIds) {
        try {
            const mcp = await fs.readMCP(id)
            mcps.push(mcp)
        } catch {
            console.error(`Failed to read MCP ${id}`)
        }
    }

    return mcps
}

export async function getMCP(mcpId: string): Promise<MCPConfig | null> {
    const fs = getFs()
    try {
        return await fs.readMCP(mcpId)
    } catch {
        return null
    }
}

export async function saveMCP(mcpData: Partial<MCPConfig> & { id: string; name: string; command: string }) {
    const fs = getFs()
    const git = getGit()

    const now = new Date().toISOString()
    const existing = await fs.readMCP(mcpData.id).catch(() => null)

    const mcp: MCPConfig = {
        id: mcpData.id,
        name: mcpData.name,
        description: mcpData.description,
        command: mcpData.command,
        args: mcpData.args || [],
        env: mcpData.env || {},
        enabled: mcpData.enabled !== false,
        metadata: {
            created_at: existing?.metadata.created_at || now,
            updated_at: now,
            created_by: existing?.metadata.created_by || 'GitBoard User',
            updated_by: 'GitBoard User',
        },
    }

    await fs.writeMCP(mcp)

    await safeAutoCommit(
        `[gitboard] ${existing ? 'Update' : 'Create'} MCP: ${mcp.name}`,
        [fs.getMCPRelativePath(mcp.id)]
    )

    revalidatePath('/mcp')
    return { success: true, mcp }
}

export async function deleteMCP(mcpId: string) {
    const fs = getFs()
    const git = getGit()

    await fs.deleteMCP(mcpId)

    await safeAutoCommit(`[gitboard] Delete MCP: ${mcpId}`, [fs.getMCPRelativePath(mcpId)])

    revalidatePath('/mcp')
    return { success: true }
}

// ============================================================================
// File Actions
// ============================================================================

/**
 * Upload a file attachment
 */
export async function uploadFile(formData: FormData): Promise<{
    success: boolean
    file?: FileAttachment
    error?: string
}> {
    const file = formData.get('file') as File | null
    const parentType = formData.get('parent_type') as ParentType | null
    const parentId = formData.get('parent_id') as string | null

    if (!file) {
        return { success: false, error: 'No file provided' }
    }

    if (!parentType || !parentId) {
        return { success: false, error: 'parent_type and parent_id are required' }
    }

    if (parentType !== 'ticket' && parentType !== 'doc') {
        return { success: false, error: 'Invalid parent_type. Must be "ticket" or "doc"' }
    }

    // Check file size
    if (file.size > MAX_FILE_SIZE_BYTES) {
        return { success: false, error: 'File size exceeds maximum allowed size of 5MB' }
    }

    try {
        const fs = getFs()
        const fileManager = getFileManager()
        const git = getGit()

        // Get file buffer
        const buffer = Buffer.from(await file.arrayBuffer())

        // Validate file
        const validation = validateFile(buffer, file.type, file.name)
        if (!validation.valid) {
            return { success: false, error: validation.error }
        }

        // Check if parent exists
        if (parentType === 'ticket') {
            try {
                await fs.findTicketStatus(parentId)
            } catch {
                return { success: false, error: `Ticket not found: ${parentId}` }
            }
        } else {
            try {
                const parts = parentId.split('/')
                if (parts.length < 2) {
                    await fs.readDocPage('', parentId)
                } else {
                    const folder = parts.slice(0, -1).join('/')
                    const slug = parts[parts.length - 1]!
                    await fs.readDocPage(folder, slug)
                }
            } catch {
                return { success: false, error: `Doc not found: ${parentId}` }
            }
        }

        // Create file attachment
        const fileAttachment = await fileManager.create({
            parentType,
            parentId,
            filename: file.name,
            buffer,
            mimeType: file.type,
        })

        // Git auto-commit
        const commitPaths = fileManager.getCommitPaths(fileAttachment)
        await safeAutoCommit(
            `[gitboard] Uploaded file ${file.name} to ${parentType} ${parentId}`,
            commitPaths
        )

        revalidatePath('/')
        return { success: true, file: fileAttachment }
    } catch (error) {
        console.error('File upload error:', error)
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to upload file',
        }
    }
}

/**
 * List files for a parent entity
 */
export async function listFiles(
    parentType: ParentType,
    parentId: string
): Promise<{ files: FileAttachment[] }> {
    const fileManager = getFileManager()
    const files = await fileManager.listByParent(parentType, parentId)
    return { files }
}

/**
 * Delete a file attachment
 */
export async function deleteFile(fileId: string): Promise<{
    success: boolean
    error?: string
}> {
    try {
        const fileManager = getFileManager()
        const git = getGit()

        // Delete the file
        const deletedFile = await fileManager.delete(fileId)

        // Git auto-commit
        const commitPaths = fileManager.getCommitPaths(deletedFile)
        await safeAutoCommit(
            `[gitboard] Deleted file ${deletedFile.original_filename} from ${deletedFile.parent_type} ${deletedFile.parent_id}`,
            commitPaths
        )

        revalidatePath('/')
        return { success: true }
    } catch (error) {
        console.error('File delete error:', error)
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to delete file',
        }
    }
}

/**
 * Get file metadata by ID
 */
export async function getFile(fileId: string): Promise<FileAttachment | null> {
    const fileManager = getFileManager()
    return fileManager.read(fileId)
}

// ============================================================================
// Docs Agent Actions
// ============================================================================

import {
    startDocsWatcher as startWatcher,
    stopDocsWatcher as stopWatcher,
    syncAllDocs as syncAll,
    getWatcherStatus as getStatus
} from '@/lib/mastra/watcher'
import { searchDocs as searchDocuments, getContextForQuery } from '@/lib/mastra/search'
import { syncDocument } from '@/lib/mastra/sync'
import type { SearchResult, SearchOptions } from '@/lib/mastra/search'
import type { WatcherStatus } from '@/lib/mastra/watcher'

/**
 * Start the docs watcher to monitor gitboard/docs for changes
 */
export async function startDocsAgentWatcher(): Promise<WatcherStatus> {
    return startWatcher()
}

/**
 * Stop the docs watcher
 */
export async function stopDocsAgentWatcher(): Promise<void> {
    return stopWatcher()
}

/**
 * Manually sync all docs to the vector store
 */
export async function syncAllDocsToVectorStore(): Promise<{ synced: number; errors: number }> {
    return syncAll()
}

/**
 * Get the current watcher status
 */
export async function getDocsWatcherStatus(): Promise<WatcherStatus> {
    return getStatus()
}

/**
 * Search the docs vector store
 */
export async function searchDocsVectorStore(
    query: string,
    options?: SearchOptions
): Promise<SearchResult[]> {
    return searchDocuments(query, options)
}

/**
 * Get context for a docs agent query
 */
export async function getDocsAgentContext(
    query: string,
    maxChunks?: number
): Promise<string> {
    return getContextForQuery(query, maxChunks)
}

/**
 * Refresh AI Memory - sync all docs pages to the vector store
 * Reads from gitboard/docs/ and generates embeddings via Ollama
 */
export async function checkOllamaStatus(): Promise<{ ready: boolean; ollamaRunning: boolean; modelInstalled: boolean }> {
    const baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434'

    // Check if Ollama is running
    let ollamaRunning = false
    try {
        const res = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(3000) })
        if (res.ok) {
            ollamaRunning = true
            const data = await res.json()
            const models: { name: string }[] = data.models || []
            const modelInstalled = models.some((m: { name: string }) => m.name.startsWith('nomic-embed-text'))
            return { ready: ollamaRunning && modelInstalled, ollamaRunning, modelInstalled }
        }
    } catch {
        // Ollama not reachable
    }

    return { ready: false, ollamaRunning, modelInstalled: false }
}

export async function refreshDocsAIMemory(): Promise<{ synced: number; chunks: number; errors: string[] }> {
    const pages = await getDocsPages()
    let synced = 0
    let totalChunks = 0
    const errors: string[] = []

    for (const page of pages) {
        const fileName = page.folder
            ? `${page.folder}/${page.slug}.json`
            : `${page.slug}.json`

        const result = await syncDocument(fileName, page.content)

        if (result.success) {
            synced++
            totalChunks += result.chunksCreated
        } else {
            errors.push(`${fileName}: ${result.error}`)
        }
    }

    console.log(`[AI Memory] Refreshed: ${synced}/${pages.length} pages, ${totalChunks} chunks`)
    return { synced, chunks: totalChunks, errors }
}
