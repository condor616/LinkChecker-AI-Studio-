import { redirect } from 'next/navigation';
import { requireGeoUser } from '@/lib/auth';

export default async function TemplatesLayout({ children }: { children: React.ReactNode }) {
  try {
    await requireGeoUser();
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'Unauthorized') redirect('/login');
    if (message.startsWith('Forbidden')) {
      if (message.includes('pending')) redirect('/auth/pending');
      redirect('/');
    }
    throw error;
  }
  return children;
}
