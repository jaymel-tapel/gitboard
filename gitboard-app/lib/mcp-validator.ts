import { execSync, spawn } from 'child_process';
import type { MCPConfig } from '@/lib/schemas';

export interface MCPValidationResult {
    valid: boolean;
    commandExists: boolean;
    serverStarts?: boolean;
    issues: string[];
    suggestions: string[];
}

/**
 * Check if a command exists on PATH
 */
export function validateMCPCommand(command: string): { exists: boolean; path?: string; error?: string } {
    // Handle common command patterns
    const baseCommand = command.split(' ')[0] || command;

    try {
        // Use 'which' on Unix or 'where' on Windows
        const whichCmd = process.platform === 'win32' ? 'where' : 'which';
        const result = execSync(`${whichCmd} ${baseCommand}`, {
            encoding: 'utf-8',
            timeout: 5000,
        }).trim();

        return { exists: true, path: result.split('\n')[0] };
    } catch {
        // Command not found - provide helpful suggestions
        const suggestions: string[] = [];

        if (baseCommand === 'npx') {
            suggestions.push('npx is part of Node.js. Install Node.js from https://nodejs.org');
        } else if (baseCommand === 'node') {
            suggestions.push('Install Node.js from https://nodejs.org');
        } else if (baseCommand === 'python' || baseCommand === 'python3') {
            suggestions.push('Install Python from https://python.org');
        } else if (baseCommand === 'uvx' || baseCommand === 'uv') {
            suggestions.push('Install uv from https://github.com/astral-sh/uv');
        }

        return {
            exists: false,
            error: `Command "${baseCommand}" not found in PATH${suggestions.length > 0 ? '. ' + suggestions[0] : ''}`,
        };
    }
}

/**
 * Attempt to start an MCP server briefly to verify it initializes correctly
 * This spawns the server and waits for initial output or timeout
 */
export async function validateMCPServer(config: Pick<MCPConfig, 'command' | 'args' | 'env'>): Promise<{
    starts: boolean;
    output?: string;
    error?: string;
}> {
    return new Promise((resolve) => {
        const timeout = setTimeout(() => {
            // If we got here without error, server likely started successfully
            if (serverProcess && !serverProcess.killed) {
                serverProcess.kill('SIGTERM');
            }
            resolve({
                starts: true,
                output: stdoutData.substring(0, 500),
            });
        }, 3000);

        let stdoutData = '';
        let stderrData = '';
        let resolved = false;

        const serverProcess = spawn(config.command, config.args || [], {
            env: { ...process.env, ...config.env },
            stdio: ['pipe', 'pipe', 'pipe'],
        });

        serverProcess.stdout.on('data', (data) => {
            stdoutData += data.toString();
        });

        serverProcess.stderr.on('data', (data) => {
            stderrData += data.toString();
        });

        serverProcess.on('error', (err) => {
            if (!resolved) {
                resolved = true;
                clearTimeout(timeout);
                resolve({
                    starts: false,
                    error: err.message,
                });
            }
        });

        serverProcess.on('close', (code) => {
            if (!resolved) {
                resolved = true;
                clearTimeout(timeout);

                if (code !== 0 && code !== null) {
                    resolve({
                        starts: false,
                        error: stderrData || `Process exited with code ${code}`,
                    });
                } else {
                    resolve({
                        starts: true,
                        output: stdoutData.substring(0, 500),
                    });
                }
            }
        });
    });
}

/**
 * Full validation of an MCP configuration
 */
export async function validateMCPConfig(config: Partial<MCPConfig>, testServer = false): Promise<MCPValidationResult> {
    const issues: string[] = [];
    const suggestions: string[] = [];

    // Check required fields
    if (!config.name || config.name.trim() === '') {
        issues.push('MCP name is required');
    }

    if (!config.command || config.command.trim() === '') {
        issues.push('Command is required');
        return {
            valid: false,
            commandExists: false,
            issues,
            suggestions,
        };
    }

    // Validate command exists on PATH
    const commandCheck = validateMCPCommand(config.command);

    if (!commandCheck.exists) {
        issues.push(commandCheck.error || `Command "${config.command}" not found`);
    }

    // Validate args format
    if (config.args && !Array.isArray(config.args)) {
        issues.push('Args must be an array of strings');
    }

    // Validate env format
    if (config.env) {
        if (typeof config.env !== 'object') {
            issues.push('Environment variables must be an object');
        } else {
            // Check for common issues
            for (const [key, value] of Object.entries(config.env)) {
                if (typeof value !== 'string') {
                    issues.push(`Environment variable "${key}" must be a string`);
                }
                if (value === '' || value === 'YOUR_API_KEY_HERE') {
                    suggestions.push(`Environment variable "${key}" appears to be a placeholder - make sure to set the actual value`);
                }
            }
        }
    }

    // Optionally test if server starts
    let serverStarts: boolean | undefined;
    if (testServer && commandCheck.exists && issues.length === 0) {
        const serverCheck = await validateMCPServer({
            command: config.command,
            args: config.args || [],
            env: config.env || {},
        });

        serverStarts = serverCheck.starts;
        if (!serverCheck.starts && serverCheck.error) {
            issues.push(`Server failed to start: ${serverCheck.error}`);
        }
    }

    return {
        valid: issues.length === 0,
        commandExists: commandCheck.exists,
        serverStarts,
        issues,
        suggestions,
    };
}
