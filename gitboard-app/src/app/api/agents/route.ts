import { NextRequest, NextResponse } from 'next/server';
import { FileSystemManager } from '@/lib/file-system';
import type { Agent } from '@/lib/schemas';

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

// GET /api/agents - List all AI agents
export async function GET() {
    try {
        const fs = getFs();
        const agentIds = await fs.listAgents();

        // Load full agent data for each ID
        const agents = await Promise.all(
            agentIds.map(async (id) => {
                try {
                    return await fs.readAgent(id);
                } catch {
                    return null;
                }
            })
        );

        // Filter out nulls (failed reads)
        const validAgents = agents.filter(Boolean);

        return NextResponse.json({ agents: validAgents });
    } catch (error) {
        console.error('Failed to fetch agents:', error);
        return NextResponse.json(
            { error: 'Failed to fetch agents' },
            { status: 500 }
        );
    }
}

// POST /api/agents - Create or update an agent
export async function POST(request: NextRequest) {
    try {
        const fs = getFs();
        const agentData = await request.json();

        const now = new Date().toISOString();
        const existing = await fs.readAgent(agentData.id).catch(() => null);

        const agent: Agent = {
            id: agentData.id,
            name: agentData.name,
            description: agentData.description,
            executionType: agentData.executionType || 'cli',
            provider: agentData.provider || 'anthropic',
            ...(agentData.executionType === 'api' && {
                model: agentData.model,
                apiKey: agentData.apiKey,
            }),
            systemPrompt: agentData.systemPrompt,
            createdAt: existing?.createdAt || now,
            updatedAt: now,
        };

        await fs.writeAgent(agent);

        return NextResponse.json({ success: true, agent });
    } catch (error) {
        console.error('Failed to save agent:', error);
        return NextResponse.json(
            { error: 'Failed to save agent' },
            { status: 500 }
        );
    }
}

// DELETE /api/agents/:id - Delete an agent
export async function DELETE(request: NextRequest) {
    try {
        const fs = getFs();
        const url = new URL(request.url);
        const id = url.searchParams.get('id');

        if (!id) {
            return NextResponse.json(
                { error: 'Agent ID is required' },
                { status: 400 }
            );
        }

        await fs.deleteAgent(id);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Failed to delete agent:', error);
        return NextResponse.json(
            { error: 'Failed to delete agent' },
            { status: 500 }
        );
    }
}
