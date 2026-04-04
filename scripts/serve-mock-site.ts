import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import path from 'path';
import fs from 'fs';

const app = new Hono();
const MOCK_SITE_ROOT = path.join(process.cwd(), 'tests/mock-site');

// Serve static files from the mock site
app.use('/*', serveStatic({ root: './tests/mock-site' }));

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

// Simulate an external link
app.get('/external-broken', (c) => {
    return c.text('Not Found', { status: 404 });
});

const port = 3002;
console.log(`Mock Site Server starting on http://localhost:${port}`);

const server = serve({
  fetch: app.fetch,
  port
});

export { server, port };
