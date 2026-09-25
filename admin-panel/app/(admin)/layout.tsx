'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { isAuthed, logout } from '@/lib/api';

const NAV = [
  { href: '/', label: 'Dashboard', icon: '▦' },
  { href: '/content', label: 'Content', icon: '▤' },
  { href: '/users', label: 'Users', icon: '◉' },
  { href: '/security', label: 'Security', icon: '⬢' },
  { href: '/banners', label: 'Banners', icon: '▣' },
  { href: '/settings', label: 'Settings', icon: '⚙' },
];

function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function onLogout() {
    setSigningOut(true);
    await logout();
    router.replace('/login');
  }

  return (
    <div className="flex min-h-screen">
      <aside className="fixed inset-y-0 left-0 flex w-60 flex-col bg-slate-900 text-slate-200">
        <div className="px-5 py-5">
          <div className="text-lg font-bold text-white">SecureLearn</div>
          <div className="text-xs text-slate-400">Admin Panel</div>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {NAV.map((item) => {
            const active =
              item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  active
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
                }`}
              >
                <span className="w-5 text-center">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-slate-800 p-4">
          <button
            onClick={onLogout}
            disabled={signingOut}
            className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white disabled:opacity-50"
          >
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </aside>
      <div className="ml-60 flex min-h-screen flex-1 flex-col">
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-8 py-3 backdrop-blur">
          <div className="text-sm text-slate-500">
            Signed in as <span className="font-medium text-slate-700">Administrator</span>
          </div>
        </header>
        <main className="flex-1 px-8 py-6">{children}</main>
      </div>
    </div>
  );
}

/** Guards every /(admin) route: no refresh token -> /login. */
export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!isAuthed()) router.replace('/login');
    else setReady(true);
  }, [router]);

  if (!ready) return null;
  return <Shell>{children}</Shell>;
}
