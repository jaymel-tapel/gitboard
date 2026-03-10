import { FileSystemManager } from '../file-system';
import type { Config } from '../schemas';

/**
 * Project Manager
 *
 * Handles project-level operations: initialization, configuration
 */
export class ProjectManager {
    constructor(private fs: FileSystemManager) {}

    /**
     * Initialize a new GitBoard project
     */
    async init(config: {
        name: string;
        code?: string;
        description?: string;
    }): Promise<void> {
        if (await this.fs.isInitialized()) {
            throw new Error('Project is already initialized');
        }

        await this.fs.initializeStructure();

        const initialConfig: Config = {
            version: '1.0',
            project: {
                name: config.name,
                code: config.code,
                description: config.description,
            },
            settings: {
                auto_commit: true,
                commit_prefix: '[gitboard]',
                ticket_prefix: config.code || 'PM',
                next_ticket_id: 1,
                next_initiative_id: 1,
            },
            ai: {
                enabled: false,
            },
        };

        await this.fs.writeConfig(initialConfig);

        await this.fs.writeNextIDs({
            ticket_prefix: config.code || 'PM',
            next_ticket_id: 1,
            next_initiative_id: 1,
            schema_version: '1.0',
        });
    }

    /**
     * Get project configuration
     */
    async getConfig(): Promise<Config> {
        return this.fs.readConfig();
    }

    /**
     * Update project configuration
     */
    async updateConfig(updates: Partial<Config>): Promise<Config> {
        const config = await this.getConfig();

        const updatedConfig: Config = {
            version: updates.version ?? config.version,
            project: {
                ...config.project,
                ...updates.project,
            },
        };

        if (config.settings || updates.settings) {
            updatedConfig.settings = {
                ...config.settings,
                ...updates.settings,
            } as Config['settings'];
        }

        if (config.ai || updates.ai) {
            updatedConfig.ai = {
                ...config.ai,
                ...updates.ai,
            } as Config['ai'];
        }

        await this.fs.writeConfig(updatedConfig);
        return updatedConfig;
    }

    /**
     * Check if project is initialized
     */
    async isInitialized(): Promise<boolean> {
        return this.fs.isInitialized();
    }

    /**
     * Get next ticket ID and increment
     */
    async getNextTicketID(): Promise<string> {
        const metadata = await this.fs.readNextIDs();
        const prefix = metadata.ticket_prefix || 'PM';
        const id = `${prefix}-${String(metadata.next_ticket_id).padStart(4, '0')}`;

        await this.fs.writeNextIDs({
            ...metadata,
            next_ticket_id: metadata.next_ticket_id + 1,
        });

        return id;
    }

    /**
     * Get next initiative ID and increment
     */
    async getNextInitiativeID(): Promise<string> {
        const metadata = await this.fs.readNextIDs();
        const id = `INIT-${String(metadata.next_initiative_id).padStart(4, '0')}`;

        await this.fs.writeNextIDs({
            ...metadata,
            next_initiative_id: metadata.next_initiative_id + 1,
        });

        return id;
    }
}
