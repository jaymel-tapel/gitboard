'use client';

import { useEffect, useState } from 'react';
import { getConfig } from '@/app/actions';
import { formatPageTitle } from '@/lib/title-utils';

/**
 * Custom hook for setting dynamic page titles in client components.
 *
 * This hook fetches the project configuration and updates document.title
 * using the formatPageTitle utility for consistent title formatting.
 *
 * @param pageName - The name of the current page (e.g., "New Document", "Edit: My Doc")
 *
 * @example
 * // In a client component:
 * usePageTitle('New Document');
 * // Sets title to "New Document - Project Name | GitBoard"
 *
 * @example
 * // With dynamic title:
 * usePageTitle(`Edit: ${documentTitle}`);
 * // Sets title to "Edit: My Doc - Project Name | GitBoard"
 */
export function usePageTitle(pageName: string): void {
    const [projectName, setProjectName] = useState<string | undefined>(undefined);

    // Fetch project name on mount
    useEffect(() => {
        async function fetchConfig() {
            try {
                const config = await getConfig();
                setProjectName(config.project.name);
            } catch (error) {
                console.error('Failed to fetch config for page title:', error);
            }
        }
        fetchConfig();
    }, []);

    // Update document title when pageName or projectName changes
    useEffect(() => {
        document.title = formatPageTitle(pageName, projectName);
    }, [pageName, projectName]);
}
