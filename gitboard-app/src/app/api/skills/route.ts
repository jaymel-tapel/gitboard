import { NextRequest, NextResponse } from 'next/server';
import { FileSystemManager } from '@/lib/file-system';
import type { Skill } from '@/lib/schemas';

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

// GET /api/skills - List all skills
export async function GET() {
    try {
        const fs = getFs();
        const skillIds = await fs.listSkills();

        // Load full skill data for each ID
        const skills = await Promise.all(
            skillIds.map(async (id) => {
                try {
                    return await fs.readSkill(id);
                } catch {
                    return null;
                }
            })
        );

        // Filter out nulls (failed reads)
        const validSkills = skills.filter(Boolean);

        return NextResponse.json({ skills: validSkills });
    } catch (error) {
        console.error('Failed to fetch skills:', error);
        return NextResponse.json(
            { error: 'Failed to fetch skills' },
            { status: 500 }
        );
    }
}

// POST /api/skills - Create or update a skill
export async function POST(request: NextRequest) {
    try {
        const fs = getFs();
        const skillData = await request.json();

        const now = new Date().toISOString();
        const existing = await fs.readSkill(skillData.id).catch(() => null);

        const skill: Skill = {
            id: skillData.id,
            name: skillData.name,
            description: skillData.description,
            license: skillData.license,
            version: skillData.version,
            compatibility: skillData.compatibility,
            instructions: skillData.instructions || '',
            metadata: {
                created_at: existing?.metadata.created_at || now,
                updated_at: now,
                created_by: existing?.metadata.created_by || 'GitBoard User',
                updated_by: 'GitBoard User',
            },
        };

        await fs.writeSkill(skill);

        return NextResponse.json({ success: true, skill });
    } catch (error) {
        console.error('Failed to save skill:', error);
        return NextResponse.json(
            { error: 'Failed to save skill' },
            { status: 500 }
        );
    }
}

// DELETE /api/skills - Delete a skill
export async function DELETE(request: NextRequest) {
    try {
        const fs = getFs();
        const url = new URL(request.url);
        const id = url.searchParams.get('id');

        if (!id) {
            return NextResponse.json(
                { error: 'Skill ID is required' },
                { status: 400 }
            );
        }

        await fs.deleteSkill(id);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Failed to delete skill:', error);
        return NextResponse.json(
            { error: 'Failed to delete skill' },
            { status: 500 }
        );
    }
}
