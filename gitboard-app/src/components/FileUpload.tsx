'use client'

import { useState, useRef, useCallback } from 'react'
import type { FileAttachment, ParentType } from '@/lib/schemas'
import { ALLOWED_EXTENSIONS, MAX_FILE_SIZE_BYTES } from '@/lib/schemas'

interface FileUploadProps {
    parentType: ParentType
    parentId: string
    files: FileAttachment[]
    onFilesChange: (files: FileAttachment[]) => void
    disabled?: boolean
}

export function FileUpload({
    parentType,
    parentId,
    files,
    onFilesChange,
    disabled = false,
}: FileUploadProps) {
    const [isUploading, setIsUploading] = useState(false)
    const [uploadError, setUploadError] = useState<string | null>(null)
    const [isDragging, setIsDragging] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const handleUpload = useCallback(async (fileList: FileList | null) => {
        if (!fileList || fileList.length === 0) return

        setUploadError(null)
        setIsUploading(true)

        const newFiles: FileAttachment[] = []
        const errors: string[] = []

        for (let i = 0; i < fileList.length; i++) {
            const file = fileList[i]
            if (!file) continue

            // Client-side validation
            if (file.size > MAX_FILE_SIZE_BYTES) {
                errors.push(`${file.name}: File size exceeds 5MB limit`)
                continue
            }

            try {
                const formData = new FormData()
                formData.append('file', file)
                formData.append('parent_type', parentType)
                formData.append('parent_id', parentId)

                const response = await fetch('/api/files', {
                    method: 'POST',
                    body: formData,
                })

                const data = await response.json()

                if (!response.ok) {
                    errors.push(`${file.name}: ${data.error || 'Upload failed'}`)
                    continue
                }

                if (data.file) {
                    newFiles.push(data.file)
                }
            } catch (error) {
                errors.push(`${file.name}: Upload failed`)
            }
        }

        if (newFiles.length > 0) {
            onFilesChange([...files, ...newFiles])
        }

        if (errors.length > 0) {
            setUploadError(errors.join('\n'))
        }

        setIsUploading(false)

        // Reset file input
        if (fileInputRef.current) {
            fileInputRef.current.value = ''
        }
    }, [parentType, parentId, files, onFilesChange])

    const handleDelete = useCallback(async (fileId: string) => {
        if (!confirm('Are you sure you want to delete this file?')) return

        try {
            const response = await fetch(`/api/files?file_id=${fileId}`, {
                method: 'DELETE',
            })

            if (response.ok) {
                onFilesChange(files.filter(f => f.id !== fileId))
            } else {
                const data = await response.json()
                setUploadError(data.error || 'Failed to delete file')
            }
        } catch (error) {
            setUploadError('Failed to delete file')
        }
    }, [files, onFilesChange])

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        if (!disabled) {
            setIsDragging(true)
        }
    }, [disabled])

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragging(false)
    }, [])

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragging(false)
        if (!disabled) {
            handleUpload(e.dataTransfer.files)
        }
    }, [disabled, handleUpload])

    const formatFileSize = (bytes: number): string => {
        if (bytes < 1024) return `${bytes} B`
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    }

    const getFileIcon = (mimeType: string): string => {
        if (mimeType.startsWith('image/')) return '🖼️'
        if (mimeType === 'application/pdf') return '📄'
        if (mimeType.includes('word')) return '📝'
        if (mimeType === 'text/markdown') return '📑'
        if (mimeType === 'application/json') return '{ }'
        if (mimeType === 'text/csv') return '📊'
        return '📎'
    }

    return (
        <div className="space-y-3">
            {/* Upload Area */}
            <div
                className={`relative border-2 border-dashed rounded-lg p-4 text-center transition-colors ${
                    isDragging
                        ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                        : 'border-gray-300 dark:border-gray-700 hover:border-purple-400 dark:hover:border-purple-600'
                } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => !disabled && fileInputRef.current?.click()}
            >
                <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept={ALLOWED_EXTENSIONS.join(',')}
                    onChange={(e) => handleUpload(e.target.files)}
                    className="hidden"
                    disabled={disabled}
                />

                {isUploading ? (
                    <div className="flex items-center justify-center gap-2 text-purple-600 dark:text-purple-400">
                        <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        <span className="text-sm">Uploading...</span>
                    </div>
                ) : (
                    <div className="space-y-1">
                        <svg className="w-8 h-8 mx-auto text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                            <span className="text-purple-600 dark:text-purple-400 font-medium">Click to upload</span> or drag and drop
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-500">
                            PNG, JPG, GIF, PDF, DOC, MD, JSON, CSV (max 5MB)
                        </p>
                    </div>
                )}
            </div>

            {/* Error Message */}
            {uploadError && (
                <div className="p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                    <p className="text-sm text-red-600 dark:text-red-400 whitespace-pre-line">{uploadError}</p>
                    <button
                        onClick={() => setUploadError(null)}
                        className="text-xs text-red-500 hover:text-red-700 mt-1"
                    >
                        Dismiss
                    </button>
                </div>
            )}

            {/* File List */}
            {files.length > 0 && (
                <div className="space-y-2">
                    {files.map((file) => (
                        <div
                            key={file.id}
                            className="flex items-center gap-3 p-2 bg-gray-50 dark:bg-gray-800 rounded-lg group"
                        >
                            {/* File Icon or Thumbnail */}
                            {file.mime_type.startsWith('image/') ? (
                                <a
                                    href={`/api/files/${file.id}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex-shrink-0"
                                >
                                    <img
                                        src={`/api/files/${file.id}`}
                                        alt={file.original_filename}
                                        className="w-10 h-10 object-cover rounded border border-gray-200 dark:border-gray-700"
                                    />
                                </a>
                            ) : (
                                <span className="flex-shrink-0 w-10 h-10 flex items-center justify-center text-xl bg-gray-100 dark:bg-gray-700 rounded">
                                    {getFileIcon(file.mime_type)}
                                </span>
                            )}

                            {/* File Info */}
                            <div className="flex-1 min-w-0">
                                <a
                                    href={`/api/files/${file.id}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-sm font-medium text-gray-900 dark:text-gray-100 hover:text-purple-600 dark:hover:text-purple-400 truncate block"
                                >
                                    {file.original_filename}
                                </a>
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                    {formatFileSize(file.size_bytes)}
                                </p>
                            </div>

                            {/* Actions */}
                            <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                                <a
                                    href={`/api/files/${file.id}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="p-1.5 text-gray-500 hover:text-purple-600 dark:hover:text-purple-400 rounded"
                                    title="View file"
                                >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                    </svg>
                                </a>
                                <button
                                    onClick={() => handleDelete(file.id)}
                                    className="p-1.5 text-gray-500 hover:text-red-600 dark:hover:text-red-400 rounded"
                                    title="Delete file"
                                    disabled={disabled}
                                >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
