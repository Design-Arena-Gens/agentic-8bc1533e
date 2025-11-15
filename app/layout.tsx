import type { ReactNode } from 'react';
import './globals.css';

export const metadata = {
  title: 'Crocs Coupon Finder & Tester',
  description: 'Zoek kortingscodes voor Crocs en test ze automatisch.'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="nl">
      <body>{children}</body>
    </html>
  );
}
