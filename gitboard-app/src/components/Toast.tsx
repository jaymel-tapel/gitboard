'use client';

import { useEffect, useState, useCallback } from 'react';
import type { Toast as ToastType, ToastType as ToastVariant } from '@/types/toast';

interface ToastProps {
    toast: ToastType;
    onDismiss: (id: string) => void;
}

// Icons for each toast type
const ToastIcons: Record<ToastVariant, React.ReactNode> = {
    success: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
    ),
    error: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
    ),
    warning: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
    ),
    info: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
    ),
};

// Styling for each toast type
const ToastStyles: Record<ToastVariant, { bg: string; border: string; icon: string; text: string }> = {
    success: {
        bg: 'bg-gray-800',
        border: 'border-green-500/50',
        icon: 'text-green-400 bg-green-500/20',
        text: 'text-green-400',
    },
    error: {
        bg: 'bg-gray-800',
        border: 'border-red-500/50',
        icon: 'text-red-400 bg-red-500/20',
        text: 'text-red-400',
    },
    warning: {
        bg: 'bg-gray-800',
        border: 'border-amber-500/50',
        icon: 'text-amber-400 bg-amber-500/20',
        text: 'text-amber-400',
    },
    info: {
        bg: 'bg-gray-800',
        border: 'border-blue-500/50',
        icon: 'text-blue-400 bg-blue-500/20',
        text: 'text-blue-400',
    },
};

export function Toast({ toast, onDismiss }: ToastProps) {
    const [isExiting, setIsExiting] = useState(false);
    const styles = ToastStyles[toast.type];

    const handleDismiss = useCallback(() => {
        setIsExiting(true);
        // Wait for exit animation to complete
        setTimeout(() => {
            onDismiss(toast.id);
        }, 200);
    }, [toast.id, onDismiss]);

    // Handle escape key for accessibility
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                handleDismiss();
            }
        };

        window.addEventListener('keydown', handleEscape);
        return () => window.removeEventListener('keydown', handleEscape);
    }, [handleDismiss]);

    return (
        <div
            role="alert"
            aria-live="polite"
            className={`
                flex items-center gap-3 min-w-[320px] max-w-md p-4
                ${styles.bg} ${styles.border} border
                rounded-lg shadow-lg
                ${isExiting ? 'animate-toast-out' : 'animate-toast-in'}
            `}
        >
            {/* Icon */}
            <div className={`flex-shrink-0 p-1.5 rounded-full ${styles.icon}`}>
                {ToastIcons[toast.type]}
            </div>

            {/* Message */}
            <p className="flex-1 text-sm text-gray-100">
                {toast.message}
            </p>

            {/* Action button (optional) */}
            {toast.action && (
                <button
                    onClick={() => {
                        toast.action?.onClick();
                        handleDismiss();
                    }}
                    className={`flex-shrink-0 px-3 py-1 text-sm font-medium ${styles.text} hover:bg-white/10 rounded transition-colors`}
                >
                    {toast.action.label}
                </button>
            )}

            {/* Close button */}
            <button
                onClick={handleDismiss}
                className="flex-shrink-0 p-1 text-gray-400 hover:text-gray-200 hover:bg-white/10 rounded transition-colors"
                aria-label="Dismiss notification"
            >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>
        </div>
    );
}
