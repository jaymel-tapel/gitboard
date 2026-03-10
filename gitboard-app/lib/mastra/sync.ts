/**
 * Document Sync Module
 *
 * Handles syncing documents to the vector store with:
 * - MDocument text chunking
 * - Regeneration logic (re-syncing replaces all existing chunks for a fileName)
 */

import { MDocument } from '@mastra/rag';
import {
    vectorStore,
    VECTOR_INDEX_NAME,
    generateEmbeddings,
    initializeVectorStore,
} from './index';

export interface SyncResult {
    success: boolean;
    fileName: string;
    chunksCreated: number;
    error?: string;
}

export interface DocumentChunk {
    id: string;
    text: string;
    metadata: {
        fileName: string;
        chunkIndex: number;
        totalChunks: number;
    };
}

/**
 * Generate a unique ID for a document chunk
 */
function generateChunkId(fileName: string, chunkIndex: number): string {
    // Create a deterministic ID based on fileName and chunk index
    return `${fileName.replace(/[^a-zA-Z0-9]/g, '_')}_chunk_${chunkIndex}`;
}

/**
 * Sync a document to the vector store
 *
 * This function:
 * 1. Chunks the document content using MDocument
 * 2. Deletes any existing chunks for this fileName (regeneration logic)
 * 3. Generates embeddings for all chunks
 * 4. Upserts the new chunks to the vector store
 *
 * @param fileName - The name/path of the document
 * @param content - The document content (markdown text)
 */
export async function syncDocument(
    fileName: string,
    content: string
): Promise<SyncResult> {
    try {
        // Ensure vector store is initialized
        await initializeVectorStore();

        // Skip empty content
        if (!content || content.trim().length === 0) {
            return {
                success: true,
                fileName,
                chunksCreated: 0,
            };
        }

        // Create MDocument from markdown content
        const doc = MDocument.fromMarkdown(content);

        // Chunk the document using markdown-aware strategy
        const chunks = await doc.chunk({
            strategy: 'markdown',
            maxSize: 512,
            overlap: 50,
        });

        if (chunks.length === 0) {
            return {
                success: true,
                fileName,
                chunksCreated: 0,
            };
        }

        // Delete existing chunks for this fileName (regeneration logic)
        try {
            await vectorStore.deleteVectors({
                indexName: VECTOR_INDEX_NAME,
                filter: {
                    fileName: fileName,
                },
            });
            console.log(`[Sync] Deleted existing chunks for: ${fileName}`);
        } catch (error) {
            // Ignore errors if no vectors exist yet
            console.log(`[Sync] No existing chunks found for: ${fileName}`);
        }

        // Prepare chunk texts for embedding
        const chunkTexts = chunks.map((chunk) => chunk.text);

        // Generate embeddings for all chunks
        const embeddings = await generateEmbeddings(chunkTexts);

        // Prepare vectors for upserting
        const ids = chunks.map((_, index) => generateChunkId(fileName, index));
        const metadata = chunks.map((chunk, index) => ({
            fileName,
            chunkIndex: index,
            totalChunks: chunks.length,
            text: chunk.text,
        }));

        // Upsert chunks to vector store
        await vectorStore.upsert({
            indexName: VECTOR_INDEX_NAME,
            vectors: embeddings,
            ids,
            metadata,
        });

        console.log(`[Sync] Synced ${chunks.length} chunks for: ${fileName}`);

        return {
            success: true,
            fileName,
            chunksCreated: chunks.length,
        };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[Sync] Error syncing document ${fileName}:`, error);
        return {
            success: false,
            fileName,
            chunksCreated: 0,
            error: errorMessage,
        };
    }
}

/**
 * Remove a document from the vector store
 *
 * @param fileName - The name/path of the document to remove
 */
export async function removeDocument(fileName: string): Promise<boolean> {
    try {
        await vectorStore.deleteVectors({
            indexName: VECTOR_INDEX_NAME,
            filter: {
                fileName: fileName,
            },
        });
        console.log(`[Sync] Removed document from vector store: ${fileName}`);
        return true;
    } catch (error) {
        console.error(`[Sync] Error removing document ${fileName}:`, error);
        return false;
    }
}

/**
 * Sync multiple documents in batch
 */
export async function syncDocuments(
    documents: Array<{ fileName: string; content: string }>
): Promise<SyncResult[]> {
    const results: SyncResult[] = [];
    for (const doc of documents) {
        const result = await syncDocument(doc.fileName, doc.content);
        results.push(result);
    }
    return results;
}
