/**
 * Search Module
 *
 * Provides functions to query the vector store for relevant document chunks
 * using semantic similarity search.
 */

import {
    vectorStore,
    VECTOR_INDEX_NAME,
    generateEmbedding,
    initializeVectorStore,
} from './index';

export interface SearchResult {
    text: string;
    fileName: string;
    chunkIndex: number;
    score: number;
}

export interface SearchOptions {
    topK?: number;
    minScore?: number;
}

/**
 * Search for relevant document chunks based on a query
 *
 * @param query - The search query text
 * @param options - Search options (topK, minScore)
 * @returns Array of relevant document chunks with similarity scores
 */
export async function searchDocs(
    query: string,
    options: SearchOptions = {}
): Promise<SearchResult[]> {
    const { topK = 5, minScore = 0.3 } = options;

    try {
        // Ensure vector store is initialized
        await initializeVectorStore();

        // Generate embedding for the query
        const queryEmbedding = await generateEmbedding(query);

        // Query the vector store
        const results = await vectorStore.query({
            indexName: VECTOR_INDEX_NAME,
            queryVector: queryEmbedding,
            topK,
            minScore,
            includeVector: false,
        });

        // Transform results to SearchResult format
        return results.map((result) => ({
            text: result.metadata?.text as string || '',
            fileName: result.metadata?.fileName as string || 'unknown',
            chunkIndex: result.metadata?.chunkIndex as number || 0,
            score: result.score || 0,
        }));
    } catch (error) {
        console.error('[Search] Error searching docs:', error);
        return [];
    }
}

/**
 * Get context for a chat query by searching relevant documents
 *
 * @param query - The user's question/query
 * @param maxChunks - Maximum number of chunks to retrieve
 * @returns Formatted context string for the AI
 */
export async function getContextForQuery(
    query: string,
    maxChunks: number = 5
): Promise<string> {
    const results = await searchDocs(query, { topK: maxChunks, minScore: 0.25 });

    if (results.length === 0) {
        return 'No relevant documentation found.';
    }

    // Format the context with source information
    const contextParts = results.map((result, index) => {
        return `[Source: ${result.fileName}]\n${result.text}`;
    });

    return contextParts.join('\n\n---\n\n');
}

/**
 * Get sources referenced in the search results
 */
export function getSourcesFromResults(results: SearchResult[]): string[] {
    const sources = new Set<string>();
    for (const result of results) {
        sources.add(result.fileName);
    }
    return Array.from(sources);
}
