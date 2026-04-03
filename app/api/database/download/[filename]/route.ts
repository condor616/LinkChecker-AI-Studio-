import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { requireApprovedUser } from '@/lib/auth';

function getFunny404Html() {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>404 - Playing Hide and Seek</title>
      <style>
        :root {
          --primary: #a855f7;
          --background: #0c0c0e;
          --card: #18181b;
          --foreground: #ffffff;
        }
        body {
          margin: 0;
          padding: 0;
          background-color: var(--background);
          color: var(--foreground);
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100vh;
          overflow: hidden;
        }
        .bg-glow {
          position: absolute;
          inset: 0;
          pointer-events: none;
        }
        .glow-1 {
          position: absolute;
          top: -10%;
          left: -10%;
          width: 50%;
          height: 50%;
          background: rgba(168, 85, 247, 0.1);
          filter: blur(150px);
          border-radius: 50%;
        }
        .glow-2 {
          position: absolute;
          bottom: 10%;
          right: -5%;
          width: 40%;
          height: 40%;
          background: rgba(16, 185, 129, 0.05);
          filter: blur(120px);
          border-radius: 50%;
        }
        .card {
          background: rgba(255, 255, 255, 0.02);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          padding: 4rem;
          border-radius: 2rem;
          text-align: center;
          max-width: 500px;
          position: relative;
          z-index: 10;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
        }
        .icon {
          font-size: 4rem;
          margin-bottom: 2rem;
          display: block;
        }
        h1 {
          font-size: 3rem;
          font-weight: 900;
          margin: 0;
          letter-spacing: -0.05em;
          line-height: 1;
        }
        .gradient-text {
          background: linear-gradient(to right, #a855f7, #22d3ee, #10b981);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        p {
          font-size: 1.125rem;
          color: #94a3b8;
          margin: 1.5rem 0 2.5rem;
          line-height: 1.6;
        }
        .btn {
          display: inline-block;
          background: linear-gradient(to right, #a855f7, #4f46e5);
          color: white;
          padding: 1rem 2.5rem;
          border-radius: 0.75rem;
          text-decoration: none;
          font-weight: 700;
          transition: all 0.3s ease;
          box-shadow: 0 0 20px rgba(168, 85, 247, 0.3);
        }
        .btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 0 30px rgba(168, 85, 247, 0.5);
        }
      </style>
    </head>
    <body>
      <div class="bg-glow">
        <div class="glow-1"></div>
        <div class="glow-2"></div>
      </div>
      <div class="card">
        <span class="icon">🐾</span>
        <h1><span class="gradient-text">Oops!</span></h1>
        <p>
          Our Lynx looked everywhere, but it seems this resource has escaped into the digital wilderness.
        </p>
        <a href="/" class="btn">Return to Safety</a>
      </div>
    </body>
    </html>
  `;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const { filename } = await params;
    const session = await requireApprovedUser();
    const username = session.email.split('@')[0];

    // Security check: Ownership (Obfuscated 404 with HTML Page)
    if (!filename.startsWith(`${username}-`)) {
      return new NextResponse(getFunny404Html(), {
        status: 404,
        headers: { 'Content-Type': 'text/html' },
      });
    }

    const backupDir = path.join(process.cwd(), 'data/backups');
    const filePath = path.join(backupDir, filename);

    // Security: Ensure it's inside data/backups and is a .zip
    const normalizedPath = path.normalize(filePath);
    if (!normalizedPath.startsWith(backupDir) || !filename.endsWith('.zip')) {
      return new NextResponse(getFunny404Html(), {
        status: 404, // Use 404 for consistency
        headers: { 'Content-Type': 'text/html' },
      });
    }

    if (!(await fs.stat(filePath).catch(() => false))) {
      return new NextResponse(getFunny404Html(), {
        status: 404,
        headers: { 'Content-Type': 'text/html' },
      });
    }

    const fileBuffer = await fs.readFile(filePath);

    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Download failed:', error);
    return new NextResponse(getFunny404Html(), {
      status: 500,
      headers: { 'Content-Type': 'text/html' },
    });
  }
}
