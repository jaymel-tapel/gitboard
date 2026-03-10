import { FileSystemManager } from '../file-system';
import type { Ticket, Status, TicketWithStatus } from '../schemas';
import type { FileManager } from './file-manager';

/**
 * Ticket Manager
 *
 * Handles all ticket operations: create, read, update, delete, move, list
 */
export class TicketManager {
    private fileManager?: FileManager;

    constructor(
        private fs: FileSystemManager,
        private getCurrentUser: () => string
    ) {}

    /**
     * Set the FileManager for cascade deletion of files
     */
    setFileManager(fileManager: FileManager): void {
        this.fileManager = fileManager;
    }

    /**
     * Create a new ticket
     */
    async create(
        id: string,
        data: Omit<Ticket, 'id' | 'metadata' | 'links' | 'custom_fields'>
    ): Promise<Ticket> {
        const now = new Date().toISOString();
        const user = this.getCurrentUser();

        const ticket: Ticket = {
            id,
            ...data,
            metadata: {
                created_at: now,
                updated_at: now,
                created_by: user,
                updated_by: user,
            },
            links: {
                related_tickets: [],
                blocks: [],
                blocked_by: [],
                pull_requests: [],
                github_issues: [],
            },
            custom_fields: {},
        };

        await this.fs.writeTicket(id, ticket, 'todo');
        return ticket;
    }

    /**
     * Read a ticket
     */
    async read(id: string, status?: Status): Promise<Ticket> {
        return this.fs.readTicket(id, status);
    }

    /**
     * Update a ticket
     */
    async update(
        id: string,
        updates: Partial<Omit<Ticket, 'id' | 'metadata'>>,
        status?: Status
    ): Promise<Ticket> {
        const ticket = await this.read(id, status);
        const user = this.getCurrentUser();

        const updatedTicket: Ticket = {
            ...ticket,
            ...updates,
            id: ticket.id,
            metadata: {
                ...ticket.metadata,
                updated_at: new Date().toISOString(),
                updated_by: user,
            },
        };

        const currentStatus = status || (await this.findStatus(id));
        await this.fs.writeTicket(id, updatedTicket, currentStatus);

        return updatedTicket;
    }

    /**
     * Delete a ticket and its associated files
     */
    async delete(id: string, status?: Status): Promise<void> {
        const currentStatus = status || (await this.findStatus(id));

        // Cascade delete associated files if FileManager is available
        if (this.fileManager) {
            try {
                await this.fileManager.deleteByParent('ticket', id);
            } catch (error) {
                // Log warning but don't fail ticket deletion if file cleanup fails
                console.warn(`Warning: Failed to delete files for ticket ${id}:`, error);
            }
        }

        await this.fs.deleteTicket(id, currentStatus);
    }

    /**
     * Move a ticket to a different status
     */
    async move(id: string, toStatus: Status): Promise<Ticket> {
        const fromStatus = await this.findStatus(id);

        if (fromStatus === toStatus) {
            return this.read(id, fromStatus);
        }

        const ticket = await this.read(id, fromStatus);
        const user = this.getCurrentUser();

        const updatedTicket: Ticket = {
            ...ticket,
            metadata: {
                ...ticket.metadata,
                updated_at: new Date().toISOString(),
                updated_by: user,
            },
        };

        await this.fs.writeTicket(id, updatedTicket, toStatus);
        await this.fs.deleteTicket(id, fromStatus);

        return updatedTicket;
    }

    /**
     * List tickets in a status
     */
    async list(status: Status): Promise<TicketWithStatus[]> {
        const ids = await this.fs.listTickets(status);
        const tickets: TicketWithStatus[] = [];

        for (const id of ids) {
            const ticket = await this.read(id, status);
            tickets.push({
                ...ticket,
                status,
                path: `gitboard/tickets/${status}/${id}.json`,
            });
        }

        return tickets;
    }

    /**
     * List all tickets across all statuses
     */
    async listAll(): Promise<TicketWithStatus[]> {
        const allTickets = await this.fs.listAllTickets();
        const tickets: TicketWithStatus[] = [];

        for (const { id, status } of allTickets) {
            const ticket = await this.read(id, status);
            tickets.push({
                ...ticket,
                status,
                path: `gitboard/tickets/${status}/${id}.json`,
            });
        }

        return tickets;
    }

    /**
     * Find which status a ticket is in
     */
    async findStatus(id: string): Promise<Status> {
        return this.fs.findTicketStatus(id);
    }

    /**
     * Find tickets by criteria
     */
    async find(criteria: {
        owner?: string;
        priority?: string;
        tags?: string[];
        initiative?: string;
        status?: Status;
    }): Promise<TicketWithStatus[]> {
        const tickets = criteria.status
            ? await this.list(criteria.status)
            : await this.listAll();

        return tickets.filter((ticket) => {
            if (criteria.owner && ticket.owner !== criteria.owner) return false;
            if (criteria.priority && ticket.priority !== criteria.priority)
                return false;
            if (criteria.initiative && ticket.initiative !== criteria.initiative)
                return false;
            if (
                criteria.tags &&
                !criteria.tags.every((tag) => ticket.tags.includes(tag))
            ) {
                return false;
            }
            return true;
        });
    }
}
