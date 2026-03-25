'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

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
    <div className="relative w-full overflow-auto">
      <table className="w-full caption-bottom text-sm">
        <thead className="[&_tr]:border-b">
          <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
            <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Email</th>
            <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Role</th>
            <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Max Jobs</th>
            <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Actions</th>
          </tr>
        </thead>
        <tbody className="[&_tr:last-child]:border-0">
          {users.map((user) => (
            <tr key={user.id} className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
              <td className="p-4 align-middle">{user.email}</td>
              <td className="p-4 align-middle">
                <select
                  value={user.role}
                  onChange={(e) => updateUser(user.id, { role: e.target.value })}
                  className="bg-transparent border rounded p-1"
                >
                  <option value="ADMIN">Admin</option>
                  <option value="USER">User</option>
                  <option value="PENDING">Pending</option>
                </select>
              </td>
              <td className="p-4 align-middle">
                <Input
                  type="number"
                  value={user.maxJobs}
                  onChange={(e) => updateUser(user.id, { maxJobs: parseInt(e.target.value) })}
                  className="w-20 h-8"
                  min={1}
                />
              </td>
              <td className="p-4 align-middle">
                {user.role === 'PENDING' && (
                  <Button size="sm" onClick={() => updateUser(user.id, { role: 'USER' })}>
                    Approve
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
