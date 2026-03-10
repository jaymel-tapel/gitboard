import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';

export const dynamic = 'force-dynamic';

/**
 * POST /api/skills/generate - Generate skill instructions with AI
 * Fallback endpoint for non-socket.io usage
 */
export async function POST(request: NextRequest) {
    try {
        const { name, description, useCase } = await request.json();

        if (!name) {
            return NextResponse.json(
                { error: 'Skill name is required' },
                { status: 400 }
            );
        }

        const prompt = `Generate comprehensive skill instructions for an AI agent skill with the following details:

Name: ${name}
${description ? `Description: ${description}` : ''}
${useCase ? `Use Case: ${useCase}` : ''}

Create detailed markdown instructions that include:
1. When the skill should be used (triggers/conditions)
2. Step-by-step instructions for the AI to follow
3. Examples of input/output
4. Best practices and considerations
5. Edge cases to handle

Output ONLY the markdown instructions, no preamble or explanation.`;

        const systemPrompt = 'You are an expert at writing clear, actionable instructions for AI agents. Your instructions should be comprehensive yet concise, and include practical examples.';

        return new Promise<NextResponse>((resolve) => {
            const claudePath = 'claude';
            const args = ['--print', prompt, '--system-prompt', systemPrompt];

            const claude = spawn(claudePath, args, {
                env: process.env,
                stdio: ['pipe', 'pipe', 'pipe']
            });

            claude.stdin.end();

            let output = '';
            let errorOutput = '';

            claude.stdout.on('data', (data) => {
                output += data.toString();
            });

            claude.stderr.on('data', (data) => {
                errorOutput += data.toString();
            });

            claude.on('close', (code) => {
                if (code !== 0) {
                    console.error('Claude error:', errorOutput);
                    resolve(NextResponse.json(
                        { error: 'Failed to generate instructions' },
                        { status: 500 }
                    ));
                    return;
                }

                resolve(NextResponse.json({
                    success: true,
                    instructions: output.trim()
                }));
            });

            claude.on('error', (error) => {
                console.error('Claude spawn error:', error);
                resolve(NextResponse.json(
                    { error: 'Failed to spawn Claude CLI' },
                    { status: 500 }
                ));
            });
        });
    } catch (error) {
        console.error('Failed to generate skill:', error);
        return NextResponse.json(
            { error: 'Failed to generate skill' },
            { status: 500 }
        );
    }
}
