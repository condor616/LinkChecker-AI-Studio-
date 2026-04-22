
import { processLink } from '../lib/crawler/processor';

async function verify() {
    const mockDb = {
        select: () => ({
            from: () => ({
                where: () => ({
                    then: (cb) => cb([{ status: 'RUNNING' }])
                })
            })
        }),
        update: (table) => ({
            set: (data) => {
                console.log(`DB Update on ${table.name || 'links'}:`, JSON.stringify(data, null, 2));
                return {
                    where: () => Promise.resolve()
                };
            }
        })
    };

    const link = { url: 'https://www.td.org/press-release/71-organizations-win-prestigious-atd-best-award', depth: 1 };
    const scan = { id: 'test-scan' };
    const config = { startUrl: 'https://other-domain.com', skipExternal: true };

    console.log('Testing processLink with external broken link...');
    try {
        await processLink(mockDb, link, scan, config);
    } catch (e) {
        console.error('Error during verification:', e);
    }
}

verify();
