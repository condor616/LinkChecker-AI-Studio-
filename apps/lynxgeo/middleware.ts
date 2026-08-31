import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';
import { getJwtSecretKey } from '@lynx/auth';

function loginRedirect(request: NextRequest, extra?: Record<string, string>) {
  const loginUrl = new URL('/login', request.url);
  const { pathname, search } = request.nextUrl;
  loginUrl.searchParams.set('callbackUrl', `${pathname}${search}`);
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      loginUrl.searchParams.set(key, value);
    }
  }
  return NextResponse.redirect(loginUrl);
}

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
    return loginRedirect(request);
  }
  try {
    const { payload } = await jwtVerify(token, getJwtSecretKey());
    const userRole = payload.role as string;
    if (userRole === 'BLOCKED' && !pathname.startsWith('/api/auth/logout')) {
      return pathname.startsWith('/api/')
        ? NextResponse.json({ error: 'Account blocked' }, { status: 403 })
        : loginRedirect(request, { error: 'account_blocked' });
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
    return loginRedirect(request);
  }
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
