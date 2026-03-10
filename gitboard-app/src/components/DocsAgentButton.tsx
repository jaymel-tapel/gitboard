'use client'

export interface DocContext {
    title?: string;
    folder?: string;
    slug?: string;
}

interface DocsAgentButtonProps {
    docContext?: DocContext;
}

export function DocsAgentButton({ docContext }: DocsAgentButtonProps = {}) {
    return (
        <button
            onClick={() => {
                const event = new CustomEvent('toggleDocsAgent', { detail: docContext || null });
                window.dispatchEvent(event);
            }}
            className="px-4 py-2 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors flex items-center gap-2"
            aria-label="Open Docs Agent chat"
        >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
            Docs Agent
        </button>
    );
}
