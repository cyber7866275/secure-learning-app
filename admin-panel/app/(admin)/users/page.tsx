'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { get, post } from '@/lib/api';
import type { Page, User, UserStatus } from '@/lib/types';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Modal,
  PageHeader,
  Pagination,
  Select,
  Spinner,
  useToast,
} from '@/components/ui';

const PAGE_SIZE = 15;

function NewUserDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [maxDevices, setMaxDevices] = useState('2');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await post('/admin/users', {
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined,
        password: password || undefined,
        maxDevices: parseInt(maxDevices, 10) || 1,
      });
      toast('success', 'User created');
      onCreated();
      onClose();
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Create failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="New user" onClose={onClose}>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field label="Name">
          <Input required value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
        </Field>
        <Field label="Phone" hint="E.164 format, e.g. +919876543210">
          <Input required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91…" />
        </Field>
        <Field label="Email (optional)">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Password (optional)" hint="Min 8 chars — for email/password login">
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} />
        </Field>
        <Field label="Max devices">
          <Input type="number" min={1} value={maxDevices} onChange={(e) => setMaxDevices(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? 'Creating…' : 'Create user'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'' | UserStatus>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showNew, setShowNew] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const q = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (search.trim()) q.set('search', search.trim());
      if (status) q.set('status', status);
      const res = await get<Page<User>>(`/admin/users?${q}`);
      setUsers(res.data);
      setTotal(res.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [page, search, status]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <PageHeader
        title="Users"
        subtitle="Manage accounts, devices and permissions"
        actions={
          <Button variant="primary" onClick={() => setShowNew(true)}>
            New user
          </Button>
        }
      />
      <Card>
        <div className="flex flex-wrap gap-3 border-b border-slate-200 px-4 py-3">
          <div className="min-w-52 flex-1">
            <Input
              placeholder="Search name, email, phone…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <Select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as '' | UserStatus);
              setPage(1);
            }}
            className="w-40"
          >
            <option value="">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="BLOCKED">Blocked</option>
          </Select>
        </div>
        {loading ? (
          <Spinner />
        ) : error ? (
          <div className="p-4">
            <ErrorState message={error} onRetry={load} />
          </div>
        ) : users.length === 0 ? (
          <div className="p-4">
            <EmptyState title="No users found" />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
                    <th className="px-4 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 font-medium">Phone</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Devices</th>
                    <th className="px-4 py-3 font-medium">Joined</th>
                    <th className="px-4 py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {users.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-800">{u.name}</div>
                        <div className="text-xs text-slate-400">{u.email ?? '—'}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{u.phone}</td>
                      <td className="px-4 py-3">
                        <Badge value={u.status} />
                      </td>
                      <td className="px-4 py-3 text-slate-600">max {u.maxDevices}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {new Date(u.createdAt).toLocaleDateString('en-GB')}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/users/${u.id}`}
                          className="text-sm font-medium text-emerald-700 hover:underline"
                        >
                          Manage
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} limit={PAGE_SIZE} total={total} onPage={setPage} />
          </>
        )}
      </Card>
      {showNew && (
        <NewUserDialog
          onClose={() => setShowNew(false)}
          onCreated={() => {
            setPage(1);
            load();
          }}
        />
      )}
    </div>
  );
}
