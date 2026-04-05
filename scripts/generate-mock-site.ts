import fs from 'fs';
import path from 'path';

const MOCK_SITE_ROOT = path.join(process.cwd(), 'tests/mock-site');
const COUNTRIES = ['it-it', 'de-de', 'en-us', 'fr-fr', 'es-es'];

function ensureDir(dir: string) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function generateHeader() {
    return `
    <header id="main-header">
        <nav>
            <ul>
                <li><a href="/">Home</a></li>
                ${COUNTRIES.map(c => `<li><a href="/${c}/">${c.toUpperCase()}</a></li>`).join('')}
                <li><a href="/external-broken" class="external">External Broken Link (404)</a></li>
            </ul>
        </nav>
    </header>`;
}

function generateFooter() {
    return `
    <footer id="main-footer">
        <p>&copy; 2026 Lynx Scan Test Site</p>
        <ul>
            <li><a href="/privacy">Privacy Policy</a></li>
            <li><a href="/terms">Terms of Service</a></li>
            <li><a href="/assets/logo.png">Logo</a></li>
        </ul>
    </footer>`;
}

function generatePage(title: string, content: string, country?: string) {
    const countryPrefix = country ? `/${country}/` : '/';
    return `
<!DOCTYPE html>
<html lang="${country || 'en'}">
<head>
    <meta charset="UTF-8">
    <title>${title} | Lynx Scan Mock</title>
    <link rel="stylesheet" href="/assets/style.css">
</head>
<body>
    ${generateHeader()}
    <div class="container">
        <aside id="sidebar">
            <h3>Navigation</h3>
            <ul>
                <li><a href="${countryPrefix}">Dashboard</a></li>
                <li><a href="${countryPrefix}section1">Section 1</a></li>
                <li><a href="${countryPrefix}section2">Section 2</a></li>
                <li><a href="/features/anchors">Anchors Test</a></li>
                <li><a href="/features/query?param=value&test=1">Query Params</a></li>
                <li><a href="/features/protocols">Special Protocols</a></li>
                <li><a href="/redirect/301">301 Redirect</a></li>
                <li><a href="/redirect/302">302 Redirect</a></li>
            </ul>
        </aside>
        <main id="content">
            <h1>${title}</h1>
            ${content}
        </main>
    </div>
    ${generateFooter()}
</body>
</html>`;
}

function main() {
    console.log('Generating Mock Site at:', MOCK_SITE_ROOT);

    // 1. Setup Structure
    ensureDir(MOCK_SITE_ROOT);
    ensureDir(path.join(MOCK_SITE_ROOT, 'assets'));
    ensureDir(path.join(MOCK_SITE_ROOT, 'errors'));
    
    fs.writeFileSync(path.join(MOCK_SITE_ROOT, 'assets/style.css'), 'body { font-family: sans-serif; }');
    
    // 2. Main Index
    fs.writeFileSync(path.join(MOCK_SITE_ROOT, 'index.html'), generatePage('Global Home', '<p>Welcome to the global portal.</p>'));

    // 3. Country Sites
    COUNTRIES.forEach(country => {
        const countryDir = path.join(MOCK_SITE_ROOT, country);
        ensureDir(countryDir);
        
        // Country Home
        const homeContent = `
            <h2>${country.toUpperCase()} Homepage</h2>
            <p>Welcome to our ${country} regional site.</p>
            <ul>
                <li><a href="products">Products</a></li>
                <li><a href="contact">Contact Us</a></li>
                <li><a href="blog/">Blog (nested)</a></li>
                <li><a href="/errors/404">Broken link (global)</a></li>
            </ul>
        `;
        fs.writeFileSync(path.join(countryDir, 'index.html'), generatePage(`${country.toUpperCase()} Home`, homeContent, country));

        // Subpages
        const productsContent = Array.from({ length: 50 }).map((_, i) => 
            `<li><a href="product-${i}">Product ${i}</a></li>`
        ).join('');
        fs.writeFileSync(path.join(countryDir, 'products.html'), generatePage(`${country.toUpperCase()} Products`, `<ul>${productsContent}</ul>`, country));

        // Deep Nested
        const blogDir = path.join(countryDir, 'blog');
        ensureDir(blogDir);
        fs.writeFileSync(path.join(blogDir, 'index.html'), generatePage(`${country.toUpperCase()} Blog`, '<p>Our latest news.</p>', country));
    });

    // 4. Feature Pages
    const featuresDir = path.join(MOCK_SITE_ROOT, 'features');
    ensureDir(featuresDir);

    // Anchors
    const anchorsContent = `
        <p>This page tests anchor links.</p>
        <div style="height: 1000px; background: #eee;">Spacer</div>
        <h2 id="section1">Section 1</h2>
        <p>Content for section 1.</p>
        <div style="height: 1000px; background: #ddd;">Spacer</div>
        <h2 id="section2">Section 2</h2>
        <p>Content for section 2.</p>
        <ul>
            <li><a href="#section1">Internal Anchor (Section 1)</a></li>
            <li><a href="#section2">Internal Anchor (Section 2)</a></li>
            <li><a href="/features/anchors#section1">Absolute Anchor (Section 1)</a></li>
        </ul>
    `;
    fs.writeFileSync(path.join(featuresDir, 'anchors.html'), generatePage('Anchors Test', anchorsContent));

    // Query Params
    const queryContent = `
        <p>This page tests query parameters.</p>
        <ul>
            <li><a href="?q=1">Current page q=1</a></li>
            <li><a href="/features/query?q=2&user=test">Absolute page q=2</a></li>
            <li><a href="query?a=b">Relative page a=b</a></li>
        </ul>
    `;
    fs.writeFileSync(path.join(featuresDir, 'query.html'), generatePage('Query Params Test', queryContent));

    // Protocols
    const protocolsContent = `
        <p>This page tests different protocols.</p>
        <ul>
            <li><a href="mailto:support@example.com">Email Us</a></li>
            <li><a href="tel:+15551234567">Call Us</a></li>
            <li><a href="javascript:alert('hi')">JS Link (ignore)</a></li>
            <li><a href="//google.com">Protocol-relative (External)</a></li>
            <li><a href="data:text/plain;base64,SGVsbG8sIFdvcmxkIQ==">Data URI</a></li>
        </ul>
    `;
    fs.writeFileSync(path.join(featuresDir, 'protocols.html'), generatePage('Protocols Test', protocolsContent));

    // 5. Assets (Dummy Image and PDF)
    fs.writeFileSync(path.join(MOCK_SITE_ROOT, 'assets/logo.png'), 'fake-image-data');
    fs.writeFileSync(path.join(MOCK_SITE_ROOT, 'assets/report.pdf'), 'fake-pdf-data');

    // 6. Error Chamber
    const errorPages = [
        { code: 404, file: '404.html' },
        { code: 403, file: '403.html' },
        { code: 500, file: '500.html' }
    ];
    
    errorPages.forEach(err => {
        fs.writeFileSync(path.join(MOCK_SITE_ROOT, 'errors', err.file), generatePage(`Error ${err.code}`, `<p>This is a simulated ${err.code} error.</p>`));
    });

    // 7. Protected Chamber
    const protectedDir = path.join(MOCK_SITE_ROOT, 'protected');
    ensureDir(protectedDir);
    fs.writeFileSync(path.join(protectedDir, 'index.html'), generatePage('Protected Area', '<p>You have reached the VIP area.</p>'));

    console.log('Mock Site generated successfully.');
}


main();
