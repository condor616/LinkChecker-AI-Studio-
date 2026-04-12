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
  const isPublicPath = 
    pathname === '/' || 
    pathname.startsWith('/login') || 
    pathname.startsWith('/api/auth') || 
    pathname.match(/\.(png|jpg|jpeg|gif|svg|ico|webp)$/);

  if (isPublicPath) {
    return NextResponse.next();
  }

  if (!token) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }

  try {
    const { payload } = await jwtVerify(token, SECRET_KEY);
    const userRole = payload.role as string;

    // Check for BLOCKED users
    if (userRole === 'BLOCKED' && !pathname.startsWith('/api/auth/logout')) {
       // Clear session and redirect to login with error (simplified: just redirect)
       if (pathname.startsWith('/api/')) {
         return NextResponse.json({ error: 'Account blocked' }, { status: 403 });
       }
       return NextResponse.redirect(new URL('/login?error=account_blocked', request.url));
    }

    // Check for PENDING users
    if (userRole === 'PENDING' && !pathname.startsWith('/auth/pending') && !pathname.startsWith('/api/auth/logout')) {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Account pending approval' }, { status: 403 });
      }
      return NextResponse.redirect(new URL('/auth/pending', request.url));
    }

    const isAdminRoute = pathname.startsWith('/admin') || pathname.startsWith('/api/admin');
    
    // Check for ADMIN routes
    if (isAdminRoute && userRole?.toUpperCase() !== 'ADMIN') {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      return NextResponse.redirect(new URL('/', request.url));
    }

    // Prevent access to pending page if already approved
    if (pathname.startsWith('/auth/pending') && userRole !== 'PENDING') {
      return NextResponse.redirect(new URL('/', request.url));
    }

    return NextResponse.next();
  } catch (error) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
