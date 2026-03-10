import {
    TicketSchema,
    ConfigSchema,
    TeamSchema,
    InitiativeSchema,
    NextIDsSchema,
    DocPageSchema,
    type Ticket,
    type Config,
    type Team,
    type Initiative,
    type NextIDs,
    type DocPage,
    type ValidationResult,
} from './schemas';

/**
 * JSON Parser for GitBoard data files
 *
 * Handles parsing, serialization, and validation of all GitBoard JSON files
 * using Zod schemas for runtime type safety.
 */
export class JSONParser {
    /**
     * Parse a JSON string into a Ticket object
     */
    async parseTicket(content: string): Promise<Ticket> {
        const data = JSON.parse(content);
        return TicketSchema.parseAsync(data);
    }

    /**
     * Parse a JSON string into a Config object
     */
    async parseConfig(content: string): Promise<Config> {
        const data = JSON.parse(content);
        return ConfigSchema.parseAsync(data);
    }

    /**
     * Parse a JSON string into a Team object
     */
    async parseTeam(content: string): Promise<Team> {
        const data = JSON.parse(content);
        return TeamSchema.parseAsync(data);
    }

    /**
     * Parse a JSON string into an Initiative object
     */
    async parseInitiative(content: string): Promise<Initiative> {
        const data = JSON.parse(content);
        return InitiativeSchema.parseAsync(data);
    }

    /**
     * Parse a JSON string into a NextIDs object
     */
    async parseNextIDs(content: string): Promise<NextIDs> {
        const data = JSON.parse(content);
        return NextIDsSchema.parseAsync(data);
    }

    /**
     * Parse a JSON string into a DocPage object
     */
    async parseDocPage(content: string): Promise<DocPage> {
        const data = JSON.parse(content);
        return DocPageSchema.parseAsync(data);
    }

    /**
     * Serialize a Ticket object to JSON string
     */
    async serializeTicket(ticket: Ticket): Promise<string> {
        return JSON.stringify(ticket, null, 2);
    }

    /**
     * Serialize a Config object to JSON string
     */
    async serializeConfig(config: Config): Promise<string> {
        return JSON.stringify(config, null, 2);
    }

    /**
     * Serialize a Team object to JSON string
     */
    async serializeTeam(team: Team): Promise<string> {
        return JSON.stringify(team, null, 2);
    }

    /**
     * Serialize an Initiative object to JSON string
     */
    async serializeInitiative(initiative: Initiative): Promise<string> {
        return JSON.stringify(initiative, null, 2);
    }

    /**
     * Serialize a NextIDs object to JSON string
     */
    async serializeNextIDs(nextIds: NextIDs): Promise<string> {
        return JSON.stringify(nextIds, null, 2);
    }

    /**
     * Serialize a DocPage object to JSON string
     */
    async serializeDocPage(docPage: DocPage): Promise<string> {
        return JSON.stringify(docPage, null, 2);
    }

    /**
     * Validate a Ticket object without throwing
     */
    validateTicket(data: unknown): ValidationResult<Ticket> {
        const result = TicketSchema.safeParse(data);
        if (result.success) {
            return { success: true, data: result.data };
        }
        return {
            success: false,
            error: {
                message: 'Ticket validation failed',
                issues: result.error.issues.map((issue) => ({
                    path: issue.path.map(String),
                    message: issue.message,
                })),
            },
        };
    }

    /**
     * Validate a Config object without throwing
     */
    validateConfig(data: unknown): ValidationResult<Config> {
        const result = ConfigSchema.safeParse(data);
        if (result.success) {
            return { success: true, data: result.data };
        }
        return {
            success: false,
            error: {
                message: 'Config validation failed',
                issues: result.error.issues.map((issue) => ({
                    path: issue.path.map(String),
                    message: issue.message,
                })),
            },
        };
    }

    /**
     * Validate a Team object without throwing
     */
    validateTeam(data: unknown): ValidationResult<Team> {
        const result = TeamSchema.safeParse(data);
        if (result.success) {
            return { success: true, data: result.data };
        }
        return {
            success: false,
            error: {
                message: 'Team validation failed',
                issues: result.error.issues.map((issue) => ({
                    path: issue.path.map(String),
                    message: issue.message,
                })),
            },
        };
    }

    /**
     * Validate an Initiative object without throwing
     */
    validateInitiative(data: unknown): ValidationResult<Initiative> {
        const result = InitiativeSchema.safeParse(data);
        if (result.success) {
            return { success: true, data: result.data };
        }
        return {
            success: false,
            error: {
                message: 'Initiative validation failed',
                issues: result.error.issues.map((issue) => ({
                    path: issue.path.map(String),
                    message: issue.message,
                })),
            },
        };
    }

    /**
     * Validate a NextIDs object without throwing
     */
    validateNextIDs(data: unknown): ValidationResult<NextIDs> {
        const result = NextIDsSchema.safeParse(data);
        if (result.success) {
            return { success: true, data: result.data };
        }
        return {
            success: false,
            error: {
                message: 'NextIDs validation failed',
                issues: result.error.issues.map((issue) => ({
                    path: issue.path.map(String),
                    message: issue.message,
                })),
            },
        };
    }

    /**
     * Validate a DocPage object without throwing
     */
    validateDocPage(data: unknown): ValidationResult<DocPage> {
        const result = DocPageSchema.safeParse(data);
        if (result.success) {
            return { success: true, data: result.data };
        }
        return {
            success: false,
            error: {
                message: 'DocPage validation failed',
                issues: result.error.issues.map((issue) => ({
                    path: issue.path.map(String),
                    message: issue.message,
                })),
            },
        };
    }
}

/**
 * Default parser instance
 */
export const parser = new JSONParser();
