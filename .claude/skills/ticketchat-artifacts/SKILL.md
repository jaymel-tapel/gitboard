---
name: TicketChat Artifacts
description: Create and manage artifacts in GitBoard's TicketChat system - including tickets, code, markdown, diagrams, and images
version: 1.1.0
metadata:
  created_at: 2026-02-03T17:09:47.166Z
  updated_at: 2026-02-03T21:02:08.785Z
  created_by: GitBoard User
  updated_by: GitBoard User
---

# TicketChat Artifacts

This skill enables you to create artifacts within GitBoard's TicketChat conversation system. Artifacts are AI-generated content pieces stored as JSON files.

## When to Use

Activate this skill when the user asks you to:
- Create an artifact
- Generate a ticket, code snippet, diagram, or markdown content for TicketChat
- Save content as an artifact

## Artifact Storage

Artifacts are stored relative to the repository root at:
```
.gitboard/artifacts/{ticketId}/{artifactId}.json
```

- `ticketId`: The ID of the parent ticket
- `artifactId`: A unique identifier for the artifact (UUID format)

## Creating Artifacts via API (Recommended)

The preferred method for creating artifacts is through the API endpoint:

### POST /api/ticket-artifacts/{ticketId}

Creates a new artifact for the specified ticket.

**Request Body:**
```json
{
  "type": "code",
  "title": "Authentication Helper",
  "ticketId": "PM-0042",
  "content": {
    "language": "typescript",
    "code": "export function validateToken(token: string): boolean { return true; }",
    "filename": "auth-helper.ts"
  }
}
```

**Response:** Returns the created artifact with auto-generated `id` and `createdAt` fields.

**Benefits of using the API:**
- Automatic UUID generation for the artifact ID
- Automatic timestamp generation
- Schema validation
- Proper directory creation

### GET /api/ticket-artifacts/{ticketId}

Retrieves all artifacts for a ticket.

### DELETE /api/ticket-artifacts/{ticketId}?artifactId={id}

Deletes a specific artifact.

## Artifact-Message Linking

Artifacts are displayed inline in the chat conversation, directly after the assistant message that generated them. This is achieved through the `artifactId` field in `TicketChatMessage`:

```typescript
interface TicketChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  artifactId?: string; // Links to the artifact's id
}
```

When an artifact is created:
1. The artifact is stored with a unique `id`
2. The assistant message that triggered the artifact generation includes `artifactId` matching the artifact's `id`
3. The UI renders the artifact card inline, directly below the linked message

## Artifact Types & Schemas

### Common Fields

All artifact types share these base fields:

| Field | Type | Description |
|-------|------|-------------|
| `id` | string (UUID) | Unique identifier for the artifact |
| `type` | string | One of: `ticket`, `code`, `markdown`, `diagram`, `image` |
| `title` | string | Display title for the artifact card |
| `createdAt` | string (ISO 8601) | Timestamp when the artifact was created |
| `ticketId` | string | ID of the parent ticket (use `'pending'` for new tickets not yet saved) |
| `content` | object | Type-specific content (see below) |

### 1. Ticket Artifact
For generating new ticket proposals with structured content.

```json
{
  "id": "uuid-string",
  "type": "ticket",
  "title": "Ticket title",
  "createdAt": "2024-01-15T10:30:00Z",
  "ticketId": "PM-0042",
  "content": {
    "title": "Feature: User Authentication",
    "description": "Detailed description of the feature or bug",
    "implementationSteps": [
      { "text": "Create auth module", "completed": false },
      { "text": "Implement login endpoint", "completed": false },
      { "text": "Add session management", "completed": false }
    ],
    "acceptanceCriteria": [
      { "text": "Users can log in with email/password", "completed": false },
      { "text": "Session persists across page refreshes", "completed": false },
      { "text": "Invalid credentials show error message", "completed": false }
    ],
    "notes": "Optional additional notes",
    "tags": ["auth", "security"],
    "priority": "high"
  }
}
```

**Required fields:** title, description, implementationSteps, acceptanceCriteria
**Optional fields:** notes (string), tags (string array), priority (string)

**Note:** Implementation steps and acceptance criteria use objects with `text` and `completed` fields to support checkbox tracking.

### 2. Code Artifact
For code snippets with syntax highlighting support.

```json
{
  "id": "uuid-string",
  "type": "code",
  "title": "Authentication Helper",
  "createdAt": "2024-01-15T10:30:00Z",
  "ticketId": "PM-0042",
  "content": {
    "language": "typescript",
    "code": "export function validateToken(token: string): boolean {\n  // Implementation here\n  return true;\n}",
    "filename": "auth-helper.ts"
  }
}
```

Supported languages: typescript, javascript, python, rust, go, java, and others.

### 3. Markdown Artifact
For formatted text content, documentation, or notes.

```json
{
  "id": "uuid-string",
  "type": "markdown",
  "title": "API Documentation",
  "createdAt": "2024-01-15T10:30:00Z",
  "ticketId": "PM-0042",
  "content": {
    "markdown": "# API Documentation\n\n## Endpoints\n\n### POST /api/auth/login\n\nAuthenticates a user and returns a session token."
  }
}
```

### 4. Diagram Artifact
For visual diagrams using Mermaid or PlantUML syntax.

```json
{
  "id": "uuid-string",
  "type": "diagram",
  "title": "Authentication Flow",
  "createdAt": "2024-01-15T10:30:00Z",
  "ticketId": "PM-0042",
  "content": {
    "diagramType": "mermaid",
    "source": "sequenceDiagram\n    participant User\n    participant API\n    participant DB\n    User->>API: POST /login\n    API->>DB: Validate credentials\n    DB-->>API: User data\n    API-->>User: JWT Token"
  }
}
```

Supported diagram types: `mermaid`, `plantuml`

### 5. Image Artifact
For AI-generated or referenced images.

```json
{
  "id": "uuid-string",
  "type": "image",
  "title": "System Architecture Diagram",
  "createdAt": "2024-01-15T10:30:00Z",
  "ticketId": "PM-0042",
  "content": {
    "url": "https://example.com/generated-image.png",
    "alt": "System architecture showing microservices layout",
    "width": 1024,
    "height": 768
  }
}
```

## Creating Artifacts via File System

If you need to create artifacts directly via the file system (alternative to API):

1. Generate a unique ID using UUID v4 format
2. Set the createdAt timestamp to the current ISO 8601 datetime
3. Set the ticketId to the parent ticket ID (or `'pending'` for new tickets)
4. Choose the appropriate type based on the content
5. Ensure the directory exists: `.gitboard/artifacts/{ticketId}/`
6. Write the JSON file to `.gitboard/artifacts/{ticketId}/{artifactId}.json`

**Note:** The path is relative to the repository root. The `.gitboard` directory is where GitBoard stores all its data.

## UI Display Behavior

Artifacts appear in the TicketEditor chat interface as follows:

1. **Inline Display**: Each artifact is rendered as a compact card directly below the assistant message that has a matching `artifactId`
2. **ArtifactCard Component**: Shows the artifact type icon, title, and a preview
3. **Click to Expand**: Clicking an artifact card opens the full `ArtifactViewer` in the right panel
4. **Multiple Artifacts**: A conversation can have multiple artifacts, each linked to different messages via their `artifactId`

```
┌─────────────────────────────────────┐
│ User: "Create a login function"     │
├─────────────────────────────────────┤
│ Assistant: "I'll create a login..." │
│ ┌─────────────────────────────────┐ │
│ │ 📄 Login Function (code)        │ │  ← Artifact card inline
│ │ auth-helper.ts                  │ │
│ └─────────────────────────────────┘ │
├─────────────────────────────────────┤
│ User: "Now add validation"          │
├─────────────────────────────────────┤
│ Assistant: "Here's the validation"  │
│ ┌─────────────────────────────────┐ │
│ │ 📄 Input Validator (code)       │ │  ← Another artifact inline
│ │ validator.ts                    │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

## Best Practices

1. **Use the API when possible** - it handles ID generation, timestamps, and validation automatically
2. **Use descriptive titles** that clearly indicate the artifact's purpose
3. **Include proper formatting** in code and markdown artifacts
4. **Use Mermaid for diagrams** as it's more widely supported
5. **Keep code artifacts focused** - one logical unit per artifact
6. **For tickets**, always include both implementation steps and acceptance criteria
7. **Use optional fields** like notes, tags, and priority to add context to ticket artifacts