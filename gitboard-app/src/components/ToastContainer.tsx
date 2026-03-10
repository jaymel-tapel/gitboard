'use client';

import { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import { useToast } from '@/context/ToastContext';
import { Toast } from './Toast';

export function ToastContainer() {
    const { toasts, dismissToast } = useToast();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    // Don't render on server
    if (!mounted) return null;

    // Don't render if no toasts
    if (toasts.length === 0) return null;

    return ReactDOM.createPortal(
        <div
            className="fixed bottom-4 right-4 z-[300] flex flex-col gap-2"
            role="region"
            aria-label="Notifications"
        >
            {toasts.map((toast) => (
                <Toast
                    key={toast.id}
                    toast={toast}
                    onDismiss={dismissToast}
                />
            ))}
        </div>,
        document.body
    );
}
