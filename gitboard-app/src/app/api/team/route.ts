import { NextResponse } from 'next/server';
import { FileSystemManager } from '@/lib/file-system';
import { getProjectRoot } from '@/lib/get-project-root';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const repoPath = getProjectRoot();
        const fs = new FileSystemManager(repoPath);
        const team = await fs.readTeam();
        return NextResponse.json(team);
    } catch (error) {
        console.error('Failed to fetch team:', error);
        return NextResponse.json(
            { error: 'Failed to fetch team' },
            { status: 500 }
        );
    }
}
