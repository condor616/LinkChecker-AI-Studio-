
async function test() {
    const url = 'https://www.td.org/press-release/71-organizations-win-prestigious-atd-best-award';
    const headers = { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'en-US,en;q=0.9',
        'sec-fetch-mode': 'navigate',
        'sec-fetch-site': 'none',
        'sec-fetch-user': '?1',
        'sec-fetch-dest': 'document',
    };
    const response = await fetch(url, { headers });
    console.log('Status:', response.status);
    console.log('OK:', response.ok);
}

test();
