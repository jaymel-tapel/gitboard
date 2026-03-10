import { NextRequest, NextResponse } from 'next/server';
import { validateMCPConfig, validateMCPCommand } from '@/lib/mcp-validator';

export const dynamic = 'force-dynamic';

// POST /api/mcp/validate - Validate an MCP configuration
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { config, testServer = false } = body;

        if (!config) {
            return NextResponse.json(
                { error: 'MCP config is required' },
                { status: 400 }
            );
        }

        const result = await validateMCPConfig(config, testServer);

        return NextResponse.json({
            success: true,
            validation: result,
        });
    } catch (error) {
        console.error('MCP validation error:', error);
        return NextResponse.json(
            { error: 'Failed to validate MCP configuration' },
            { status: 500 }
        );
    }
}

// GET /api/mcp/validate?command=xxx - Quick check if a command exists
export async function GET(request: NextRequest) {
    try {
        const url = new URL(request.url);
        const command = url.searchParams.get('command');

        if (!command) {
            return NextResponse.json(
                { error: 'Command parameter is required' },
                { status: 400 }
            );
        }

        const result = validateMCPCommand(command);

        return NextResponse.json({
            success: true,
            ...result,
        });
    } catch (error) {
        console.error('Command validation error:', error);
        return NextResponse.json(
            { error: 'Failed to validate command' },
            { status: 500 }
        );
    }
}
