
async function test() {
    const url = 'https://www.td.org/press-release/71-organizations-win-prestigious-atd-best-award';
    const response = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
    });
    console.log('Status:', response.status);
    console.log('OK:', response.ok);
}

test();
