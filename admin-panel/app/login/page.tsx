'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { adminLogin, isAuthed } from '@/lib/api';
import { Button, Card, Field, Input, useToast } from '@/components/ui';

export default function LoginPage() {
  const router = useRouter();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(true);

  // Already have a session (e.g. refresh token in localStorage) -> dashboard.
  useEffect(() => {
    if (isAuthed()) router.replace('/');
    else setChecking(false);
  }, [router]);

  if (checking) return null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await adminLogin(email.trim(), password);
      toast('success', 'Signed in');
      router.replace('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm p-8">
        <div className="mb-6">
          <div className="text-xl font-bold text-slate-900">SecureLearn</div>
          <div className="text-sm text-slate-500">Admin Panel</div>
        </div>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <Field label="Email">
            <Input
              type="email"
              required
              autoComplete="username"
              placeholder="owner@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field label="Password">
            <Input
              type="password"
              required
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
