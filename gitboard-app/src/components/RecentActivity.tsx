'use client'

import { useEffect, useState } from 'react';

interface GitCommit {
    hash: string;
    message: string;
    author: string;
    date: string;
}

interface RecentActivityProps {
    commits: GitCommit[];
}

export function RecentActivity({ commits }: RecentActivityProps) {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    function formatDate(dateStr: string) {
        const date = new Date(dateStr);
        const now = new Date();
        const diff = now.getTime() - date.getTime();
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);

        if (minutes < 1) return 'just now';
        if (minutes < 60) return `${minutes}m ago`;
        if (hours < 24) return `${hours}h ago`;
        if (days < 7) return `${days}d ago`;
        return date.toLocaleDateString();
    }

    return (
        <div className="rounded-xl bg-white/60 dark:bg-white/5 backdrop-blur-md border border-gray-200/50 dark:border-gray-700/50 overflow-hidden">
            <div className="p-6">
                {commits.length === 0 ? (
                    <div className="py-12 text-center">
                        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-800 mb-3">
                            <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">No recent commits</p>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Commit history will appear here</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {commits.slice(0, 8).map((commit, index) => (
                            <div
                                key={commit.hash}
                                className={`group transition-all duration-200 ${mounted ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4'
                                    }`}
                                style={{
                                    transitionDelay: `${index * 30}ms`,
                                }}
                            >
                                <div className="flex items-start gap-3">
                                    <div className="flex-shrink-0 w-2 h-2 mt-2 rounded-full bg-gray-400 dark:bg-gray-600" />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm text-gray-900 dark:text-gray-100 leading-relaxed">
                                            {commit.message}
                                        </p>
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className="text-xs font-mono text-gray-400 dark:text-gray-600">
                                                {commit.hash}
                                            </span>
                                            <span className="text-xs text-gray-500 dark:text-gray-500">
                                                {formatDate(commit.date)}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
