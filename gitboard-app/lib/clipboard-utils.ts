/**
 * Clipboard utilities for handling image paste functionality
 */

import { MAX_FILE_SIZE_BYTES, ALLOWED_MIME_TYPES_LIST } from './schemas';

/**
 * Allowed image MIME types for paste operations
 */
export const ALLOWED_IMAGE_MIME_TYPES = [
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp',
] as const;

/**
 * Map of MIME types to file extensions for generating filenames
 */
const MIME_TYPE_EXTENSIONS: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
};

/**
 * Check if a MIME type is an allowed image type for paste operations
 */
export function isAllowedImageMimeType(mimeType: string): boolean {
    return ALLOWED_IMAGE_MIME_TYPES.includes(mimeType as typeof ALLOWED_IMAGE_MIME_TYPES[number]);
}

/**
 * Generate a unique filename for a pasted image
 * @param mimeType The MIME type of the image
 * @returns A unique filename like "pasted-image-1704067200000.png"
 */
export function generatePastedImageFilename(mimeType: string): string {
    const extension = MIME_TYPE_EXTENSIONS[mimeType] || 'png';
    return `pasted-image-${Date.now()}.${extension}`;
}

/**
 * Result of extracting images from clipboard
 */
export interface ClipboardImageResult {
    /** Successfully extracted image files with generated filenames */
    files: File[];
    /** Error messages for rejected files */
    errors: string[];
    /** Whether any images were found in the clipboard */
    hasImages: boolean;
}

/**
 * Extract image files from a clipboard paste event
 *
 * This function:
 * - Filters clipboard items for image files only
 * - Validates file size (5MB limit)
 * - Validates MIME type against allowed image types
 * - Generates unique filenames for pasted images
 *
 * @param clipboardData The clipboard data from a paste event
 * @returns Object containing extracted files, errors, and whether images were found
 */
export function extractImagesFromClipboard(clipboardData: DataTransfer | null): ClipboardImageResult {
    const result: ClipboardImageResult = {
        files: [],
        errors: [],
        hasImages: false,
    };

    if (!clipboardData || !clipboardData.files || clipboardData.files.length === 0) {
        return result;
    }

    const files = clipboardData.files;

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file) continue;

        // Check if it's an image type (skip non-images)
        if (!file.type.startsWith('image/')) {
            continue;
        }

        // Mark that we found at least one image
        result.hasImages = true;

        // Validate MIME type
        if (!isAllowedImageMimeType(file.type)) {
            result.errors.push(`Unsupported image type: ${file.type}. Allowed types: PNG, JPEG, GIF, WebP`);
            continue;
        }

        // Validate file size
        if (file.size > MAX_FILE_SIZE_BYTES) {
            const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
            result.errors.push(`Pasted image (${sizeMB}MB) exceeds 5MB limit`);
            continue;
        }

        // Generate a unique filename for the pasted image
        const filename = generatePastedImageFilename(file.type);

        // Create a new File object with the generated filename
        const renamedFile = new File([file], filename, {
            type: file.type,
            lastModified: Date.now(),
        });

        result.files.push(renamedFile);
    }

    return result;
}

/**
 * Handle a paste event and extract images
 *
 * This is a convenience wrapper that:
 * - Extracts images from the paste event
 * - Only calls preventDefault if images were found
 * - Returns the extraction result
 *
 * @param event The React clipboard event
 * @returns The clipboard image extraction result
 */
export function handleImagePaste(event: React.ClipboardEvent): ClipboardImageResult {
    const result = extractImagesFromClipboard(event.clipboardData);

    // Only prevent default if we found images (allow text paste to work normally)
    if (result.hasImages) {
        event.preventDefault();
    }

    return result;
}
