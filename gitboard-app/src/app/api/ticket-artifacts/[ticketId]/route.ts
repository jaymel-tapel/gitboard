import { NextRequest, NextResponse } from 'next/server';
import { FileSystemManager } from '@/lib/file-system';
import { ArtifactSchema, type Artifact } from '@/lib/schemas';
import { randomUUID } from 'crypto';
import { getProjectRoot } from '@/lib/get-project-root';

/**
 * GET /api/ticket-artifacts/[ticketId]
 * List all artifacts for a ticket, or get a specific artifact by artifactId query param
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ ticketId: string }> }
) {
    const repoPath = getProjectRoot();
    const fs = new FileSystemManager(repoPath);
    const { ticketId } = await params;
    const artifactId = request.nextUrl.searchParams.get('artifactId');

    try {
        if (artifactId) {
            // Get specific artifact
            const artifact = await fs.readArtifact(ticketId, artifactId);
            return NextResponse.json({ artifact });
        }

        // List all artifacts for ticket
        const artifacts = await fs.readTicketArtifacts(ticketId);
        return NextResponse.json({ artifacts });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to fetch artifacts';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

/**
 * POST /api/ticket-artifacts/[ticketId]
 * Create a new artifact for a ticket
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ ticketId: string }> }
) {
    const repoPath = getProjectRoot();
    const fs = new FileSystemManager(repoPath);
    const { ticketId } = await params;

    try {
        const body = await request.json();

        // Create artifact with generated id and timestamps
        // Preserve the body.id if provided (for maintaining consistency with chat history artifactId)
        // Only generate a new UUID as fallback for backward compatibility
        const artifact: Artifact = {
            ...body,
            id: body.id || randomUUID(),
            ticketId,
            createdAt: new Date().toISOString(),
        };

        // Validate with Zod schema
        const validated = ArtifactSchema.parse(artifact);

        // Save to file system
        await fs.writeArtifact(validated);

        return NextResponse.json({ artifact: validated }, { status: 201 });
    } catch (error) {
        console.error('Error creating artifact:', error);
        const message = error instanceof Error ? error.message : 'Failed to create artifact';
        return NextResponse.json({ error: message }, { status: 400 });
    }
}

/**
 * DELETE /api/ticket-artifacts/[ticketId]
 * Delete a specific artifact by artifactId query param, or all artifacts if no artifactId
 */
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ ticketId: string }> }
) {
    const repoPath = getProjectRoot();
    const fs = new FileSystemManager(repoPath);
    const { ticketId } = await params;
    const artifactId = request.nextUrl.searchParams.get('artifactId');

    try {
        if (artifactId) {
            // Delete specific artifact
            await fs.deleteArtifact(ticketId, artifactId);
            return NextResponse.json({ success: true, deleted: artifactId });
        }

        // Delete all artifacts for ticket
        await fs.deleteTicketArtifacts(ticketId);
        return NextResponse.json({ success: true, deleted: 'all' });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to delete artifact(s)';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
