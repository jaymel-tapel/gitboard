import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function POST(request: NextRequest) {
    const { name, description } = await request.json();

    if (!name || typeof name !== 'string') {
        return NextResponse.json({ error: 'Missing or invalid agent name' }, { status: 400 });
    }

    try {
        // Construct the prompt for Claude
        const prompt = `Generate a system prompt for an AI agent with these details:

Name: ${name}
Description: ${description || 'A helpful AI assistant'}

Create a concise system prompt (2-3 paragraphs) that defines:
1. The agent's role and expertise
2. Key responsibilities and focus areas
3. Communication style and approach
4. Any relevant guidelines or constraints

Output ONLY the system prompt text, no preamble.`;

        // Find claude CLI path
        const { stdout: claudePath } = await execAsync('which claude');
        const cleanPath = claudePath.trim();

        // Use echo to pipe prompt to claude --print
        const { stdout, stderr } = await execAsync(
            `echo "${prompt.replace(/"/g, '\\"').replace(/\n/g, ' ')}" | ${cleanPath} --print`,
            {
                env: process.env,
                maxBuffer: 1024 * 1024 * 10, // 10MB buffer
                timeout: 300000, // 5 minutes timeout
            }
        );

        if (stderr && !stderr.includes('Streaming')) {
            console.error('Claude stderr:', stderr);
        }

        const systemPrompt = stdout.trim();

        if (!systemPrompt) {
            throw new Error('Claude returned empty response');
        }

        return NextResponse.json({ systemPrompt });
    } catch (error: any) {
        console.error('Error generating system prompt:', error);
        return NextResponse.json(
            { error: 'Failed to generate system prompt', details: error.message },
            { status: 500 }
        );
    }
}
