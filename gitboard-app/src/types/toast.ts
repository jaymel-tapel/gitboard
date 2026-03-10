// Toast notification types

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastAction {
    label: string;
    onClick: () => void;
}

export interface Toast {
    id: string;
    type: ToastType;
    message: string;
    duration?: number; // in milliseconds, undefined means use default
    action?: ToastAction;
    createdAt: number;
}

export interface ToastOptions {
    duration?: number;
    action?: ToastAction;
}

export interface ToastContextValue {
    toasts: Toast[];
    toast: {
        success: (message: string, options?: ToastOptions) => string;
        error: (message: string, options?: ToastOptions) => string;
        warning: (message: string, options?: ToastOptions) => string;
        info: (message: string, options?: ToastOptions) => string;
    };
    dismissToast: (id: string) => void;
    dismissAll: () => void;
}

// Default durations in milliseconds
export const TOAST_DURATIONS = {
    success: 3000,
    info: 3000,
    warning: 4000,
    error: 5000,
} as const;
