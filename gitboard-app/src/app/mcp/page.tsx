import type { Metadata } from 'next';
import { getMCPs, getConfig } from '@/app/actions';
import { MCPClient } from '@/components/MCPClient';
import { formatPageTitle } from '@/lib/title-utils';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
    const config = await getConfig();
    return {
        title: formatPageTitle('MCP Servers', config.project.name),
    };
}

export default async function MCPPage() {
    const mcps = await getMCPs();

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 via-purple-50/30 to-blue-50/20 dark:from-[#0a0a0a] dark:via-purple-950/10 dark:to-blue-950/5 relative">
            {/* Gradient waves background */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-1/2 -left-1/4 w-96 h-96 bg-purple-400/10 dark:bg-purple-600/5 rounded-full blur-3xl"></div>
                <div className="absolute top-1/4 -right-1/4 w-[500px] h-[500px] bg-blue-400/10 dark:bg-blue-600/5 rounded-full blur-3xl"></div>
                <div className="absolute -bottom-1/4 left-1/3 w-[600px] h-[600px] bg-purple-300/10 dark:bg-purple-700/5 rounded-full blur-3xl"></div>
            </div>

            <MCPClient mcps={mcps} />
        </div>
    );
}
