'use client'

interface TabOption {
    id: string;
    label: string;
    icon?: React.ReactNode;
}

interface TabProps {
    tabs: TabOption[];
    activeTab: string;
    onChange: (tabId: string) => void;
    className?: string;
}

export function Tab({ tabs, activeTab, onChange, className = '' }: TabProps) {
    return (
        <div className={`flex gap-1 p-1 bg-gray-100 dark:bg-gray-800/50 rounded-lg ${className}`}>
            {tabs.map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                    <button
                        key={tab.id}
                        onClick={() => onChange(tab.id)}
                        className={`
                            flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-all duration-200
                            ${isActive
                                ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-md'
                                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-200/50 dark:hover:bg-gray-700/50'
                            }
                        `}
                    >
                        {tab.icon && <span className="w-4 h-4">{tab.icon}</span>}
                        {tab.label}
                    </button>
                );
            })}
        </div>
    );
}
