'use client';

import React, { createContext, useContext, useReducer, useCallback, useRef, useEffect } from 'react';
import type { Toast, ToastOptions, ToastContextValue, ToastType } from '@/types/toast';
import { TOAST_DURATIONS } from '@/types/toast';

// ============================================================================
// Types
// ============================================================================

type ToastAction =
    | { type: 'ADD_TOAST'; payload: Toast }
    | { type: 'REMOVE_TOAST'; payload: string }
    | { type: 'CLEAR_ALL' };

interface ToastState {
    toasts: Toast[];
}

// ============================================================================
// Reducer
// ============================================================================

function toastReducer(state: ToastState, action: ToastAction): ToastState {
    switch (action.type) {
        case 'ADD_TOAST':
            // Add new toast at the beginning (newest on top)
            return {
                ...state,
                toasts: [action.payload, ...state.toasts],
            };
        case 'REMOVE_TOAST':
            return {
                ...state,
                toasts: state.toasts.filter(t => t.id !== action.payload),
            };
        case 'CLEAR_ALL':
            return {
                ...state,
                toasts: [],
            };
        default:
            return state;
    }
}

// ============================================================================
// Context
// ============================================================================

const ToastContext = createContext<ToastContextValue | null>(null);

// ============================================================================
// Provider
// ============================================================================

interface ToastProviderProps {
    children: React.ReactNode;
}

export function ToastProvider({ children }: ToastProviderProps) {
    const [state, dispatch] = useReducer(toastReducer, { toasts: [] });
    const timersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

    // Clean up timers on unmount
    useEffect(() => {
        return () => {
            timersRef.current.forEach(timer => clearTimeout(timer));
            timersRef.current.clear();
        };
    }, []);

    const dismissToast = useCallback((id: string) => {
        // Clear the timer if it exists
        const timer = timersRef.current.get(id);
        if (timer) {
            clearTimeout(timer);
            timersRef.current.delete(id);
        }
        dispatch({ type: 'REMOVE_TOAST', payload: id });
    }, []);

    const dismissAll = useCallback(() => {
        // Clear all timers
        timersRef.current.forEach(timer => clearTimeout(timer));
        timersRef.current.clear();
        dispatch({ type: 'CLEAR_ALL' });
    }, []);

    const addToast = useCallback((type: ToastType, message: string, options?: ToastOptions): string => {
        const id = crypto.randomUUID();
        const duration = options?.duration ?? TOAST_DURATIONS[type];

        const toast: Toast = {
            id,
            type,
            message,
            duration,
            action: options?.action,
            createdAt: Date.now(),
        };

        dispatch({ type: 'ADD_TOAST', payload: toast });

        // Set up auto-dismiss timer
        if (duration && duration > 0) {
            const timer = setTimeout(() => {
                dismissToast(id);
            }, duration);
            timersRef.current.set(id, timer);
        }

        return id;
    }, [dismissToast]);

    const toast = {
        success: useCallback((message: string, options?: ToastOptions) => {
            return addToast('success', message, options);
        }, [addToast]),

        error: useCallback((message: string, options?: ToastOptions) => {
            return addToast('error', message, options);
        }, [addToast]),

        warning: useCallback((message: string, options?: ToastOptions) => {
            return addToast('warning', message, options);
        }, [addToast]),

        info: useCallback((message: string, options?: ToastOptions) => {
            return addToast('info', message, options);
        }, [addToast]),
    };

    const value: ToastContextValue = {
        toasts: state.toasts,
        toast,
        dismissToast,
        dismissAll,
    };

    return (
        <ToastContext.Provider value={value}>
            {children}
        </ToastContext.Provider>
    );
}

// ============================================================================
// Hook
// ============================================================================

export function useToast(): ToastContextValue {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
}
