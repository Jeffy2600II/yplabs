import type { Metadata } from 'next';
import '../styles/globals.css';
import { AuthProvider } from '@/context/AuthContext';
import { PopupProvider } from '@/components/PopupProvider';

export const metadata: Metadata = {
  title: 'YPLABS — สภานักเรียนโรงเรียนคำยางพิทยา',
  description: 'ระบบจัดการสภานักเรียน โรงเรียนคำยางพิทยา',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@300;400;500;600;700;800&family=IBM+Plex+Sans+Thai:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <meta name="theme-color" content="#0f1c35" />
      </head>
      <body>
        <AuthProvider>
          <PopupProvider>
            {children}
          </PopupProvider>
        </AuthProvider>
      </body>
    </html>
  );
}