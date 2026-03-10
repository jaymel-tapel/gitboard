import { promises as fs } from 'fs';
import { join } from 'path';
import { FileSystemManager } from '../file-system';
import { ProjectManager, TeamManager } from '../core';
import type { Ticket } from '../schemas';

export interface TicketContext {
    ticket: Ticket;
    projectName: string;
    repoPath: string;
    relatedTickets: Ticket[];
    teamMembers: string[];
    agentsGuide: string;
    branchName?: string; // Branch name when using worktrees (typically same as ticket ID)
}

/**
 * Build context for AI agents
 *
 * Gathers all relevant information about a ticket and the project
 */
export class ContextBuilder {
    constructor(private fsManager: FileSystemManager) {}

    async buildTicketContext(ticketId: string): Promise<TicketContext> {
        const projectManager = new ProjectManager(this.fsManager);
        const teamManager = new TeamManager(this.fsManager);

        // Read ticket
        const ticket = await this.fsManager.readTicket(ticketId);

        // Get project info
        const config = await projectManager.getConfig();
        const team = await teamManager.getTeam();

        // Get related tickets (blocked_by, blocks)
        const relatedIds = [...ticket.links.blocked_by, ...ticket.links.blocks];
        const relatedTickets = await Promise.all(
            relatedIds.map((id) =>
                this.fsManager.readTicket(id).catch(() => null)
            )
        ).then((tickets) => tickets.filter(Boolean) as Ticket[]);

        // Read agents.md if it exists
        let agentsGuide = '';
        try {
            agentsGuide = await fs.readFile(
                join(this.fsManager.getDataPath(), 'agents.md'),
                'utf-8'
            );
        } catch {
            // File doesn't exist, that's ok
        }

        return {
            ticket,
            projectName: config.project.name,
            repoPath: this.fsManager.getRepoPath(),
            relatedTickets,
            teamMembers: team.team.map((m) => m.name),
            agentsGuide,
        };
    }
}
