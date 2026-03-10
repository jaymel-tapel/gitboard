import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Navbar } from '@/components/Navbar'
import { ToastProvider } from '@/context/ToastContext'
import { ToastContainer } from '@/components/ToastContainer'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
    title: {
        default: 'GitBoard',
        template: '%s',
    },
    description: 'Git-native project management',
}

export default function RootLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <html lang="en">
            <body className={inter.className}>
                <ToastProvider>
                    <Navbar />
                    <div className="pt-14">
                        {children}
                    </div>
                    <ToastContainer />
                </ToastProvider>
            </body>
        </html>
    )
}
