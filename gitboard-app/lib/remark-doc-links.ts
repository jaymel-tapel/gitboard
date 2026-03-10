import { visit } from 'unist-util-visit';

// Type definitions for mdast nodes
interface Root {
    type: 'root';
    children: any[];
}

interface Text {
    type: 'text';
    value: string;
}

interface DocPage {
    slug: string;
    title: string;
    folder: string;
}

// Regex to match [[doc links]]
const docLinkRegex = /\[\[([^\]]+)\]\]/g;

function getPageUrl(page: DocPage): string {
    if (page.folder) {
        return `/docs/${page.folder}/${page.slug}`;
    }
    return `/docs/${page.slug}`;
}

export function remarkDocLinks(pages: DocPage[]) {
    return () => {
        return (tree: Root) => {
            visit(tree, 'text', (node: Text, index, parent) => {
                if (!parent || index === undefined) return;

                const matches = Array.from(node.value.matchAll(docLinkRegex));
                if (matches.length === 0) return;

                const children: (Text | { type: 'link'; url: string; children: [Text] })[] = [];
                let lastIndex = 0;

                for (const match of matches) {
                    const [fullMatch, linkText] = match;
                    if (!linkText) continue;

                    const matchIndex = match.index!;

                    // Add text before the match
                    if (matchIndex > lastIndex) {
                        children.push({
                            type: 'text',
                            value: node.value.slice(lastIndex, matchIndex),
                        });
                    }

                    // Find the page - match by slug or title (case-insensitive)
                    const searchTerm = linkText.toLowerCase().trim();
                    const linkedPage = pages.find(
                        (p) =>
                            p.slug.toLowerCase() === searchTerm ||
                            p.title.toLowerCase() === searchTerm ||
                            // Also try converting title to slug format
                            p.slug === searchTerm.replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
                    );

                    if (linkedPage) {
                        // Create a link node
                        children.push({
                            type: 'link',
                            url: getPageUrl(linkedPage),
                            children: [{ type: 'text', value: linkedPage.title }],
                        });
                    } else {
                        // Page not found - render as broken link
                        children.push({
                            type: 'link',
                            url: `/docs/new?title=${encodeURIComponent(linkText)}`,
                            children: [{ type: 'text', value: `${linkText} (create)` }],
                        });
                    }

                    lastIndex = matchIndex + fullMatch.length;
                }

                // Add remaining text
                if (lastIndex < node.value.length) {
                    children.push({
                        type: 'text',
                        value: node.value.slice(lastIndex),
                    });
                }

                // Replace the text node with our new nodes
                parent.children.splice(index, 1, ...children as any);
            });
        };
    };
}
