import { FileSystemManager, detectStandaloneDataPath } from '../file-system';
import { TicketManager, TeamManager, AgentManager } from '../core';
import { GitManager } from '../git-manager';
import { ClaudeExecutor } from './claude-executor';
import { ContextBuilder } from './context-builder';
import { buildWorkPrompt } from './prompts/work-on-ticket';

/**
 * AI Manager for GitBoard
 *
 * Manages AI agent execution using Claude CLI
 * Supports agent-specific profiles and skillsets
 */
export class AIManager {
    private fsManager: FileSystemManager;
    private contextBuilder: ContextBuilder;
    private ticketManager: TicketManager;
    private teamManager: TeamManager;
    private agentManager: AgentManager;
    private git: GitManager;
    private repoPath: string;
    private isStandalone: boolean;

    constructor(fsManager: FileSystemManager, getCurrentUser: () => string) {
        this.fsManager = fsManager;
        this.repoPath = fsManager.getRepoPath();
        this.contextBuilder = new ContextBuilder(fsManager);
        this.ticketManager = new TicketManager(fsManager, getCurrentUser);
        this.teamManager = new TeamManager(fsManager);
        this.agentManager = new AgentManager(fsManager);
        this.git = new GitManager(this.repoPath);
        this.isStandalone = !!detectStandaloneDataPath();
    }

    /**
     * Safe auto-commit that skips in standalone mode
     */
    private async safeAutoCommit(message: string, paths: string[]): Promise<void> {
        if (this.isStandalone) {
            return;
        }
        await this.safeAutoCommit(message, paths);
    }

    /**
     * Have AI work on a ticket autonomously
     */
    async workOnTicket(ticketId: string, agentId?: string): Promise<void> {
        // Build context
        const context = await this.contextBuilder.buildTicketContext(ticketId);

        // Check if ticket is ready (not blocked)
        if (context.ticket.links.blocked_by.length > 0) {
            throw new Error(
                `Ticket ${ticketId} is blocked by: ${context.ticket.links.blocked_by.join(', ')}`
            );
        }

        // Get the agent
        let agentName = 'AI Agent';
        let systemPrompt: string | undefined;

        if (agentId) {
            const agent = await this.agentManager.getAgent(agentId);

            if (!agent) {
                throw new Error(`Agent ${agentId} not found`);
            }

            agentName = agent.name;
            systemPrompt = agent.systemPrompt;
            console.log(`🤖 Agent: ${agent.name}`);
            if (agent.description) {
                console.log(`📋 Description: ${agent.description}`);
            }
        } else {
            // Fallback to ticket owner
            const team = await this.teamManager.getTeam();
            const agent = team.team.find((m) => m.id === context.ticket.owner);

            if (!agent) {
                throw new Error(
                    `Ticket ${ticketId} is assigned to ${context.ticket.owner} which is not in the team`
                );
            }

            if (agent.type !== 'ai_agent') {
                throw new Error(
                    `Ticket ${ticketId} is assigned to ${context.ticket.owner} which is not an AI agent`
                );
            }

            agentName = agent.name;
            console.log(`🤖 Agent: ${agent.name}`);
            console.log(
                `📋 Skillset: ${agent.capabilities.areas.join(', ') || 'general'}`
            );
        }

        // Create executor
        const executor = new ClaudeExecutor(this.repoPath);

        // Move to doing
        await this.ticketManager.move(ticketId, 'doing');
        await this.safeAutoCommit(
            `[gitboard] AI (${agentName}) starting work on ${ticketId}`,
            [`gitboard/tickets/doing/${ticketId}.json`]
        );

        // Build prompt
        let prompt = buildWorkPrompt(context);

        if (systemPrompt) {
            prompt = `${systemPrompt}\n\n${prompt}`;
        }

        // Execute with Claude
        console.log(`🤖 AI agent ${agentName} starting work on ${ticketId}...`);
        const result = await executor.execute(prompt);

        if (!result.success) {
            await this.ticketManager.move(ticketId, 'blocked');
            await this.safeAutoCommit(
                `[gitboard] AI (${agentName}) failed on ${ticketId}: ${result.error}`,
                [`gitboard/tickets/blocked/${ticketId}.json`]
            );
            throw new Error(`AI execution failed: ${result.error}`);
        }

        // Check if work is complete
        const status = await this.ticketManager.findStatus(ticketId);

        if (status === 'done') {
            console.log(`✅ AI (${agentName}) completed ${ticketId}`);
        } else {
            console.log(
                `⏸️  AI (${agentName}) made progress on ${ticketId} (status: ${status})`
            );
        }
    }
}
