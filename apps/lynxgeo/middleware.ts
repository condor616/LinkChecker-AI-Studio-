import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';
import { getJwtSecretKey } from '@lynx/auth';

export async function middleware(request: NextRequest) {
  const token = request.cookies.get('session')?.value;
  const { pathname } = request.nextUrl;
  const isPublic =
    pathname === '/' ||
    pathname.startsWith('/docs') ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/api/auth') ||
    !!pathname.match(/\.(png|jpg|jpeg|gif|svg|ico|webp)$/);

  if (isPublic) return NextResponse.next();
  if (!token) {
    if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.redirect(new URL('/login', request.url));
  }
  try {
    const { payload } = await jwtVerify(token, getJwtSecretKey());
    const userRole = payload.role as string;
    if (userRole === 'BLOCKED' && !pathname.startsWith('/api/auth/logout')) {
      return pathname.startsWith('/api/')
        ? NextResponse.json({ error: 'Account blocked' }, { status: 403 })
        : NextResponse.redirect(new URL('/login?error=account_blocked', request.url));
    }
    if (userRole === 'PENDING' && !pathname.startsWith('/auth/pending') && !pathname.startsWith('/api/auth/logout')) {
      return pathname.startsWith('/api/')
        ? NextResponse.json({ error: 'Account pending approval' }, { status: 403 })
        : NextResponse.redirect(new URL('/auth/pending', request.url));
    }
    if ((pathname.startsWith('/admin') || pathname.startsWith('/api/admin')) && userRole?.toUpperCase() !== 'ADMIN') {
      return pathname.startsWith('/api/')
        ? NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        : NextResponse.redirect(new URL('/', request.url));
    }
    return NextResponse.next();
  } catch {
    if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    return NextResponse.redirect(new URL('/login', request.url));
  }
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
