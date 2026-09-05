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
    <div className="p-4 sm:p-6 md:p-8 space-y-6 sm:space-y-8">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">User Management</h1>
        <p className="text-muted-foreground mt-1">Approve pending users and manage resource limits.</p>
      </div>

      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle>All Users</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
          <UsersTable initialUsers={initialUsers} />
        </CardContent>
      </Card>
    </div>
  );
}
