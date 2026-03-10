/**
 * Storage Module
 *
 * Provides a factory function to get the appropriate storage provider
 * based on configuration. Currently supports local filesystem storage,
 * with the interface designed to support S3 in the future.
 */

export * from './storage-provider';
export * from './local-storage-provider';

import type { StorageProvider } from './storage-provider';
import { LocalStorageProvider } from './local-storage-provider';

/**
 * Storage provider type enum
 */
export type StorageProviderType = 'local' | 's3';

/**
 * Configuration for storage provider
 */
export interface StorageConfig {
    type: StorageProviderType;
    // Future S3 config options would go here:
    // s3Bucket?: string;
    // s3Region?: string;
    // s3AccessKeyId?: string;
    // s3SecretAccessKey?: string;
}

/**
 * Get a storage provider instance based on configuration
 *
 * Currently returns LocalStorageProvider. When S3 support is added,
 * this function will check the config and return the appropriate provider.
 *
 * @param repoPath - The repository root path
 * @param config - Optional storage configuration (defaults to local)
 * @returns A storage provider instance
 */
export function getStorageProvider(
    repoPath: string,
    config?: StorageConfig
): StorageProvider {
    const providerType = config?.type || 'local';

    switch (providerType) {
        case 'local':
            return new LocalStorageProvider(repoPath);

        case 's3':
            // Future: return new S3StorageProvider(config)
            throw new Error(
                'S3 storage provider is not yet implemented. Please use local storage.'
            );

        default:
            throw new Error(`Unknown storage provider type: ${providerType}`);
    }
}

/**
 * Default storage provider type
 */
export const DEFAULT_STORAGE_PROVIDER: StorageProviderType = 'local';
