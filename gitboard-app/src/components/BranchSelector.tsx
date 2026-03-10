'use client';

import { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';

interface BranchSelectorProps {
    ticketId: string;
    onSelect: (baseBranch: string) => void;
    onCancel: () => void;
}

export function BranchSelector({ ticketId, onSelect, onCancel }: BranchSelectorProps) {
    const [branches, setBranches] = useState<string[]>([]);
    const [defaultBranch, setDefaultBranch] = useState('main');
    const [selectedBranch, setSelectedBranch] = useState('main');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetch('/api/branches')
            .then(res => res.json())
            .then(data => {
                setBranches(data.branches || []);
                setDefaultBranch(data.defaultBranch || 'main');
                setSelectedBranch(data.defaultBranch || 'main');
                setLoading(false);
            })
            .catch(err => {
                console.error('Failed to fetch branches:', err);
                setError('Failed to load branches');
                setLoading(false);
            });
    }, []);

    const handleConfirm = () => {
        onSelect(selectedBranch);
    };

    return ReactDOM.createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={onCancel}
            />

            {/* Modal */}
            <div className="relative z-10 w-full max-w-md mx-4 bg-[#1a1a1a] border border-gray-700 rounded-xl shadow-2xl">
                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-700">
                    <h3 className="text-lg font-semibold text-gray-100">
                        Create Branch for {ticketId}
                    </h3>
                    <p className="text-sm text-gray-400 mt-1">
                        Select which branch to base your work on
                    </p>
                </div>

                {/* Content */}
                <div className="px-6 py-4">
                    {/* Explanation */}
                    <div className="mb-4 p-3 bg-purple-500/10 border border-purple-500/20 rounded-lg">
                        <div className="flex items-start gap-2">
                            <svg className="w-5 h-5 text-purple-400 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <div className="text-sm text-gray-300">
                                <p className="font-medium text-purple-300">Isolated Workspace</p>
                                <p className="mt-1 text-gray-400">
                                    A new branch <code className="px-1.5 py-0.5 bg-gray-800 rounded text-purple-300">{ticketId}</code> and
                                    worktree will be created for this ticket. All changes will be isolated from other work.
                                </p>
                            </div>
                        </div>
                    </div>

                    {loading ? (
                        <div className="flex items-center justify-center py-8">
                            <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                            <span className="ml-3 text-gray-400">Loading branches...</span>
                        </div>
                    ) : error ? (
                        <div className="text-center py-8">
                            <p className="text-red-400">{error}</p>
                            <button
                                onClick={() => window.location.reload()}
                                className="mt-3 text-sm text-purple-400 hover:text-purple-300"
                            >
                                Try again
                            </button>
                        </div>
                    ) : (
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">
                                Base Branch
                            </label>
                            <select
                                value={selectedBranch}
                                onChange={(e) => setSelectedBranch(e.target.value)}
                                className="w-full px-3 py-2.5 bg-[#0d0d0d] border border-gray-700 rounded-lg text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                            >
                                {branches.map((branch) => (
                                    <option key={branch} value={branch}>
                                        {branch}
                                        {branch === defaultBranch ? ' (default)' : ''}
                                    </option>
                                ))}
                            </select>
                            <p className="mt-2 text-xs text-gray-500">
                                Your new branch will be created from {selectedBranch}
                            </p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-gray-700 flex justify-end gap-3">
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 text-sm text-gray-300 border border-gray-700 rounded-lg hover:bg-gray-800 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={loading || !!error}
                        className="px-4 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Create Branch & Start
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
