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
                <li><a href="/${country || ''}">Dashboard</a></li>
                <li><a href="/${country || ''}section1">Section 1</a></li>
                <li><a href="/${country || ''}section2">Section 2</a></li>
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

    // 4. Error Chamber
    const errorPages = [
        { code: 404, file: '404.html' },
        { code: 403, file: '403.html' },
        { code: 500, file: '500.html' }
    ];
    
    errorPages.forEach(err => {
        fs.writeFileSync(path.join(MOCK_SITE_ROOT, 'errors', err.file), generatePage(`Error ${err.code}`, `<p>This is a simulated ${err.code} error.</p>`));
    });

    console.log('Mock Site generated successfully.');
}

main();
