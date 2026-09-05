'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Ban, CheckCircle2, Trash2, AlertTriangle, Loader2, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

function RoleSelect({
  user,
  updating,
  onChange,
  className,
}: {
  user: any;
  updating: boolean;
  onChange: (role: string) => void;
  className?: string;
}) {
  return (
    <select
      value={user.role}
      onChange={(e) => onChange(e.target.value)}
      disabled={updating}
      className={cn(
        'bg-card/90 backdrop-blur-md border border-border hover:border-emerald-500/50 rounded-lg px-3 py-1.5 text-xs font-bold focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all cursor-pointer shadow-xl',
        updating && 'opacity-50 cursor-not-allowed',
        user.role === 'ADMIN'
          ? 'text-blue-400'
          : user.role === 'BLOCKED'
            ? 'text-destructive'
            : 'text-emerald-400',
        className
      )}
    >
      <option value="ADMIN">ADMIN</option>
      <option value="USER">USER</option>
      <option value="PENDING">PENDING</option>
      <option value="BLOCKED">BLOCKED</option>
    </select>
  );
}

function ProductAccess({
  user,
  updating,
  onChange,
  variant = 'stack',
}: {
  user: any;
  updating: boolean;
  onChange: (productAccess: Record<string, boolean>) => void;
  variant?: 'stack' | 'chips';
}) {
  const products = [
    {
      key: 'lynxscan',
      label: 'LynxScan',
      checked: user.productAccess?.lynxscan !== false,
    },
    {
      key: 'lynxgeo',
      label: 'Lynx GEO',
      checked: !!user.productAccess?.lynxgeo,
    },
  ] as const;

  if (variant === 'chips') {
    return (
      <div className="flex flex-wrap gap-1.5">
        {products.map((product) => (
          <button
            key={product.key}
            type="button"
            role="checkbox"
            aria-checked={product.checked}
            disabled={updating}
            onClick={() => onChange({ [product.key]: !product.checked })}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
              product.checked
                ? 'border-primary/40 bg-primary/10 text-primary'
                : 'border-border bg-muted/40 text-muted-foreground',
              updating && 'opacity-50 cursor-not-allowed'
            )}
          >
            <span
              className={cn(
                'flex h-3.5 w-3.5 items-center justify-center rounded-sm border',
                product.checked
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-muted-foreground/40'
              )}
            >
              {product.checked && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
            </span>
            {product.label}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 text-xs font-medium">
      {products.map((product) => (
        <label key={product.key} className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={product.checked}
            disabled={updating}
            onChange={(e) => onChange({ [product.key]: e.target.checked })}
          />
          {product.label}
        </label>
      ))}
    </div>
  );
}

function UserControls({
  user,
  updating,
  onUpdateRole,
  onDelete,
  compact = false,
}: {
  user: any;
  updating: boolean;
  onUpdateRole: (role: string) => void;
  onDelete: () => void;
  compact?: boolean;
}) {
  return (
    <div className={cn('flex flex-wrap items-center gap-2', compact && 'w-full')}>
      {user.role === 'PENDING' && (
        <Button
          size="sm"
          variant="default"
          className={cn('bg-green-600 hover:bg-green-700 h-8', compact && 'flex-1')}
          onClick={() => onUpdateRole('USER')}
          disabled={updating}
        >
          {updating ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <>
              <CheckCircle2 className={cn('h-3.5 w-3.5', compact ? 'mr-1.5' : 'mr-2')} />
              Approve
            </>
          )}
        </Button>
      )}
      {user.role !== 'BLOCKED' && user.role !== 'ADMIN' && (
        <Button
          size="sm"
          variant="destructive"
          className={cn('h-8', compact && 'flex-1')}
          onClick={() => onUpdateRole('BLOCKED')}
          disabled={updating}
        >
          {updating ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <>
              <Ban className={cn('h-3.5 w-3.5', compact ? 'mr-1.5' : 'mr-2')} />
              Block
            </>
          )}
        </Button>
      )}
      {user.role === 'BLOCKED' && (
        <Button
          size="sm"
          variant="outline"
          className={cn(
            'h-8 border-green-500/50 text-green-500 hover:bg-green-500/10',
            compact && 'flex-1'
          )}
          onClick={() => onUpdateRole('USER')}
          disabled={updating}
        >
          {updating ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <>
              <CheckCircle2 className={cn('h-3.5 w-3.5', compact ? 'mr-1.5' : 'mr-2')} />
              Restore
            </>
          )}
        </Button>
      )}
      {user.role !== 'ADMIN' && (
        <Button
          size="sm"
          variant="ghost"
          className={cn(
            'h-8 text-muted-foreground hover:text-red-500 hover:bg-red-500/10',
            compact && 'px-2.5 shrink-0'
          )}
          onClick={onDelete}
          disabled={updating}
          aria-label="Delete user"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}

function UserIdentity({
  user,
  showAvatar = false,
  idMode = 'truncated',
}: {
  user: any;
  showAvatar?: boolean;
  idMode?: 'truncated' | 'full' | 'expandable';
}) {
  const [idExpanded, setIdExpanded] = useState(false);
  const initial = (user.email?.[0] || '?').toUpperCase();
  const showFullId = idMode === 'full' || (idMode === 'expandable' && idExpanded);

  return (
    <div className={cn('flex min-w-0', showAvatar ? 'items-start gap-3' : 'flex-col')}>
      {showAvatar && (
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-sm font-bold text-primary"
          aria-hidden
        >
          {initial}
        </div>
      )}
      <div className="flex flex-col min-w-0 gap-0.5">
        <span className="font-semibold text-foreground break-all leading-snug">{user.email}</span>
        {idMode === 'expandable' ? (
          <button
            type="button"
            onClick={() => setIdExpanded((v) => !v)}
            className="text-left font-mono text-[10px] text-muted-foreground break-all hover:text-foreground/80 transition-colors"
            title={idExpanded ? 'Hide full ID' : 'Show full ID'}
          >
            {showFullId ? user.id : `${user.id.slice(0, 8)}…`}
          </button>
        ) : (
          <span className="font-mono text-[10px] text-muted-foreground break-all">
            {idMode === 'full' ? user.id : `${user.id.slice(0, 8)}…`}
          </span>
        )}
      </div>
    </div>
  );
}

function MobileUserCard({
  user,
  updating,
  onUpdateRole,
  onUpdateProducts,
  onUpdateMaxJobs,
  onDelete,
}: {
  user: any;
  updating: boolean;
  onUpdateRole: (role: string) => void;
  onUpdateProducts: (productAccess: Record<string, boolean>) => void;
  onUpdateMaxJobs: (maxJobs: number) => void;
  onDelete: () => void;
}) {
  const showControls = user.role !== 'ADMIN';

  return (
    <article
      className={cn(
        'rounded-xl border border-border/80 bg-card shadow-card overflow-hidden',
        updating && 'opacity-80'
      )}
    >
      {/* Header: identity + role */}
      <div className="flex items-start gap-3 p-3.5 pb-3">
        <div className="min-w-0 flex-1">
          <UserIdentity user={user} showAvatar idMode="expandable" />
        </div>
        <RoleSelect
          user={user}
          updating={updating}
          onChange={onUpdateRole}
          className="shrink-0 shadow-sm"
        />
      </div>

      {/* Body: products + max jobs */}
      <div className="border-t border-border/60 px-3.5 py-3 space-y-2.5 bg-muted/20">
        <div className="space-y-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Products
          </span>
          <ProductAccess
            user={user}
            updating={updating}
            onChange={onUpdateProducts}
            variant="chips"
          />
        </div>

        <div className="flex items-center gap-2">
          <label
            htmlFor={`max-jobs-${user.id}`}
            className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground shrink-0"
          >
            Max jobs
          </label>
          <Input
            id={`max-jobs-${user.id}`}
            type="number"
            value={user.maxJobs}
            onChange={(e) => onUpdateMaxJobs(parseInt(e.target.value) || 1)}
            disabled={updating}
            className="h-8 w-16 text-center font-bold text-sm"
            min={1}
            max={100}
          />
        </div>
      </div>

      {/* Footer: actions — omitted for admins (no empty Control label) */}
      {showControls && (
        <div className="border-t border-border/60 px-3.5 py-2.5 bg-card">
          <UserControls
            user={user}
            updating={updating}
            onUpdateRole={onUpdateRole}
            onDelete={onDelete}
            compact
          />
        </div>
      )}
    </article>
  );
}

export function UsersTable({ initialUsers }: { initialUsers: any[] }) {
  const [users, setUsers] = useState(initialUsers);
  const [deletingUser, setDeletingUser] = useState<any>(null);
  const [associations, setAssociations] = useState<any>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const updateUser = async (id: string, updates: any) => {
    setUpdatingUserId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        setUsers(
          users.map((u) => {
            if (u.id !== id) return u;
            if (updates.productAccess) {
              return { ...u, productAccess: { ...u.productAccess, ...updates.productAccess } };
            }
            return { ...u, ...updates };
          })
        );
      } else {
        const data = await res.json();
        const errorMsg = data.error || 'Failed to update user';
        console.error('Update failed:', errorMsg);
        setError(errorMsg);
        alert(`Error: ${errorMsg}`);
      }
    } catch (e: any) {
      console.error(e);
      const errorMsg = e.message || 'An error occurred during update';
      setError(errorMsg);
      alert(`Error: ${errorMsg}`);
    } finally {
      setUpdatingUserId(null);
    }
  };

  const handleDeleteClick = async (user: any) => {
    setDeletingUser(user);
    setAssociations({ scans: 0, templates: 0 });
  };

  const confirmDelete = async () => {
    if (!deletingUser) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/admin/users/${deletingUser.id}`, { method: 'DELETE' });
      if (res.ok) {
        setUsers(users.filter((u) => u.id !== deletingUser.id));
        setDeletingUser(null);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      {/* Mobile: compact admin cards */}
      <div className="md:hidden space-y-2.5">
        {users.map((user) => {
          const updating = updatingUserId === user.id;
          return (
            <MobileUserCard
              key={user.id}
              user={user}
              updating={updating}
              onUpdateRole={(role) => updateUser(user.id, { role })}
              onUpdateProducts={(productAccess) => updateUser(user.id, { productAccess })}
              onUpdateMaxJobs={(maxJobs) => updateUser(user.id, { maxJobs })}
              onDelete={() => handleDeleteClick(user)}
            />
          );
        })}
      </div>

      {/* Desktop: table */}
      <div className="relative hidden md:block w-full overflow-auto border rounded-xl bg-card shadow-sm">
        <table className="w-full caption-bottom text-sm">
          <thead className="bg-muted/50 border-b">
            <tr>
              <th className="h-12 px-6 text-left align-middle font-medium text-muted-foreground">
                User
              </th>
              <th className="h-12 px-6 text-left align-middle font-medium text-muted-foreground">
                Permissions
              </th>
              <th className="h-12 px-6 text-left align-middle font-medium text-muted-foreground">
                Products
              </th>
              <th className="h-12 px-6 text-center align-middle font-medium text-muted-foreground">
                Max Jobs
              </th>
              <th className="h-12 px-6 text-right align-middle font-medium text-muted-foreground">
                Control
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {users.map((user) => {
              const updating = updatingUserId === user.id;
              return (
                <tr key={user.id} className="hover:bg-muted/20 transition-colors">
                  <td className="p-6 align-middle">
                    <UserIdentity user={user} />
                  </td>
                  <td className="p-6 align-middle">
                    <RoleSelect
                      user={user}
                      updating={updating}
                      onChange={(role) => updateUser(user.id, { role })}
                    />
                  </td>
                  <td className="p-6 align-middle">
                    <ProductAccess
                      user={user}
                      updating={updating}
                      onChange={(productAccess) => updateUser(user.id, { productAccess })}
                    />
                  </td>
                  <td className="p-6 align-middle text-center">
                    <div className="flex justify-center">
                      <Input
                        type="number"
                        value={user.maxJobs}
                        onChange={(e) =>
                          updateUser(user.id, { maxJobs: parseInt(e.target.value) || 1 })
                        }
                        disabled={updating}
                        className="w-16 h-8 text-center font-bold"
                        min={1}
                        max={100}
                      />
                    </div>
                  </td>
                  <td className="p-6 align-middle text-right">
                    <div className="flex justify-end">
                      <UserControls
                        user={user}
                        updating={updating}
                        onUpdateRole={(role) => updateUser(user.id, { role })}
                        onDelete={() => handleDeleteClick(user)}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Confirmation Modal */}
      {deletingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-card border rounded-xl shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-3 text-destructive">
                <div className="p-2 bg-red-100 rounded-full">
                  <AlertTriangle className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-bold">Delete User?</h3>
              </div>

              <p className="text-sm text-balance">
                Are you sure you want to delete{' '}
                <span className="font-bold text-foreground">{deletingUser.email}</span>? This
                action is permanent and cannot be undone.
              </p>

              {associations ? (
                <div className="bg-muted/50 rounded-lg p-4 space-y-2 border">
                  <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    Associated Data:
                  </p>
                  <p className="text-sm">
                    The central user record and this user&apos;s Lynx GEO database will be removed.
                    LynxScan data is unchanged unless you delete the user from LynxScan.
                  </p>
                </div>
              ) : (
                <div className="flex items-center justify-center p-8">
                  <Loader2 className="h-6 w-6 animate-spin text-primary/50" />
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <Button
                  variant="outline"
                  onClick={() => setDeletingUser(null)}
                  disabled={isDeleting}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={confirmDelete}
                  disabled={isDeleting || !associations}
                >
                  {isDeleting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Deleting...
                    </>
                  ) : (
                    'Delete User'
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
