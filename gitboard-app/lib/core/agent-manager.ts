import { FileSystemManager } from '../file-system';
import type { Agent } from '../schemas';

/**
 * Agent Manager
 *
 * Handles AI agent operations: list, get, save, delete
 */
export class AgentManager {
    constructor(private fs: FileSystemManager) {}

    /**
     * List all agents
     */
    async listAgents(): Promise<Agent[]> {
        const ids = await this.fs.listAgents();
        const agents: Agent[] = [];

        for (const id of ids) {
            try {
                const agent = await this.fs.readAgent(id);
                agents.push(agent);
            } catch (error) {
                console.error(`Failed to read agent ${id}:`, error);
            }
        }

        return agents;
    }

    /**
     * Get a specific agent
     */
    async getAgent(id: string): Promise<Agent | null> {
        try {
            return await this.fs.readAgent(id);
        } catch {
            return null;
        }
    }

    /**
     * Save an agent (create or update)
     */
    async saveAgent(agent: Omit<Agent, 'createdAt' | 'updatedAt'> & { createdAt?: string; updatedAt?: string }): Promise<Agent> {
        const existing = await this.getAgent(agent.id);

        const agentData: Agent = {
            ...agent,
            createdAt: existing?.createdAt || agent.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };

        await this.fs.writeAgent(agentData);
        return agentData;
    }

    /**
     * Delete an agent
     */
    async deleteAgent(id: string): Promise<void> {
        await this.fs.deleteAgent(id);
    }

    /**
     * Create a new agent with defaults
     */
    async createAgent(data: {
        id: string;
        name: string;
        description?: string;
        executionType?: 'cli' | 'api';
        provider?: string;
        model?: string;
        systemPrompt?: string;
    }): Promise<Agent> {
        const now = new Date().toISOString();

        const agent: Agent = {
            id: data.id,
            name: data.name,
            description: data.description,
            executionType: data.executionType || 'cli',
            provider: data.provider || 'anthropic',
            model: data.model,
            systemPrompt: data.systemPrompt,
            createdAt: now,
            updatedAt: now,
        };

        await this.fs.writeAgent(agent);
        return agent;
    }
}
