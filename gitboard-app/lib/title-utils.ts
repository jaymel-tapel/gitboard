/**
 * Utility functions for formatting page titles in the browser tab.
 *
 * Title format follows the pattern:
 * - "Page - Project Name | GitBoard" when project name is configured
 * - "Page | GitBoard" when project name is not set or empty
 */

const SITE_NAME = 'GitBoard';

/**
 * Formats a page title for the browser tab.
 *
 * @param pageName - The name of the current page (e.g., "Dashboard", "Board")
 * @param projectName - Optional project name from config.project.name
 * @returns Formatted title string
 *
 * @example
 * formatPageTitle("Dashboard", "Git-Board") // "Dashboard - Git-Board | GitBoard"
 * formatPageTitle("Dashboard", "") // "Dashboard | GitBoard"
 * formatPageTitle("Dashboard") // "Dashboard | GitBoard"
 */
export function formatPageTitle(pageName: string, projectName?: string): string {
    if (projectName && projectName.trim()) {
        return `${pageName} - ${projectName} | ${SITE_NAME}`;
    }
    return `${pageName} | ${SITE_NAME}`;
}
