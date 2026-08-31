import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { UsersTable } from './users-table';

import { parseProductAccess } from '@lynx/auth';

export default async function AdminUsersPage() {
  await requireAdmin();
  const allUsers = await db.select().from(users);
  const initialUsers = allUsers.map((u) => ({
    ...u,
    productAccess: parseProductAccess(u.productAccess),
  }));

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">User Management</h1>
        <p className="text-muted-foreground mt-1">Approve pending users and manage resource limits.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Users</CardTitle>
        </CardHeader>
        <CardContent>
          <UsersTable initialUsers={initialUsers} />
        </CardContent>
      </Card>
    </div>
  );
}
