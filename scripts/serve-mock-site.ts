import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import { basicAuth } from 'hono/basic-auth';
import path from 'path';
import fs from 'fs';
import net from 'net';

const app = new Hono();
const MOCK_SITE_ROOT = path.join(process.cwd(), 'tests/mock-site');

// ... (rest of the app logic)


// Serve static files with automatic .html extension support
app.use('/*', async (c, next) => {
    const urlPath = c.req.path;
    if (urlPath.startsWith('/protected') || urlPath.startsWith('/redirect') || urlPath.startsWith('/errors') || urlPath === '/slow' || urlPath === '/external-broken') {
        return next();
    }

    const filePath = path.join(MOCK_SITE_ROOT, urlPath === '/' ? 'index.html' : urlPath);
    
    // Check if it's a directory (should serve index.html)
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
        const indexFile = path.join(filePath, 'index.html');
        if (fs.existsSync(indexFile)) {
            return c.html(fs.readFileSync(indexFile, 'utf-8'));
        }
    }

    // Check if it's a file with .html extension missing
    if (!fs.existsSync(filePath) && !path.extname(urlPath)) {
        const htmlFilePath = filePath + '.html';
        if (fs.existsSync(htmlFilePath)) {
            return c.html(fs.readFileSync(htmlFilePath, 'utf-8'));
        }
    }

    await next();
});

// Serve static files (fallback)
app.use('/*', serveStatic({ 
    root: './tests/mock-site',
    rewriteRequestPath: (path) => path.startsWith('/protected') ? '/__forbidden__' : path
}));

// Basic Auth for protected area
app.use('/protected/*', basicAuth({
    username: 'admin',
    password: 'password123'
}));

// Manually serve protected files to ensure auth middleware is checked
app.get('/protected/*', async (c) => {
    const filePath = path.join(MOCK_SITE_ROOT, c.req.path === '/protected/' ? 'protected/index.html' : c.req.path);
    if (fs.existsSync(filePath)) {
        return c.html(fs.readFileSync(filePath, 'utf-8'));
    }
    return c.text('Not Found', 404);
});

// Simulate specific error codes for testing
app.get('/errors/:code', (c) => {
    const code = parseInt(c.req.param('code'));
    return c.text(`Simulated Error ${code}`, { status: code as any });
});

// Simulate a slow response
app.get('/slow', async (c) => {
    await new Promise(resolve => setTimeout(resolve, 5000));
    return c.text('Slow Response');
});

// Handle Redirects
app.get('/redirect/:code', (c) => {
    const code = parseInt(c.req.param('code'));
    const target = '/';
    return c.redirect(target, code as any);
});

// Simulate an external link
app.get('/external-broken', (c) => {
    return c.text('Not Found', { status: 404 });
});

const port = 3002;

let serverInstance: any = null;

async function isPortInUse(port: number): Promise<boolean> {
    return new Promise((resolve) => {
        const server = net.createServer()
            .once('error', (err: any) => {
                if (err.code === 'EADDRINUSE') {
                    resolve(true);
                } else {
                    resolve(false);
                }
            })
            .once('listening', () => {
                server.close();
                resolve(false);
            })
            .listen(port);
    });
}

export async function startMockServer() {
    if (serverInstance) return serverInstance;
    
    const inUse = await isPortInUse(port);
    if (inUse) {
        console.log(`Mock Site Server already running on port ${port}.`);
        return null;
    }

    try {
        console.log(`Mock Site Server starting on http://localhost:${port}`);
        serverInstance = serve({
            fetch: app.fetch,
            port
        });
        return serverInstance;
    } catch (e: any) {
        if (e.code === 'EADDRINUSE') {
            return null;
        }
        throw e;
    }
}



export { port };

// Auto-start if run directly
if (require.main === module) {
    startMockServer();
}
