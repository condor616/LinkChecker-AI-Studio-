import { describe, it, expect, beforeAll } from 'vitest';
import { getDb, getUserDbName } from '../../lib/db';
import { scans, links } from '../../lib/db/schema';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';
import { filterAndGroupLinks, generateCSV, generateJSON, generateHTML } from '../../lib/utils/export-utils';

describe('Export Utils & Logic', () => {
    const testDb = getDb();
    const userId = 'test-user-export';
    const scanId = crypto.randomUUID();

    const mockScan = {
        id: scanId,
        userId,
        name: 'Test Export Scan',
        status: 'COMPLETED',
        config: JSON.stringify({ startUrl: 'https://example.com' }),
        createdAt: new Date(),
        updatedAt: new Date()
    };

    const mockLinks = [
        { id: '1', scanId, url: 'https://example.com', status: 'SUCCESS', statusCode: 200, depth: 0 },
        { id: '2', scanId, url: 'https://example.com/broken', parentUrl: 'https://example.com', status: 'BROKEN', statusCode: 404, error: 'Not Found', depth: 1 },
        { id: '3', scanId, url: 'https://example.com/other', parentUrl: 'https://example.com', status: 'SUCCESS', statusCode: 200, depth: 1 },
        { id: '4', scanId, url: 'https://example.com/broken', parentUrl: 'https://example.com/other', status: 'BROKEN', statusCode: 404, error: 'Not Found', depth: 2 }
    ];

    it('should group links correctly and calculate counts', () => {
        const config = JSON.parse(mockScan.config);
        const grouped = filterAndGroupLinks(mockLinks, config);
        
        expect(grouped.length).toBe(3); // 3 unique URLs
        const brokenGroup = grouped.find(g => g.url.includes('broken'));
        expect(brokenGroup?.count).toBe(2);
        expect(brokenGroup?.status).toBe('BROKEN');
    });

    it('should generate valid CSV', () => {
        const config = JSON.parse(mockScan.config);
        const grouped = filterAndGroupLinks(mockLinks, config);
        const csv = generateCSV(grouped);
        
        expect(csv).toContain('URL,Status,Status Code,Error,Type,Parent URL,Snippet');
        expect(csv).toContain('"https://example.com/broken","BROKEN","404","Not Found"');
        expect(csv.split('\n').length).toBe(mockLinks.length + 1); // Header + all instances
    });

    it('should generate interactive HTML with required elements', () => {
        const config = JSON.parse(mockScan.config);
        const grouped = filterAndGroupLinks(mockLinks, config);
        const html = generateHTML(mockScan, grouped);
        
        expect(html).toContain('<!DOCTYPE html>');
        expect(html).toContain(mockScan.name);
        expect(html).toContain('id="searchInput"');
        expect(html).toContain('onclick="setFilter(\'BROKEN\', this)"');
        expect(html).toContain('class="link-row broken"');
        expect(html).toContain('function filterTable()');
    });

    it('should respect targeted mode in filtering', () => {
        const targetedConfig = {
            startUrl: 'https://example.com',
            isTargeted: true,
            targetUrls: ['https://example.com/broken']
        };
        const grouped = filterAndGroupLinks(mockLinks, targetedConfig);
        
        expect(grouped.length).toBe(1);
        expect(grouped[0].url).toBe('https://example.com/broken');
    });
});
