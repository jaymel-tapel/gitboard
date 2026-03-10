/**
 * Artifact Types for GitBoard
 *
 * Artifacts represent AI-generated content that appears in chat threads.
 * Each artifact type has its own viewer component and data structure.
 */

// Known artifact types - these have dedicated viewers
export type KnownArtifactType = 'ticket' | 'image' | 'code' | 'markdown' | 'diagram' | 'files';

// All artifact types - can be any string for extensibility
export type ArtifactType = string;

// List of known artifact types for type guards
export const KNOWN_ARTIFACT_TYPES: KnownArtifactType[] = ['ticket', 'image', 'code', 'markdown', 'diagram', 'files'];

// Base artifact interface
export interface BaseArtifact {
    id: string;
    type: string;
    title: string;
    createdAt: string;
    ticketId: string; // The ticket this artifact belongs to
}

// Ticket artifact - represents a generated ticket
export interface TicketArtifact extends BaseArtifact {
    type: 'ticket';
    content: {
        title: string;
        description: string;
        implementationSteps: Array<{ text: string; completed: boolean }>;
        acceptanceCriteria: Array<{ text: string; completed: boolean }>;
        notes?: string;
        tags?: string[];
        priority?: string;
    };
}

// Image artifact - for AI-generated images
export interface ImageArtifact extends BaseArtifact {
    type: 'image';
    content: {
        url: string;
        alt: string;
        width?: number;
        height?: number;
    };
}

// Code artifact - for code snippets
export interface CodeArtifact extends BaseArtifact {
    type: 'code';
    content: {
        code: string;
        language: string;
        filename?: string;
    };
}

// Markdown artifact - for formatted text
export interface MarkdownArtifact extends BaseArtifact {
    type: 'markdown';
    content: {
        markdown: string;
    };
}

// Diagram artifact - for mermaid or other diagrams
export interface DiagramArtifact extends BaseArtifact {
    type: 'diagram';
    content: {
        diagramType: 'mermaid' | 'plantuml';
        source: string;
    };
}

// File change entry - represents a single file change
export interface FileChange {
    path: string;
    changeType: 'created' | 'modified' | 'deleted';
    content?: string; // Full content for created/modified files
    diff?: string; // Git diff for modified files
}

// Files artifact - for tracking file changes from agent execution
export interface FilesArtifact extends BaseArtifact {
    type: 'files';
    content: {
        files: FileChange[];
        commitHash?: string;
        branchName?: string;
        summary?: string; // Human-readable summary of changes
    };
}

// Generic artifact - for unknown types (catch-all fallback)
export interface GenericArtifact extends BaseArtifact {
    type: string;
    content: Record<string, unknown>;
}

// Union type for all artifacts
export type Artifact =
    | TicketArtifact
    | ImageArtifact
    | CodeArtifact
    | MarkdownArtifact
    | DiagramArtifact
    | FilesArtifact
    | GenericArtifact;

// Helper type guard functions
export function isTicketArtifact(artifact: Artifact): artifact is TicketArtifact {
    return artifact.type === 'ticket';
}

export function isImageArtifact(artifact: Artifact): artifact is ImageArtifact {
    return artifact.type === 'image';
}

export function isCodeArtifact(artifact: Artifact): artifact is CodeArtifact {
    return artifact.type === 'code';
}

export function isMarkdownArtifact(artifact: Artifact): artifact is MarkdownArtifact {
    return artifact.type === 'markdown';
}

export function isDiagramArtifact(artifact: Artifact): artifact is DiagramArtifact {
    return artifact.type === 'diagram';
}

export function isFilesArtifact(artifact: Artifact): artifact is FilesArtifact {
    return artifact.type === 'files';
}

// Type guard for generic/unknown artifact types
export function isGenericArtifact(artifact: Artifact): artifact is GenericArtifact {
    return !KNOWN_ARTIFACT_TYPES.includes(artifact.type as KnownArtifactType);
}

// Utility to check if artifact has a known type
export function isKnownArtifactType(type: string): type is KnownArtifactType {
    return KNOWN_ARTIFACT_TYPES.includes(type as KnownArtifactType);
}
