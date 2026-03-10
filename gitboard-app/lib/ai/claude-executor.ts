import { spawn } from 'child_process';

export interface ClaudeExecutionResult {
    success: boolean;
    output: string;
    error?: string;
}

/**
 * Executor for Claude CLI
 *
 * Spawns Claude CLI processes to execute tasks autonomously
 * Supports multiple profiles for different AI agents
 */
export class ClaudeExecutor {
    constructor(
        private repoPath: string,
        private profile?: string
    ) {}

    /**
     * Execute a task using Claude CLI
     *
     * @param prompt - The prompt to send to Claude
     */
    async execute(prompt: string): Promise<ClaudeExecutionResult> {
        try {
            const args: string[] = [];

            if (this.profile) {
                args.push('--profile', this.profile);
                console.log(`🤖 Using Claude profile: ${this.profile}`);
            }

            console.log(`\n📝 Executing command:`);
            console.log(`   claude ${args.join(' ')}`);
            console.log(`\n📄 Prompt length: ${prompt.length} characters`);
            console.log(`\n📁 Working directory: ${this.repoPath}\n`);

            const claude = spawn('claude', args, {
                cwd: this.repoPath,
                stdio: ['pipe', 'pipe', 'pipe'],
            });

            claude.stdin.write(prompt);
            claude.stdin.end();

            let output = '';
            let error = '';

            claude.stdout.on('data', (data) => {
                output += data.toString();
                process.stdout.write(data);
            });

            claude.stderr.on('data', (data) => {
                error += data.toString();
                process.stderr.write(data);
            });

            const exitCode = await new Promise<number>((resolve, reject) => {
                claude.on('close', (code) => {
                    resolve(code || 0);
                });

                claude.on('error', (err) => {
                    reject(err);
                });
            });

            return {
                success: exitCode === 0,
                output,
                error: error || undefined,
            };
        } catch (err) {
            const errorMessage = (err as Error).message;

            if (
                errorMessage.includes('ENOENT') ||
                errorMessage.includes('not found')
            ) {
                return {
                    success: false,
                    output: '',
                    error:
                        'Claude CLI not found. Install it with: npm install -g @anthropic-ai/claude-cli',
                };
            }

            return {
                success: false,
                output: '',
                error: errorMessage,
            };
        }
    }
}
