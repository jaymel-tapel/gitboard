'use client'

import { useState } from 'react';
import { refreshDocsAIMemory, checkOllamaStatus } from '@/app/actions';

export function RefreshAIMemoryButton() {
    const [isLoading, setIsLoading] = useState(false);
    const [result, setResult] = useState<{ synced: number; chunks: number } | null>(null);
    const [setupError, setSetupError] = useState<{ ollamaRunning: boolean; modelInstalled: boolean } | null>(null);

    async function handleRefresh() {
        setIsLoading(true);
        setResult(null);
        setSetupError(null);

        try {
            // Check Ollama status first
            const status = await checkOllamaStatus();
            if (!status.ready) {
                setSetupError({ ollamaRunning: status.ollamaRunning, modelInstalled: status.modelInstalled });
                setIsLoading(false);
                return;
            }

            const res = await refreshDocsAIMemory();
            setResult({ synced: res.synced, chunks: res.chunks });

            if (res.errors.length > 0) {
                console.error('AI Memory sync errors:', res.errors);
            }

            // Clear result after 3 seconds
            setTimeout(() => setResult(null), 3000);
        } catch (error) {
            console.error('Failed to refresh AI memory:', error);
        } finally {
            setIsLoading(false);
        }
    }

    return (
        <>
            <button
                onClick={handleRefresh}
                disabled={isLoading}
                className="px-4 py-2 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {isLoading ? (
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                )}
                {isLoading ? 'Syncing...' : result ? `${result.synced} pages, ${result.chunks} chunks` : 'Refresh AI Memory'}
            </button>

            {/* Setup Required Modal */}
            {setupError && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center">
                    <div
                        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                        onClick={() => setSetupError(null)}
                    />
                    <div className="relative z-[110] w-full max-w-md mx-4 bg-white dark:bg-[#1a1a1a] rounded-2xl border border-gray-200 dark:border-gray-700 shadow-2xl p-6">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                                <svg className="w-5 h-5 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                                </svg>
                            </div>
                            <div>
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                                    Setup Required
                                </h3>
                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                    Ollama is needed for AI embeddings
                                </p>
                            </div>
                        </div>

                        <div className="space-y-4">
                            {/* Step 1: Install Ollama */}
                            <div className="flex items-start gap-3">
                                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 ${
                                    setupError.ollamaRunning
                                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                                }`}>
                                    {setupError.ollamaRunning ? '✓' : '1'}
                                </div>
                                <div>
                                    <p className={`text-sm font-medium ${setupError.ollamaRunning ? 'text-green-700 dark:text-green-400' : 'text-gray-900 dark:text-gray-100'}`}>
                                        {setupError.ollamaRunning ? 'Ollama is running' : 'Install & start Ollama'}
                                    </p>
                                    {!setupError.ollamaRunning && (
                                        <div className="mt-1.5 space-y-1.5">
                                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                                Download from <a href="https://ollama.com" target="_blank" rel="noopener noreferrer" className="text-purple-600 dark:text-purple-400 underline">ollama.com</a>, then run:
                                            </p>
                                            <code className="block text-xs bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 px-3 py-2 rounded-lg font-mono">
                                                ollama serve
                                            </code>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Step 2: Pull model */}
                            <div className="flex items-start gap-3">
                                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 ${
                                    setupError.modelInstalled
                                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                                }`}>
                                    {setupError.modelInstalled ? '✓' : '2'}
                                </div>
                                <div>
                                    <p className={`text-sm font-medium ${setupError.modelInstalled ? 'text-green-700 dark:text-green-400' : 'text-gray-900 dark:text-gray-100'}`}>
                                        {setupError.modelInstalled ? 'Model is installed' : 'Pull the embedding model'}
                                    </p>
                                    {!setupError.modelInstalled && (
                                        <div className="mt-1.5">
                                            <code className="block text-xs bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 px-3 py-2 rounded-lg font-mono">
                                                ollama pull nomic-embed-text
                                            </code>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Step 3: Try again */}
                            <div className="flex items-start gap-3">
                                <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                                    3
                                </div>
                                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                    Click &quot;Refresh AI Memory&quot; again
                                </p>
                            </div>
                        </div>

                        <div className="mt-6 flex justify-end">
                            <button
                                onClick={() => setSetupError(null)}
                                className="px-4 py-2 text-sm font-medium bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                            >
                                Got it
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
