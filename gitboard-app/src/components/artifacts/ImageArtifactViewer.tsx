'use client';

import { useState } from 'react';
import type { ImageArtifact } from '@/lib/schemas';

interface ImageArtifactViewerProps {
    artifact: ImageArtifact;
}

/**
 * ImageArtifactViewer - Displays image artifacts with zoom capability
 *
 * Stub implementation for future image artifact support.
 */
export function ImageArtifactViewer({ artifact }: ImageArtifactViewerProps) {
    const [isZoomed, setIsZoomed] = useState(false);
    const { content } = artifact;

    return (
        <div className="p-4">
            {/* Image container */}
            <div
                className={`relative rounded-lg overflow-hidden bg-gray-800 border border-gray-700 cursor-zoom-in ${
                    isZoomed ? 'cursor-zoom-out' : 'cursor-zoom-in'
                }`}
                onClick={() => setIsZoomed(!isZoomed)}
            >
                <img
                    src={content.url}
                    alt={content.alt}
                    className={`w-full h-auto transition-transform duration-300 ${
                        isZoomed ? 'scale-150' : 'scale-100'
                    }`}
                    style={{
                        maxWidth: content.width ? `${content.width}px` : undefined,
                        maxHeight: content.height ? `${content.height}px` : undefined,
                    }}
                />
            </div>

            {/* Image info */}
            <div className="mt-4 space-y-2">
                {content.alt && (
                    <p className="text-sm text-gray-300">
                        <span className="text-gray-500">Alt text:</span> {content.alt}
                    </p>
                )}
                {(content.width || content.height) && (
                    <p className="text-sm text-gray-400">
                        {content.width && content.height
                            ? `${content.width} x ${content.height} px`
                            : content.width
                            ? `Width: ${content.width}px`
                            : `Height: ${content.height}px`}
                    </p>
                )}
            </div>

            {/* Zoom hint */}
            <p className="mt-4 text-xs text-gray-500 text-center">
                Click image to {isZoomed ? 'zoom out' : 'zoom in'}
            </p>
        </div>
    );
}
