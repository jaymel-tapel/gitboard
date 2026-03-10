import type { TicketContext } from '../context-builder';

/**
 * Build prompt for AI to work on a ticket
 * Includes agent-specific skillset and specialization
 *
 * Note: When used with worktrees, the AI works in an isolated git worktree
 * on a branch named after the ticket ID (e.g., PM-0042). All commits are
 * made to this feature branch, not to main.
 */
export function buildWorkPrompt(context: TicketContext): string {
    const { ticket, repoPath, branchName } = context;

    const acceptanceCriteria =
        ticket.acceptance_criteria.length > 0
            ? ticket.acceptance_criteria
                  .map((ac, i) => `${i + 1}. ${typeof ac === 'string' ? ac : ac.text}`)
                  .join('\n')
            : 'No specific criteria defined';

    // Determine if we're in a worktree context
    const isWorktree = branchName && branchName !== 'main' && branchName !== 'master';

    const worktreeContext = isWorktree
        ? `
You are working in an isolated git worktree on branch '${branchName}'.
All changes will be committed to this feature branch, not to main.
When your work is ready, it can be merged back to the main branch via pull request.
`
        : '';

    return `You are working on ticket ${ticket.id}: ${ticket.title}
${worktreeContext}
Description: ${ticket.description}

Acceptance Criteria:
${acceptanceCriteria}

Instructions:
1. Do the work described above
2. When done, move the ticket: mv gitboard/tickets/doing/${ticket.id}.json gitboard/tickets/done/${ticket.id}.json
3. Add ONLY the files you modified (not everything): git add <specific-files> gitboard/tickets/done/${ticket.id}.json
4. Commit your changes: git commit -m "[gitboard] Complete ${ticket.id}: ${ticket.title}"
5. IMPORTANT: Do NOT use 'git add .' - only add the specific files you created or modified for this ticket

Working directory: ${repoPath}
${isWorktree ? `Branch: ${branchName}` : ''}

Please complete this task now.`.trim();
}
