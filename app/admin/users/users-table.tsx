'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Shield, User, ShieldAlert, Ban, CheckCircle2 } from 'lucide-react';

export function UsersTable({ initialUsers }: { initialUsers: any[] }) {
  const [users, setUsers] = useState(initialUsers);

  const updateUser = async (id: string, updates: any) => {
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        setUsers(users.map(u => u.id === id ? { ...u, ...updates } : u));
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
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
                  className={`bg-background border rounded-md px-2 py-1 text-xs font-semibold focus:ring-2 focus:ring-primary/20 outline-none
                    ${user.role === 'ADMIN' ? 'text-blue-500' : 
                      user.role === 'BLOCKED' ? 'text-red-500' : 'text-foreground'}
                  `}
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
                    >
                        <CheckCircle2 className="mr-2 h-3.5 w-3.5" />
                        Approve
                    </Button>
                    )}
                    {user.role !== 'BLOCKED' && user.role !== 'ADMIN' && (
                        <Button 
                            size="sm" 
                            variant="destructive" 
                            className="h-8"
                            onClick={() => updateUser(user.id, { role: 'BLOCKED' })}
                        >
                            <Ban className="mr-2 h-3.5 w-3.5" />
                            Block
                        </Button>
                    )}
                    {user.role === 'BLOCKED' && (
                        <Button 
                            size="sm" 
                            variant="outline" 
                            className="h-8 border-green-500/50 text-green-500 hover:bg-green-500/10"
                            onClick={() => updateUser(user.id, { role: 'USER' })}
                        >
                            <CheckCircle2 className="mr-2 h-3.5 w-3.5" />
                            Restore
                        </Button>
                    )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
