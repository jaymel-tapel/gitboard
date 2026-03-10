/**
 * Mastra Configuration for Docs Agent Chatbot
 *
 * This module initializes Mastra with:
 * - libSQL vector store for document embeddings (file:local_memory.db)
 * - Ollama embeddings using 'nomic-embed-text' model (direct API)
 */

import { LibSQLVector } from '@mastra/libsql';

// Vector store configuration
export const VECTOR_INDEX_NAME = 'docs_embeddings';
export const VECTOR_DIMENSION = 768; // nomic-embed-text uses 768 dimensions

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';

// Initialize libSQL vector store with local file database
export const vectorStore = new LibSQLVector({
    id: 'docs-vector-store',
    url: 'file:local_memory.db',
});

/**
 * Generate embeddings for text content using Ollama's nomic-embed-text model
 * Tries /api/embed (Ollama 0.4+) first, falls back to /api/embeddings.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
    // Try new /api/embed endpoint first
    let response = await fetch(`${OLLAMA_BASE_URL}/api/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'nomic-embed-text', input: text }),
    });

    if (response.ok) {
        const data = await response.json();
        return data.embeddings[0];
    }

    // Fallback to older /api/embeddings endpoint
    response = await fetch(`${OLLAMA_BASE_URL}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'nomic-embed-text', prompt: text }),
    });

    if (!response.ok) {
        throw new Error(`Ollama embed failed: ${response.statusText}`);
    }

    const data = await response.json();
    return data.embedding;
}

/**
 * Generate embeddings for multiple texts
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
    // Try batch with /api/embed first
    let response = await fetch(`${OLLAMA_BASE_URL}/api/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'nomic-embed-text', input: texts }),
    });

    if (response.ok) {
        const data = await response.json();
        return data.embeddings;
    }

    // Fallback: call /api/embeddings one by one
    const results: number[][] = [];
    for (const text of texts) {
        const embedding = await generateEmbedding(text);
        results.push(embedding);
    }
    return results;
}

/**
 * Initialize the vector store index if it doesn't exist
 */
export async function initializeVectorStore(): Promise<void> {
    try {
        const indexes = await vectorStore.listIndexes();
        if (!indexes.includes(VECTOR_INDEX_NAME)) {
            await vectorStore.createIndex({
                indexName: VECTOR_INDEX_NAME,
                dimension: VECTOR_DIMENSION,
                metric: 'cosine',
            });
            console.log(`[Mastra] Created vector index: ${VECTOR_INDEX_NAME}`);
        }
    } catch (error) {
        console.error('[Mastra] Error initializing vector store:', error);
        throw error;
    }
}

// Export types
export type { LibSQLVector };
