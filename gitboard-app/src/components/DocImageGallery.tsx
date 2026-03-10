'use client';

import { useState, useEffect } from 'react';
import type { FileAttachment } from '@/lib/schemas';

interface DocImageGalleryProps {
    docId: string;
}

export function DocImageGallery({ docId }: DocImageGalleryProps) {
    const [files, setFiles] = useState<FileAttachment[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [expandedImage, setExpandedImage] = useState<string | null>(null);

    useEffect(() => {
        async function loadFiles() {
            try {
                const response = await fetch(`/api/files?parent_type=doc&parent_id=${encodeURIComponent(docId)}`);
                if (response.ok) {
                    const data = await response.json();
                    setFiles(data.files || []);
                }
            } catch (err) {
                console.error('Failed to load files:', err);
            } finally {
                setIsLoading(false);
            }
        }
        loadFiles();
    }, [docId]);

    // Filter to only show images
    const imageFiles = files.filter(f => f.mime_type.startsWith('image/'));
    const otherFiles = files.filter(f => !f.mime_type.startsWith('image/'));

    if (isLoading) {
        return null;
    }

    if (files.length === 0) {
        return null;
    }

    return (
        <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-800">
            {/* Images Section */}
            {imageFiles.length > 0 && (
                <div className="mb-6">
                    <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        Images ({imageFiles.length})
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        {imageFiles.map((file) => (
                            <div
                                key={file.id}
                                className="relative group cursor-pointer"
                                onClick={() => setExpandedImage(file.id)}
                            >
                                <div className="aspect-video bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
                                    <img
                                        src={`/api/files/${file.id}`}
                                        alt={file.original_filename}
                                        className="w-full h-full object-cover transition-transform group-hover:scale-105"
                                    />
                                </div>
                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors rounded-lg flex items-center justify-center">
                                    <svg className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                                    </svg>
                                </div>
                                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 truncate">
                                    {file.original_filename}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Other Files Section */}
            {otherFiles.length > 0 && (
                <div>
                    <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                        </svg>
                        Attachments ({otherFiles.length})
                    </h3>
                    <div className="space-y-2">
                        {otherFiles.map((file) => (
                            <a
                                key={file.id}
                                href={`/api/files/${file.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                            >
                                <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                </svg>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">
                                        {file.original_filename}
                                    </p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                        {(file.size_bytes / 1024).toFixed(1)} KB
                                    </p>
                                </div>
                                <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </svg>
                            </a>
                        ))}
                    </div>
                </div>
            )}

            {/* Image Lightbox */}
            {expandedImage && (
                <div
                    className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
                    onClick={() => setExpandedImage(null)}
                >
                    <button
                        className="absolute top-4 right-4 text-white/80 hover:text-white p-2"
                        onClick={() => setExpandedImage(null)}
                    >
                        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                    <img
                        src={`/api/files/${expandedImage}`}
                        alt="Expanded view"
                        className="max-w-full max-h-[90vh] object-contain rounded-lg"
                        onClick={(e) => e.stopPropagation()}
                    />
                </div>
            )}
        </div>
    );
}
