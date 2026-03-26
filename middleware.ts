import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const SECRET_KEY = new TextEncoder().encode(
  process.env.JWT_SECRET || 'super-secret-key-for-local-dev-only-change-in-prod'
);

export async function middleware(request: NextRequest) {
  const token = request.cookies.get('session')?.value;
  const { pathname } = request.nextUrl;

  // Public paths
  if (pathname.startsWith('/login') || pathname.startsWith('/api/auth')) {
    return NextResponse.next();
  }

  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  try {
    const { payload } = await jwtVerify(token, SECRET_KEY);
    const userRole = payload.role as string;

    // Check for BLOCKED users
    if (userRole === 'BLOCKED' && !pathname.startsWith('/api/auth/logout')) {
       // Clear session and redirect to login with error (simplified: just redirect)
       return NextResponse.redirect(new URL('/login?error=account_blocked', request.url));
    }

    // Check for PENDING users
    if (userRole === 'PENDING' && !pathname.startsWith('/auth/pending') && !pathname.startsWith('/api/auth/logout')) {
      return NextResponse.redirect(new URL('/auth/pending', request.url));
    }

    const isAdminRoute = pathname.startsWith('/admin') || pathname.startsWith('/api/admin');
    
    // Check for ADMIN routes
    if (isAdminRoute && userRole?.toUpperCase() !== 'ADMIN') {
      return NextResponse.redirect(new URL('/', request.url));
    }

    // Prevent access to pending page if already approved
    if (pathname.startsWith('/auth/pending') && userRole !== 'PENDING') {
      return NextResponse.redirect(new URL('/', request.url));
    }

    return NextResponse.next();
  } catch (error) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
