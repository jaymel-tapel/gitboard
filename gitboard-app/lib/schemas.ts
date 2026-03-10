import { z } from 'zod';

// ============================================================================
// Ticket Schemas
// ============================================================================

export const TicketMetadataSchema = z.object({
    created_at: z.string(),
    updated_at: z.string(),
    created_by: z.string(),
    updated_by: z.string(),
    position: z.number().optional(),
    // Archive-related fields
    archived_at: z.string().optional(), // ISO timestamp when the ticket was archived
    original_status: z.string().optional(), // Status the ticket was in before archiving
});

export const TicketLinksSchema = z.object({
    related_tickets: z.array(z.string()).default([]),
    blocks: z.array(z.string()).default([]),
    blocked_by: z.array(z.string()).default([]),
    pull_requests: z.array(z.string()).default([]),
    github_issues: z.array(z.string()).default([]),
});

export const ImplementationStepSchema = z.union([
    z.object({
        text: z.string(),
        completed: z.boolean().default(false),
    }),
    z.string().transform((text) => ({ text, completed: false })),
]);

export const AcceptanceCriterionSchema = z.union([
    z.object({
        text: z.string(),
        completed: z.boolean().default(false),
    }),
    z.string().transform((text) => ({ text, completed: false })),
]);

// Flexible ticket ID regex - supports any prefix like PM-0001, APP-0001, etc.
export const TicketSchema = z.object({
    id: z.string().regex(/^[A-Z]+-\d{4}$/),
    title: z.string().min(1).max(200),
    description: z.string(),
    owner: z.string().optional(),
    priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
    initiative: z.string().optional(),
    tags: z.array(z.string()).default([]),
    acceptance_criteria: z.array(AcceptanceCriterionSchema).default([]),
    implementation_steps: z.array(ImplementationStepSchema).default([]),
    notes: z.string().optional(),
    metadata: TicketMetadataSchema,
    links: TicketLinksSchema.default({}),
    custom_fields: z.record(z.any()).default({}),
});

export type Ticket = z.infer<typeof TicketSchema>;
export type TicketMetadata = z.infer<typeof TicketMetadataSchema>;
export type TicketLinks = z.infer<typeof TicketLinksSchema>;
export type ImplementationStep = z.infer<typeof ImplementationStepSchema>;
export type AcceptanceCriterion = z.infer<typeof AcceptanceCriterionSchema>;

// ============================================================================
// Status Schemas
// ============================================================================

/**
 * Pipeline execution settings for a column/status
 * These settings are applied when an agent is auto-executed in pipeline mode
 */
export const PipelineExecutionSettingsSchema = z.object({
    // Permissions
    skipPermissions: z.boolean().default(true),

    // Execution mode
    executionMode: z.enum(['normal', 'plan-only']).default('normal'),

    // Branch settings
    createNewBranch: z.boolean().default(true),
    baseBranch: z.string().optional(), // If not set, uses repo default
    autoMerge: z.boolean().default(false),
    autoPush: z.boolean().default(false),

    // Ticket automation
    autoUpdateTicket: z.boolean().default(true),
    autoMoveTicket: z.boolean().default(true), // In pipeline, default to moving to next column

    // Context settings
    includeRelatedTickets: z.boolean().default(false),
    includeAllArtifacts: z.boolean().default(true), // Auto-include all artifacts from previous stages

    // Default context (can be overridden by agent defaults)
    defaultDocsPages: z.array(z.string()).default([]),
    defaultRepoFiles: z.array(z.string()).default([]),
    defaultUrls: z.array(z.string()).default([]),
    defaultSkills: z.array(z.string()).default([]),
    defaultMCPs: z.array(z.string()).default([]),
});

export type PipelineExecutionSettings = z.infer<typeof PipelineExecutionSettingsSchema>;

export const StatusConfigSchema = z.object({
    id: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/, 'Status ID must be lowercase alphanumeric with hyphens'),
    name: z.string().min(1).max(50),
    order: z.number().int().min(0),
    color: z.enum(['gray', 'blue', 'yellow', 'red', 'green', 'purple', 'orange', 'pink']).default('gray'),
    // Pipeline configuration
    assignedAgent: z.string().optional(), // Agent ID to auto-execute when ticket enters this column
    autoExecute: z.boolean().default(false), // Enable automatic agent launch on ticket entry
    pipelineSettings: PipelineExecutionSettingsSchema.optional(), // Execution settings for this pipeline stage
});

export type StatusConfig = z.infer<typeof StatusConfigSchema>;

// Default statuses for backwards compatibility and new boards
export const DEFAULT_STATUSES: StatusConfig[] = [
    { id: 'todo', name: 'Todo', order: 0, color: 'gray', autoExecute: false },
    { id: 'doing', name: 'In Progress', order: 1, color: 'blue', autoExecute: false },
    { id: 'blocked', name: 'Blocked', order: 2, color: 'red', autoExecute: false },
    { id: 'done', name: 'Done', order: 3, color: 'green', autoExecute: false },
];

// Status type is now a dynamic string (validated against config at runtime)
export type Status = string;

export interface TicketWithStatus extends Ticket {
    status: Status;
    path: string;
}

// ============================================================================
// Board Schemas
// ============================================================================

export const BoardSchema = z.object({
    id: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/, 'Board ID must be lowercase alphanumeric with hyphens'),
    name: z.string().min(1).max(100),
    ticket_prefix: z.string().optional(),
    next_ticket_id: z.number().int().min(0).optional(),
    statuses: z.array(StatusConfigSchema).optional(),
    created_at: z.string(),
    pinned: z.boolean().optional(),
    order: z.number().int().min(0).optional(),
});

export type Board = z.infer<typeof BoardSchema>;

// ============================================================================
// Config Schemas
// ============================================================================

export const ConfigSchema = z.object({
    version: z.string().default('1.0'),
    project: z.object({
        name: z.string(),
        code: z.string().optional(),
        description: z.string().optional(),
    }),
    settings: z.object({
        auto_commit: z.boolean().default(true),
        commit_prefix: z.string().default('[gitboard]'),
        ticket_prefix: z.string().default('PM'),
        next_ticket_id: z.number().default(1),
        next_initiative_id: z.number().default(1),
    }).optional(),
    // Board statuses configuration - defaults to standard 4 columns
    statuses: z.array(StatusConfigSchema).optional(),
    ai: z.object({
        enabled: z.boolean().default(false),
        provider: z.enum(['openai', 'anthropic']).optional(),
        model: z.string().optional(),
    }).optional(),
    metadata: z.object({
        created_at: z.string().optional(),
        created_by: z.string().optional(),
    }).optional(),
});

export type Config = z.infer<typeof ConfigSchema>;

// ============================================================================
// Team Schemas
// ============================================================================

export const RoleSchema = z.object({
    title: z.string(),
    level: z.enum(['junior', 'mid', 'senior', 'staff', 'principal', 'assistant']),
    specializations: z.array(z.string()).default([]),
});

export const CapabilitiesSchema = z.object({
    areas: z.array(z.string()).default([]),
    skills: z.array(z.string()).default([]),
    wip_limit: z.number().default(3),
});

export const AvailabilitySchema = z.object({
    status: z.enum(['active', 'inactive', 'on_leave']).default('active'),
    hours_per_week: z.number().default(40),
    timezone: z.string().default('UTC'),
});

export const AIConfigSchema = z.object({
    provider: z.enum(['openai', 'anthropic', 'custom']),
    model: z.string(),
    cli_profile: z.string().optional(),
    capabilities: z.array(z.string()).default([]),
    auto_assign: z.boolean().default(false),
    requires_review: z.boolean().default(true),
});

export const TeamMemberSchema = z.object({
    id: z.string(),
    name: z.string(),
    type: z.enum(['human', 'ai_agent']),
    role: RoleSchema,
    capabilities: CapabilitiesSchema,
    availability: AvailabilitySchema,
    ai_config: AIConfigSchema.optional(),
    metadata: z.object({
        joined_at: z.string(),
        email: z.string().optional(),
        version: z.string().optional(),
    }),
});

export const RoleDefinitionSchema = z.object({
    title: z.string(),
    levels: z.array(z.string()),
    default_areas: z.array(z.string()),
});

export const TeamSchema = z.object({
    team: z.array(TeamMemberSchema),
    roles: z.object({
        definitions: z.array(RoleDefinitionSchema),
    }),
});

export type Role = z.infer<typeof RoleSchema>;
export type Capabilities = z.infer<typeof CapabilitiesSchema>;
export type Availability = z.infer<typeof AvailabilitySchema>;
export type AIConfig = z.infer<typeof AIConfigSchema>;
export type TeamMember = z.infer<typeof TeamMemberSchema>;
export type RoleDefinition = z.infer<typeof RoleDefinitionSchema>;
export type Team = z.infer<typeof TeamSchema>;

// ============================================================================
// Initiative Schemas
// ============================================================================

export const InitiativeMetadataSchema = z.object({
    created_at: z.string(),
    created_by: z.string(),
    target_date: z.string().optional(),
    status: z.enum(['active', 'completed', 'cancelled']).default('active'),
});

export const InitiativeSchema = z.object({
    id: z.string().regex(/^INIT-\d{4}$/),
    title: z.string().min(1).max(200),
    description: z.string(),
    goals: z.array(z.string()).default([]),
    tickets: z.array(z.string()).default([]),
    metadata: InitiativeMetadataSchema,
});

export type Initiative = z.infer<typeof InitiativeSchema>;
export type InitiativeMetadata = z.infer<typeof InitiativeMetadataSchema>;

// ============================================================================
// Metadata Schemas
// ============================================================================

export const NextIDsSchema = z.object({
    ticket_prefix: z.string().default('PM'),
    next_ticket_id: z.number(),
    next_initiative_id: z.number(),
    schema_version: z.string().default('1.0'),
});

export type NextIDs = z.infer<typeof NextIDsSchema>;

// ============================================================================
// Docs Schemas
// ============================================================================

export const DocPageMetadataSchema = z.object({
    created_at: z.string(),
    updated_at: z.string(),
    created_by: z.string(),
    updated_by: z.string(),
});

export const DocPageSchema = z.object({
    slug: z.string().min(1).max(100),
    folder: z.string().default(''),
    title: z.string().min(1).max(200),
    content: z.string(),
    tags: z.array(z.string()).default([]),
    metadata: DocPageMetadataSchema,
});

export type DocPage = z.infer<typeof DocPageSchema>;
export type DocPageMetadata = z.infer<typeof DocPageMetadataSchema>;

// ============================================================================
// Lock Schemas
// ============================================================================

export const LockSchema = z.object({
    path: z.string().min(1),
    locked_by: z.string().min(1),
    locked_at: z.string(),
});

export const LocksFileSchema = z.object({
    locks: z.array(LockSchema).default([]),
});

export type Lock = z.infer<typeof LockSchema>;
export type LocksFile = z.infer<typeof LocksFileSchema>;

// ============================================================================
// Agent Schemas
// ============================================================================

export const AgentSchema = z.object({
    id: z.string(),
    name: z.string(),
    description: z.string().optional(),
    executionType: z.enum(['cli', 'api']).default('cli'),
    provider: z.string().default('anthropic'),
    model: z.string().optional(),
    apiKey: z.string().optional(),
    systemPrompt: z.string().optional(),
    terminalInstructions: z.string().optional(),
    // Artifact template - free-form text instructions for artifact generation
    artifactTemplate: z.string().optional(),
    // Default context fields - pre-selected context for agent execution
    defaultDocsPages: z.array(z.string()).optional(),
    defaultRepoFiles: z.array(z.string()).optional(),
    defaultUrls: z.array(z.string()).optional(),
    defaultSkills: z.array(z.string()).optional(),
    defaultMCPs: z.array(z.string()).optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
});

export type Agent = z.infer<typeof AgentSchema>;

// ============================================================================
// File Schemas
// ============================================================================

/**
 * Maximum file size in bytes (5MB)
 */
export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB = 5242880 bytes

/**
 * Allowed MIME types for file uploads
 */
export const ALLOWED_MIME_TYPES = {
    // Image types
    'image/png': ['.png'],
    'image/jpeg': ['.jpg', '.jpeg'],
    'image/gif': ['.gif'],
    'image/webp': ['.webp'],
    'image/svg+xml': ['.svg'],
    // Text/Document types
    'text/plain': ['.txt'],
    'application/pdf': ['.pdf'],
    'application/msword': ['.doc'],
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
    'text/markdown': ['.md'],
    'application/json': ['.json'],
    'text/csv': ['.csv'],
} as const;

/**
 * Get all allowed MIME types as an array
 */
export const ALLOWED_MIME_TYPES_LIST = Object.keys(ALLOWED_MIME_TYPES) as string[];

/**
 * Get all allowed extensions as an array
 */
export const ALLOWED_EXTENSIONS = Object.values(ALLOWED_MIME_TYPES).flat();

/**
 * Parent type for file attachments
 */
export const ParentTypeSchema = z.enum(['ticket', 'doc']);
export type ParentType = z.infer<typeof ParentTypeSchema>;

/**
 * File metadata schema
 */
export const FileMetadataSchemaFields = z.object({
    created_at: z.string(),
    created_by: z.string(),
    updated_at: z.string().optional(),
});

/**
 * File attachment schema
 */
export const FileAttachmentSchema = z.object({
    /** Unique file identifier (UUID) */
    id: z.string().uuid(),
    /** Original filename as uploaded by user */
    original_filename: z.string().min(1),
    /** Storage path where file is saved */
    storage_path: z.string().min(1),
    /** File size in bytes */
    size_bytes: z.number().int().positive().max(MAX_FILE_SIZE_BYTES),
    /** MIME type of the file */
    mime_type: z.string().min(1),
    /** Type of parent entity (ticket or doc) */
    parent_type: ParentTypeSchema,
    /** ID of the parent entity */
    parent_id: z.string().min(1),
    /** File metadata */
    metadata: FileMetadataSchemaFields,
});

export type FileAttachment = z.infer<typeof FileAttachmentSchema>;
export type FileMetadataFields = z.infer<typeof FileMetadataSchemaFields>;

/**
 * Check if a MIME type is allowed
 */
export function isAllowedMimeType(mimeType: string): boolean {
    return ALLOWED_MIME_TYPES_LIST.includes(mimeType);
}

/**
 * Get allowed extensions for a MIME type
 */
export function getExtensionsForMimeType(mimeType: string): string[] {
    const extensions = ALLOWED_MIME_TYPES[mimeType as keyof typeof ALLOWED_MIME_TYPES];
    return extensions ? [...extensions] : [];
}

/**
 * Get MIME type from file extension
 */
export function getMimeTypeFromExtension(extension: string): string | null {
    const ext = extension.toLowerCase().startsWith('.') ? extension.toLowerCase() : `.${extension.toLowerCase()}`;

    for (const [mimeType, extensions] of Object.entries(ALLOWED_MIME_TYPES)) {
        if ((extensions as readonly string[]).includes(ext)) {
            return mimeType;
        }
    }
    return null;
}

// ============================================================================
// Validation Result
// ============================================================================

export interface ValidationResult<T = unknown> {
    success: boolean;
    data?: T;
    error?: {
        message: string;
        issues: Array<{
            path: string[];
            message: string;
        }>;
    };
}

// ============================================================================
// Docs Agent Schemas
// ============================================================================

/**
 * Chat message for the docs agent
 */
export const DocsAgentMessageSchema = z.object({
    id: z.string(),
    role: z.enum(['user', 'assistant']),
    content: z.string(),
    timestamp: z.string(),
    sources: z.array(z.string()).optional(),
});

export type DocsAgentMessage = z.infer<typeof DocsAgentMessageSchema>;

/**
 * Search result from the docs vector store
 */
export const DocsSearchResultSchema = z.object({
    text: z.string(),
    fileName: z.string(),
    chunkIndex: z.number(),
    score: z.number(),
});

export type DocsSearchResult = z.infer<typeof DocsSearchResultSchema>;

/**
 * Watcher status for the docs agent
 */
export const DocsWatcherStatusSchema = z.object({
    isRunning: z.boolean(),
    docsPath: z.string(),
    watchedFiles: z.number(),
});

export type DocsWatcherStatus = z.infer<typeof DocsWatcherStatusSchema>;

// ============================================================================
// Artifact Schemas
// ============================================================================

/**
 * Known artifact types - these have dedicated viewers
 */
export const KnownArtifactTypeSchema = z.enum(['ticket', 'image', 'code', 'markdown', 'diagram', 'files']);
export type KnownArtifactType = z.infer<typeof KnownArtifactTypeSchema>;

/**
 * Artifact type - can be any string, but known types get dedicated viewers
 */
export const ArtifactTypeSchema = z.string();
export type ArtifactType = string;

/**
 * Base artifact schema - common fields for all artifacts
 */
export const BaseArtifactSchema = z.object({
    id: z.string().uuid(),
    type: z.string(),
    title: z.string().min(1),
    createdAt: z.string(),
    ticketId: z.string(), // The ticket this artifact belongs to
});

/**
 * Ticket artifact content - represents a generated ticket
 */
export const TicketArtifactContentSchema = z.object({
    title: z.string(),
    description: z.string(),
    implementationSteps: z.array(z.object({
        text: z.string(),
        completed: z.boolean().default(false),
    })),
    acceptanceCriteria: z.array(z.object({
        text: z.string(),
        completed: z.boolean().default(false),
    })),
    notes: z.string().optional(),
    tags: z.array(z.string()).optional(),
    priority: z.string().optional(),
});

export const TicketArtifactSchema = BaseArtifactSchema.extend({
    type: z.literal('ticket'),
    content: TicketArtifactContentSchema,
});

/**
 * Image artifact content
 */
export const ImageArtifactContentSchema = z.object({
    url: z.string(),
    alt: z.string(),
    width: z.number().optional(),
    height: z.number().optional(),
});

export const ImageArtifactSchema = BaseArtifactSchema.extend({
    type: z.literal('image'),
    content: ImageArtifactContentSchema,
});

/**
 * Code artifact content
 */
export const CodeArtifactContentSchema = z.object({
    code: z.string(),
    language: z.string(),
    filename: z.string().optional(),
});

export const CodeArtifactSchema = BaseArtifactSchema.extend({
    type: z.literal('code'),
    content: CodeArtifactContentSchema,
});

/**
 * Markdown artifact content
 */
export const MarkdownArtifactContentSchema = z.object({
    markdown: z.string(),
});

export const MarkdownArtifactSchema = BaseArtifactSchema.extend({
    type: z.literal('markdown'),
    content: MarkdownArtifactContentSchema,
});

/**
 * Diagram artifact content
 */
export const DiagramArtifactContentSchema = z.object({
    diagramType: z.enum(['mermaid', 'plantuml']),
    source: z.string(),
});

export const DiagramArtifactSchema = BaseArtifactSchema.extend({
    type: z.literal('diagram'),
    content: DiagramArtifactContentSchema,
});

/**
 * File change entry for files artifact - represents a single file change
 */
export const FileChangeSchema = z.object({
    path: z.string(),
    changeType: z.enum(['created', 'modified', 'deleted']),
    content: z.string().optional(), // Full content for created/modified files
    diff: z.string().optional(), // Git diff for modified files
});

/**
 * Files artifact content - represents file changes from an agent execution
 */
export const FilesArtifactContentSchema = z.object({
    files: z.array(FileChangeSchema),
    commitHash: z.string().optional(),
    branchName: z.string().optional(),
    summary: z.string().optional(), // Human-readable summary of changes
});

export const FilesArtifactSchema = BaseArtifactSchema.extend({
    type: z.literal('files'),
    content: FilesArtifactContentSchema,
});

/**
 * Generic artifact schema - catch-all for unknown artifact types
 * This allows artifacts with any type to be parsed and displayed with a fallback viewer
 */
export const GenericArtifactSchema = BaseArtifactSchema.extend({
    type: z.string(),
    content: z.record(z.unknown()),
});

/**
 * Union schema for all artifact types
 * Uses z.union() with specific types first, and GenericArtifactSchema as catch-all fallback.
 * This allows unknown artifact types to be parsed and displayed gracefully.
 */
export const ArtifactSchema = z.union([
    TicketArtifactSchema,
    ImageArtifactSchema,
    CodeArtifactSchema,
    MarkdownArtifactSchema,
    DiagramArtifactSchema,
    FilesArtifactSchema,
    GenericArtifactSchema, // Catch-all for unknown types
]);

export type Artifact = z.infer<typeof ArtifactSchema>;
export type TicketArtifact = z.infer<typeof TicketArtifactSchema>;
export type ImageArtifact = z.infer<typeof ImageArtifactSchema>;
export type CodeArtifact = z.infer<typeof CodeArtifactSchema>;
export type MarkdownArtifact = z.infer<typeof MarkdownArtifactSchema>;
export type DiagramArtifact = z.infer<typeof DiagramArtifactSchema>;
export type FilesArtifact = z.infer<typeof FilesArtifactSchema>;
export type FileChange = z.infer<typeof FileChangeSchema>;
export type GenericArtifact = z.infer<typeof GenericArtifactSchema>;

// ============================================================================
// Ticket Chat History Schemas
// ============================================================================

/**
 * Chat message for ticket conversations
 */
export const TicketChatMessageSchema = z.object({
    id: z.string(),
    role: z.enum(['user', 'assistant']),
    content: z.string(),
    timestamp: z.string(),
    artifactId: z.string().uuid().optional(), // Link to an artifact
});

export type TicketChatMessage = z.infer<typeof TicketChatMessageSchema>;

/**
 * Chat history for a ticket - stored in gitboard/ticketchat/{ticketId}.json
 */
export const TicketChatHistorySchema = z.object({
    ticketId: z.string(),
    messages: z.array(TicketChatMessageSchema),
    metadata: z.object({
        created_at: z.string(),
        updated_at: z.string(),
    }),
});

export type TicketChatHistory = z.infer<typeof TicketChatHistorySchema>;

/**
 * Context selections saved with ticket
 */
export const TicketContextSelectionsSchema = z.object({
    docsPages: z.array(z.string()).default([]),
    repoFiles: z.array(z.string()).default([]),
    relatedTickets: z.array(z.string()).default([]),
    urls: z.array(z.string()).default([]),
});

export type TicketContextSelections = z.infer<typeof TicketContextSelectionsSchema>;

// ============================================================================
// Skill Schemas (AgentSkills.io Specification)
// ============================================================================

/**
 * Skill compatibility - which agents and providers the skill works with
 */
export const SkillCompatibilitySchema = z.object({
    agents: z.array(z.string()).default([]),
    providers: z.array(z.string()).default([]),
});

/**
 * Skill metadata for tracking creation and updates
 */
export const SkillMetadataSchema = z.object({
    created_at: z.string(),
    updated_at: z.string(),
    created_by: z.string(),
    updated_by: z.string(),
});

/**
 * Skill schema following the agentskills.io specification
 * Skills are stored as SKILL.md files with YAML frontmatter and markdown body
 */
export const SkillSchema = z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    description: z.string().optional(),
    license: z.string().optional(),
    version: z.string().optional(),
    compatibility: SkillCompatibilitySchema.optional(),
    instructions: z.string(), // The markdown body containing the actual agent instructions
    metadata: SkillMetadataSchema,
});

export type Skill = z.infer<typeof SkillSchema>;
export type SkillCompatibility = z.infer<typeof SkillCompatibilitySchema>;
export type SkillMetadata = z.infer<typeof SkillMetadataSchema>;

// ============================================================================
// MCP Schemas (Model Context Protocol)
// ============================================================================

/**
 * MCP metadata for tracking creation and updates
 */
export const MCPMetadataSchema = z.object({
    created_at: z.string(),
    updated_at: z.string(),
    created_by: z.string(),
    updated_by: z.string(),
});

/**
 * MCP Configuration schema following Claude's MCP format
 * Stored as config.json in gitboard/mcp/{name-id}/
 */
export const MCPConfigSchema = z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    description: z.string().optional(),
    command: z.string().min(1),
    args: z.array(z.string()).default([]),
    env: z.record(z.string()).default({}),
    enabled: z.boolean().default(true),
    metadata: MCPMetadataSchema,
});

export type MCPConfig = z.infer<typeof MCPConfigSchema>;
export type MCPMetadata = z.infer<typeof MCPMetadataSchema>;
