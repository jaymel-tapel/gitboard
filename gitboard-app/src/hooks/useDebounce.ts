'use client';

import { useState, useEffect } from 'react';

/**
 * Custom hook that debounces a value.
 *
 * Returns a debounced version of the input value that only updates
 * after the specified delay has passed without new changes.
 *
 * @param value - The value to debounce
 * @param delay - The debounce delay in milliseconds (default: 300ms)
 * @returns The debounced value
 *
 * @example
 * // Basic usage with search input:
 * const [searchQuery, setSearchQuery] = useState('');
 * const debouncedSearchQuery = useDebounce(searchQuery, 300);
 *
 * // Use searchQuery for input value (immediate feedback)
 * // Use debouncedSearchQuery for filtering (delayed, optimized)
 *
 * @example
 * // With custom delay:
 * const debouncedValue = useDebounce(inputValue, 500);
 */
export function useDebounce<T>(value: T, delay: number = 300): T {
    const [debouncedValue, setDebouncedValue] = useState<T>(value);

    useEffect(() => {
        // Set up a timer to update the debounced value after the delay
        const timer = setTimeout(() => {
            setDebouncedValue(value);
        }, delay);

        // Cleanup: clear the timer if value changes before delay completes
        // This prevents memory leaks and ensures proper debouncing
        return () => {
            clearTimeout(timer);
        };
    }, [value, delay]);

    return debouncedValue;
}
