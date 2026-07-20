'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Shield, User, ShieldAlert, Ban, CheckCircle2, Trash2, AlertTriangle, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

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
        setUsers(users.map(u => u.id === id ? { ...u, ...updates } : u));
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
    setAssociations(null); // Reset
    try {
        const res = await fetch(`/api/admin/users/${user.id}/associations`);
        if (res.ok) {
            const data = await res.json();
            setAssociations(data);
        }
    } catch (e) {
        console.error(e);
    }
  };

  const confirmDelete = async () => {
    if (!deletingUser) return;
    setIsDeleting(true);
    try {
        const res = await fetch(`/api/admin/users/${deletingUser.id}`, { method: 'DELETE' });
        if (res.ok) {
            setUsers(users.filter(u => u.id !== deletingUser.id));
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
    <div className="relative w-full overflow-auto border rounded-xl bg-card shadow-sm">
      <table className="w-full caption-bottom text-sm">
        <thead className="bg-muted/50 border-b">
          <tr>
            <th className="h-12 px-6 text-left align-middle font-medium text-muted-foreground">User</th>
            <th className="h-12 px-6 text-left align-middle font-medium text-muted-foreground">Permissions</th>
            <th className="h-12 px-6 text-center align-middle font-medium text-muted-foreground">Max Jobs</th>
            <th className="h-12 px-6 text-right align-middle font-medium text-muted-foreground">Control</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {users.map((user) => (
            <tr key={user.id} className="hover:bg-muted/20 transition-colors">
              <td className="p-6 align-middle">
                <div className="flex flex-col">
                    <span className="font-semibold text-foreground">{user.email}</span>
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">ID: {user.id.slice(0, 8)}...</span>
                </div>
              </td>
              <td className="p-6 align-middle">
                <select
                  value={user.role}
                  onChange={(e) => updateUser(user.id, { role: e.target.value })}
                  disabled={updatingUserId === user.id}
                  className={cn(
                    "bg-card/90 backdrop-blur-md border border-border hover:border-emerald-500/50 rounded-lg px-3 py-1.5 text-xs font-bold focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all cursor-pointer shadow-xl",
                    updatingUserId === user.id && "opacity-50 cursor-not-allowed",
                    user.role === 'ADMIN' ? 'text-blue-400' : 
                    user.role === 'BLOCKED' ? 'text-destructive' : 'text-emerald-400'
                  )}
                >
                  <option value="ADMIN">ADMIN</option>
                  <option value="USER">USER</option>
                  <option value="PENDING">PENDING</option>
                  <option value="BLOCKED">BLOCKED</option>
                </select>
              </td>
              <td className="p-6 align-middle text-center">
                <div className="flex justify-center">
                    <Input
                    type="number"
                    value={user.maxJobs}
                    onChange={(e) => updateUser(user.id, { maxJobs: parseInt(e.target.value) || 1 })}
                    disabled={updatingUserId === user.id}
                    className="w-16 h-8 text-center font-bold"
                    min={1}
                    max={100}
                    />
                </div>
              </td>
              <td className="p-6 align-middle text-right">
                <div className="flex items-center justify-end gap-2">
                    {user.role === 'PENDING' && (
                    <Button 
                        size="sm" 
                        variant="default"
                        className="bg-green-600 hover:bg-green-700 h-8"
                        onClick={() => updateUser(user.id, { role: 'USER' })}
                        disabled={updatingUserId === user.id}
                    >
                        {updatingUserId === user.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                            <>
                                <CheckCircle2 className="mr-2 h-3.5 w-3.5" />
                                Approve
                            </>
                        )}
                    </Button>
                    )}
                    {user.role !== 'BLOCKED' && user.role !== 'ADMIN' && (
                        <Button 
                            size="sm" 
                            variant="destructive" 
                            className="h-8"
                            onClick={() => updateUser(user.id, { role: 'BLOCKED' })}
                            disabled={updatingUserId === user.id}
                        >
                            {updatingUserId === user.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                                <>
                                    <Ban className="mr-2 h-3.5 w-3.5" />
                                    Block
                                </>
                            )}
                        </Button>
                    )}
                    {user.role === 'BLOCKED' && (
                        <Button 
                            size="sm" 
                            variant="outline" 
                            className="h-8 border-green-500/50 text-green-500 hover:bg-green-500/10"
                            onClick={() => updateUser(user.id, { role: 'USER' })}
                            disabled={updatingUserId === user.id}
                        >
                            {updatingUserId === user.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                                <>
                                    <CheckCircle2 className="mr-2 h-3.5 w-3.5" />
                                    Restore
                                </>
                            )}
                        </Button>
                    )}
                    {user.role !== 'ADMIN' && (
                        <Button 
                            size="sm" 
                            variant="ghost" 
                            className="h-8 text-muted-foreground hover:text-red-500 hover:bg-red-50"
                            onClick={() => handleDeleteClick(user)}
                            disabled={updatingUserId === user.id}
                        >
                            <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                    )}
                </div>
              </td>
            </tr>
          ))}
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
                        Are you sure you want to delete <span className="font-bold text-foreground">{deletingUser.email}</span>? 
                        This action is permanent and cannot be undone.
                    </p>

                    {associations ? (
                        <div className="bg-muted/50 rounded-lg p-4 space-y-2 border">
                            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Associated Data:</p>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="flex flex-col">
                                    <span className="text-lg font-bold">{associations.scans}</span>
                                    <span className="text-[10px] text-muted-foreground uppercase">Scans</span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-lg font-bold">{associations.templates}</span>
                                    <span className="text-[10px] text-muted-foreground uppercase">Templates</span>
                                </div>
                            </div>
                            <p className="text-[10px] text-red-500 italic mt-2">
                                All associated scans (and their results) and templates will be permanently deleted.
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
                                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Deleting...</>
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
