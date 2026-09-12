import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';
import { getJwtSecretKey } from '@/lib/security/jwt';
import { applySecurityHeaders, nextWithSecurityHeaders } from '@/lib/security/headers';

export async function middleware(request: NextRequest) {
  const token = request.cookies.get('session')?.value;
  const { pathname } = request.nextUrl;
  const requestUrl = request.url;

  // Public paths
  const isPublicPath =
    pathname === '/' ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/forgot-password') ||
    pathname.startsWith('/reset-password') ||
    pathname.startsWith('/api/auth') ||
    pathname.match(/\.(png|jpg|jpeg|gif|svg|ico|webp)$/);

  if (isPublicPath) {
    return nextWithSecurityHeaders(requestUrl);
  }

  if (!token) {
    if (pathname.startsWith('/api/')) {
      return applySecurityHeaders(
        NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
        requestUrl,
      );
    }
    return applySecurityHeaders(NextResponse.redirect(new URL('/login', request.url)), requestUrl);
  }

  try {
    const { payload } = await jwtVerify(token, getJwtSecretKey());
    const userRole = payload.role as string;

    // Check for BLOCKED users
    if (userRole === 'BLOCKED' && !pathname.startsWith('/api/auth/logout')) {
       // Clear session and redirect to login with error (simplified: just redirect)
       if (pathname.startsWith('/api/')) {
         return applySecurityHeaders(
           NextResponse.json({ error: 'Account blocked' }, { status: 403 }),
           requestUrl,
         );
       }
       return applySecurityHeaders(
         NextResponse.redirect(new URL('/login?error=account_blocked', request.url)),
         requestUrl,
       );
    }

    // Check for PENDING users
    if (userRole === 'PENDING' && !pathname.startsWith('/auth/pending') && !pathname.startsWith('/api/auth/logout')) {
      if (pathname.startsWith('/api/')) {
        return applySecurityHeaders(
          NextResponse.json({ error: 'Account pending approval' }, { status: 403 }),
          requestUrl,
        );
      }
      return applySecurityHeaders(
        NextResponse.redirect(new URL('/auth/pending', request.url)),
        requestUrl,
      );
    }

    const isAdminRoute = pathname.startsWith('/admin') || pathname.startsWith('/api/admin');
    
    // Check for ADMIN routes
    if (isAdminRoute && userRole?.toUpperCase() !== 'ADMIN') {
      if (pathname.startsWith('/api/')) {
        return applySecurityHeaders(
          NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
          requestUrl,
        );
      }
      return applySecurityHeaders(NextResponse.redirect(new URL('/', request.url)), requestUrl);
    }

    // Prevent access to pending page if already approved
    if (pathname.startsWith('/auth/pending') && userRole !== 'PENDING') {
      return applySecurityHeaders(NextResponse.redirect(new URL('/', request.url)), requestUrl);
    }

    return nextWithSecurityHeaders(requestUrl);
  } catch {
    if (pathname.startsWith('/api/')) {
      return applySecurityHeaders(
        NextResponse.json({ error: 'Invalid token' }, { status: 401 }),
        requestUrl,
      );
    }
    return applySecurityHeaders(NextResponse.redirect(new URL('/login', request.url)), requestUrl);
  }
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
