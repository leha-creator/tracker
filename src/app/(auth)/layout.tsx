import Link from 'next/link';

import { Logo } from '@/components/brand/logo';

export default function AuthLayout({ children }: LayoutProps<'/'>) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 p-8">
      <Link
        href="/"
        className="rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <Logo size="lg" />
      </Link>
      {children}
    </main>
  );
}
