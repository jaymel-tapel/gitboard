import { NextRequest, NextResponse } from 'next/server';

// Simple HTML to text converter
function htmlToText(html: string): string {
    // Remove scripts and styles
    let text = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');

    // Replace common block elements with newlines
    text = text.replace(/<\/?(div|p|br|h[1-6]|li|tr|section|article|header|footer)[^>]*>/gi, '\n');

    // Remove all other HTML tags
    text = text.replace(/<[^>]+>/g, '');

    // Decode HTML entities
    text = text.replace(/&nbsp;/g, ' ');
    text = text.replace(/&amp;/g, '&');
    text = text.replace(/&lt;/g, '<');
    text = text.replace(/&gt;/g, '>');
    text = text.replace(/&quot;/g, '"');
    text = text.replace(/&#39;/g, "'");
    text = text.replace(/&#x27;/g, "'");
    text = text.replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)));

    // Clean up whitespace
    text = text.replace(/[ \t]+/g, ' ');
    text = text.replace(/\n\s*\n/g, '\n\n');
    text = text.trim();

    return text;
}

// Validate URL format and security
function validateUrl(urlString: string): { valid: boolean; error?: string; url?: URL } {
    try {
        const url = new URL(urlString);

        // Only allow http and https protocols
        if (!['http:', 'https:'].includes(url.protocol)) {
            return { valid: false, error: 'Only HTTP and HTTPS URLs are allowed' };
        }

        // Block localhost and private IP ranges for security
        const hostname = url.hostname.toLowerCase();
        if (
            hostname === 'localhost' ||
            hostname === '127.0.0.1' ||
            hostname.startsWith('192.168.') ||
            hostname.startsWith('10.') ||
            hostname.startsWith('172.16.') ||
            hostname.endsWith('.local')
        ) {
            return { valid: false, error: 'Local and private network URLs are not allowed' };
        }

        return { valid: true, url };
    } catch {
        return { valid: false, error: 'Invalid URL format' };
    }
}

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const urlParam = searchParams.get('url');

    if (!urlParam) {
        return NextResponse.json(
            { error: 'URL parameter is required' },
            { status: 400 }
        );
    }

    // Validate URL
    const validation = validateUrl(urlParam);
    if (!validation.valid) {
        return NextResponse.json(
            { error: validation.error },
            { status: 400 }
        );
    }

    try {
        // Fetch with timeout (10 seconds)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(urlParam, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'GitBoard/1.0 (Context Fetcher)',
                'Accept': 'text/html, text/plain, application/json, */*',
            },
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            return NextResponse.json(
                { error: `Failed to fetch URL: HTTP ${response.status} ${response.statusText}` },
                { status: 502 }
            );
        }

        const contentType = response.headers.get('content-type') || '';
        const rawContent = await response.text();

        let content: string;
        let format: 'text' | 'html' | 'json' | 'markdown';

        // Determine content type and process accordingly
        if (contentType.includes('application/json')) {
            // Pretty-print JSON
            try {
                const json = JSON.parse(rawContent);
                content = JSON.stringify(json, null, 2);
                format = 'json';
            } catch {
                content = rawContent;
                format = 'text';
            }
        } else if (contentType.includes('text/markdown') || urlParam.endsWith('.md')) {
            // Keep markdown as-is
            content = rawContent;
            format = 'markdown';
        } else if (contentType.includes('text/html')) {
            // Convert HTML to text
            content = htmlToText(rawContent);
            format = 'html';
        } else {
            // Plain text or other formats
            content = rawContent;
            format = 'text';
        }

        // Truncate if too long (max 100KB of text content)
        const maxLength = 100 * 1024;
        const truncated = content.length > maxLength;
        if (truncated) {
            content = content.substring(0, maxLength) + '\n\n[Content truncated...]';
        }

        return NextResponse.json({
            url: urlParam,
            content,
            format,
            contentType,
            truncated,
            length: content.length,
        });
    } catch (error) {
        if (error instanceof Error) {
            if (error.name === 'AbortError') {
                return NextResponse.json(
                    { error: 'Request timed out (10s limit)' },
                    { status: 504 }
                );
            }
            return NextResponse.json(
                { error: `Failed to fetch URL: ${error.message}` },
                { status: 502 }
            );
        }
        return NextResponse.json(
            { error: 'An unexpected error occurred' },
            { status: 500 }
        );
    }
}

// Also support POST for batch fetching multiple URLs
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { urls } = body;

        if (!Array.isArray(urls) || urls.length === 0) {
            return NextResponse.json(
                { error: 'urls array is required' },
                { status: 400 }
            );
        }

        // Limit to 10 URLs at a time
        if (urls.length > 10) {
            return NextResponse.json(
                { error: 'Maximum 10 URLs allowed per request' },
                { status: 400 }
            );
        }

        // Fetch all URLs in parallel with individual error handling
        const results = await Promise.all(
            urls.map(async (url: string) => {
                const validation = validateUrl(url);
                if (!validation.valid) {
                    return { url, error: validation.error, success: false };
                }

                try {
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 10000);

                    const response = await fetch(url, {
                        signal: controller.signal,
                        headers: {
                            'User-Agent': 'GitBoard/1.0 (Context Fetcher)',
                            'Accept': 'text/html, text/plain, application/json, */*',
                        },
                    });

                    clearTimeout(timeoutId);

                    if (!response.ok) {
                        return {
                            url,
                            error: `HTTP ${response.status}`,
                            success: false,
                        };
                    }

                    const contentType = response.headers.get('content-type') || '';
                    const rawContent = await response.text();

                    let content: string;
                    if (contentType.includes('text/html')) {
                        content = htmlToText(rawContent);
                    } else {
                        content = rawContent;
                    }

                    // Truncate long content
                    const maxLength = 50 * 1024; // 50KB per URL in batch mode
                    if (content.length > maxLength) {
                        content = content.substring(0, maxLength) + '\n\n[Content truncated...]';
                    }

                    return {
                        url,
                        content,
                        success: true,
                    };
                } catch (error) {
                    return {
                        url,
                        error: error instanceof Error ? error.message : 'Unknown error',
                        success: false,
                    };
                }
            })
        );

        return NextResponse.json({ results });
    } catch (error) {
        return NextResponse.json(
            { error: 'Invalid request body' },
            { status: 400 }
        );
    }
}
