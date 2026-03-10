import { NextRequest, NextResponse } from 'next/server';
import { FileSystemManager } from '@/lib/file-system';
import type { MCPConfig } from '@/lib/schemas';

export const dynamic = 'force-dynamic';

function getFs() {
    let repoPath = process.env.GITBOARD_REPO_PATH;

    // Auto-detect GITBOARD_REPO_PATH if not set (same logic as server.cjs)
    if (!repoPath) {
        const path = require('path');
        const fs = require('fs');
        let currentDir = process.cwd();

        while (currentDir !== '/') {
            const gitboardPath = path.join(currentDir, 'gitboard');
            if (fs.existsSync(gitboardPath) && fs.statSync(gitboardPath).isDirectory()) {
                repoPath = currentDir;
                break;
            }
            currentDir = path.dirname(currentDir);
        }

        // Fallback to current directory if not found
        if (!repoPath) {
            repoPath = process.cwd();
        }
    }

    return new FileSystemManager(repoPath);
}

// GET /api/mcp - List all MCPs
export async function GET() {
    try {
        const fs = getFs();
        const mcpIds = await fs.listMCPs();

        // Load full MCP data for each ID
        const mcps = await Promise.all(
            mcpIds.map(async (id) => {
                try {
                    return await fs.readMCP(id);
                } catch {
                    return null;
                }
            })
        );

        // Filter out nulls (failed reads)
        const validMCPs = mcps.filter(Boolean);

        return NextResponse.json({ mcps: validMCPs });
    } catch (error) {
        console.error('Failed to fetch MCPs:', error);
        return NextResponse.json(
            { error: 'Failed to fetch MCPs' },
            { status: 500 }
        );
    }
}

// POST /api/mcp - Create or update an MCP
export async function POST(request: NextRequest) {
    try {
        const fs = getFs();
        const mcpData = await request.json();

        const now = new Date().toISOString();
        const existing = await fs.readMCP(mcpData.id).catch(() => null);

        const mcp: MCPConfig = {
            id: mcpData.id,
            name: mcpData.name,
            description: mcpData.description,
            command: mcpData.command,
            args: mcpData.args || [],
            env: mcpData.env || {},
            enabled: mcpData.enabled !== false,
            metadata: {
                created_at: existing?.metadata.created_at || now,
                updated_at: now,
                created_by: existing?.metadata.created_by || 'GitBoard User',
                updated_by: 'GitBoard User',
            },
        };

        await fs.writeMCP(mcp);

        return NextResponse.json({ success: true, mcp });
    } catch (error) {
        console.error('Failed to save MCP:', error);
        return NextResponse.json(
            { error: 'Failed to save MCP' },
            { status: 500 }
        );
    }
}

// DELETE /api/mcp - Delete an MCP
export async function DELETE(request: NextRequest) {
    try {
        const fs = getFs();
        const url = new URL(request.url);
        const id = url.searchParams.get('id');

        if (!id) {
            return NextResponse.json(
                { error: 'MCP ID is required' },
                { status: 400 }
            );
        }

        await fs.deleteMCP(id);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Failed to delete MCP:', error);
        return NextResponse.json(
            { error: 'Failed to delete MCP' },
            { status: 500 }
        );
    }
}
