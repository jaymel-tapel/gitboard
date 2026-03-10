'use client'

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function Navbar() {
    const pathname = usePathname();

    const primaryLinks = [
        { href: '/', label: 'Home' },
        { href: '/team', label: 'Team' },
        { href: '/board', label: 'Board' },
    ];

    const secondaryLinks = [
        { href: '/docs', label: 'Docs' },
        { href: '/agents', label: 'Agents' },
        { href: '/skills', label: 'Skills' },
        { href: '/mcp', label: 'MCP' },
    ];

    return (
        <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 dark:bg-[#0d0d0d]/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-800">
            <div className="mx-auto px-6">
                <div className="flex items-center justify-between h-14">
                    {/* Left side: Logo + Primary Links */}
                    <div className="flex items-center gap-4">
                        {/* Logo */}
                        <Link href="/" className="flex items-center gap-2 group">
                            <div className="w-6 h-6 rounded bg-gray-900 dark:bg-gray-100 flex items-center justify-center group-hover:scale-110 transition-transform">
                                <svg className="w-4 h-4 text-white dark:text-gray-900" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                </svg>
                            </div>
                            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                                GitBoard
                            </span>
                        </Link>

                        {/* Primary Navigation Links */}
                        <div className="flex items-center gap-1">
                            {primaryLinks.map((link) => {
                                const isActive = pathname === link.href;
                                return (
                                    <Link
                                        key={link.href}
                                        href={link.href}
                                        className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${isActive
                                            ? 'text-gray-900 dark:text-gray-100 bg-gray-100 dark:bg-gray-800'
                                            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-900'
                                            }`}
                                    >
                                        {link.label}
                                    </Link>
                                );
                            })}
                        </div>
                    </div>

                    {/* Right side: Secondary Navigation Links */}
                    <div className="flex items-center gap-1">
                        {secondaryLinks.map((link) => {
                            const isActive = pathname === link.href;
                            return (
                                <Link
                                    key={link.href}
                                    href={link.href}
                                    className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${isActive
                                        ? 'text-gray-900 dark:text-gray-100 bg-gray-100 dark:bg-gray-800'
                                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-900'
                                        }`}
                                >
                                    {link.label}
                                </Link>
                            );
                        })}
                    </div>
                </div>
            </div>
        </nav>
    );
}
