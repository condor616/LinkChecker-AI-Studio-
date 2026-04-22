
// Simulation of the new logic in processor.ts

function sanitizePattern(p) {
    if (!p) return null;
    let cleaned = p.trim().replace(/^["']|["']$/g, '');
    if (cleaned.includes('\\\\')) cleaned = cleaned.replace(/\\\\/g, '\\');
    return cleaned;
}

function shouldExclude(urlStr, config) {
    const normalizedUrl = urlStr.replace(/^https?:\/\/(www\.)?/, '');
    
    // 1. Legacy excludeRegex (Single string)
    if (config.excludeRegex) {
        const cleanRule = sanitizePattern(config.excludeRegex);
        if (cleanRule) {
            try {
                const re = new RegExp(cleanRule);
                if (re.test(urlStr) || re.test(normalizedUrl)) {
                    return { excluded: true, reason: `Legacy Regex Rule: ${cleanRule}` };
                }
            } catch (e) {}
        }
    }

    // 2. Modern regexRules (Array of strings)
    if (config.regexRules && Array.isArray(config.regexRules)) {
        for (const rule of config.regexRules) {
            const cleanRule = sanitizePattern(rule);
            if (!cleanRule) continue;
            try {
                const re = new RegExp(cleanRule);
                if (re.test(urlStr) || re.test(normalizedUrl)) {
                    return { excluded: true, reason: `Regex Rule: ${cleanRule}` };
                }
            } catch (e) {}
        }
    }

    // 3. Wildcard Exclusions
    if (config.wildcardExclusions && Array.isArray(config.wildcardExclusions)) {
        for (const pattern of config.wildcardExclusions) {
            const cleanPattern = sanitizePattern(pattern);
            if (!cleanPattern) continue;
            try {
                const regexStr = cleanPattern
                    .replace(/[.+*?^${}()|[\]\\]/g, '\\$&') // ESCAPE ALL including * and ?
                    .replace(/\\\*/g, '.*')
                    .replace(/\\\?/g, '.');
                
                const re = new RegExp(regexStr); // Removed strict anchors for better wildcard flexibility
                if (re.test(urlStr) || re.test(normalizedUrl)) {
                    return { excluded: true, reason: `Wildcard Rule: ${cleanPattern}` };
                }
            } catch (res) {}
        }
    }

    return { excluded: false };
}

function getSkipReason(urlStr, config) {
    try {
        const startUrlObj = new URL(config.startUrl);
        const currentUrlObj = new URL(urlStr);
        
        // Normalize hostnames (remove www. and lowercase)
        const startHost = startUrlObj.hostname.toLowerCase().replace(/^www\./, '');
        const currentHost = currentUrlObj.hostname.toLowerCase().replace(/^www\./, '');
        
        const isExactHost = currentHost === startHost;
        const isSubdomain = currentHost.endsWith('.' + startHost);
        const isInternal = isExactHost || isSubdomain;

        // 1. External
        if (!isInternal && config.skipExternal) {
            return `External link (Target: ${currentHost} vs Start: ${startHost})`;
        }

        // 2. Subdomain
        if (isSubdomain && !isExactHost && config.excludeSubdomains) {
            return `Subdomain excluded: ${currentHost}`;
        }

        // 3. Backward
        if (config.doNotTraverseBackward) {
            const normalize = (u) => u.toLowerCase().replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
            const normalizedStart = normalize(config.startUrl);
            const normalizedCurrent = normalize(urlStr);

            if (!normalizedCurrent.startsWith(normalizedStart)) {
                return `Stay in Subpath: ${normalizedCurrent} does not start with ${normalizedStart}`;
            } else {
                const remaining = normalizedCurrent.slice(normalizedStart.length);
                if (remaining.length > 0 && !remaining.startsWith('/')) {
                    return "Stay in Subpath: Not a sub-folder";
                }
            }
        }

        // 4. Regex/Wildcard
        const exclusion = shouldExclude(urlStr, config);
        if (exclusion.excluded) {
            return exclusion.reason || "Matches exclusion rule";
        }
    } catch (e) {
        return `Invalid URL format: ${e.message}`;
    }

    return null;
}

// Test with the user's config
const config = {
  "startUrl": "https://www.novartis.com",
  "regexRules": [
    "novartis\\.com/[a-z]{2}-[a-z]{2}(/|$)"
  ],
  "excludeRegex": "\\.pdf$", // Test legacy field support
  "skipExternal": true,
  "excludeSubdomains": true
};

const urls = [
    "https://www.novartis.com/about/awards-and-recognition", // Should NOT be skipped
    "https://www.novartis.com/en-us/about",                  // Should be skipped by Regex Rule
    "https://www.novartis.com/en-us",                        // Should be skipped by Regex Rule
    "https://www.novartis.com/report.pdf",                   // Should be skipped by Legacy Regex Rule
    "https://other-site.com",                                // Should be skipped as External
    "https://sub.novartis.com/page"                          // Should be skipped as Subdomain
];

console.log("--- Verification Results ---");
urls.forEach(url => {
    const reason = getSkipReason(url, config);
    console.log(`URL: ${url}`);
    console.log(`Result: ${reason ? 'SKIPPED' : 'OK'}`);
    if (reason) console.log(`Reason: ${reason}`);
    console.log('---');
});
