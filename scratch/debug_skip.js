
const config = {
  "name": "Novartis.com",
  "startUrl": "https://www.novartis.com",
  "maxDepth": 4,
  "rateLimit": 60,
  "excludeRegex": "",
  "userAgent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
  "customUserAgent": "",
  "randomDelay": 500,
  "auth": {
    "username": "",
    "password": ""
  },
  "regexRules": [
    "novartis\\.com/[a-z]{2}-[a-z]{2}(/|$)"
  ],
  "skipSelectors": [
    "#block-cosmos-languagecountryselectorfordesktop",
    "#block-cosmos-languagecountryselectorformobile"
  ],
  "wildcardExclusions": [
    "novartis.com/careers/career-search*",
    "novartis.com/acc-es/*",
    "novartis.com/news/media-releases/*",
    "novartis.com/tags/*",
    "novartis.com/news/media-library/*",
    "novartis.com/careers/career-search/job/details/*",
    "novartis.com/node/*",
    "novartis.com/clinicaltrials/study/*",
    "novartis.com/stories/*"
  ],
  "isTargeted": false,
  "targetUrls": [],
  "skipExternal": true,
  "excludeSubdomains": true,
  "doNotTraverseBackward": false,
  "saveSkippedLinks": false
};

function sanitizePattern(p) {
    if (!p) return null;
    let cleaned = p.trim().replace(/^["']|["']$/g, '');
    if (cleaned.includes('\\\\')) cleaned = cleaned.replace(/\\\\/g, '\\');
    return cleaned;
}

function shouldExclude(urlStr, config) {
    const normalizedUrl = urlStr.replace(/^https?:\/\/(www\.)?/, '');
    
    if (config.regexRules && Array.isArray(config.regexRules)) {
        for (const rule of config.regexRules) {
            const cleanRule = sanitizePattern(rule);
            if (!cleanRule) continue;
            try {
                const re = new RegExp(cleanRule);
                if (re.test(urlStr) || re.test(normalizedUrl)) {
                    return { excluded: true, reason: `Regex: ${cleanRule}` };
                }
            } catch (e) {}
        }
    }

    if (config.wildcardExclusions && Array.isArray(config.wildcardExclusions)) {
        for (const pattern of config.wildcardExclusions) {
            const cleanPattern = sanitizePattern(pattern);
            if (!cleanPattern) continue;
            try {
                const regexStr = cleanPattern
                    .replace(/[.+*?^${}()|[\]\\]/g, '\\$&') 
                    .replace(/\\\*/g, '.*')
                    .replace(/\\\?/g, '.');
                
                const re = new RegExp(regexStr); 
                if (re.test(urlStr) || re.test(normalizedUrl)) {
                    return { excluded: true, reason: `Wildcard: ${cleanPattern}` };
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
        const startHost = startUrlObj.hostname.toLowerCase().replace(/^www\./, '');
        const currentHost = currentUrlObj.hostname.toLowerCase().replace(/^www\./, '');
        
        const isExactHost = currentHost === startHost;
        const isSubdomain = currentHost.endsWith('.' + startHost);
        const isInternal = isExactHost || isSubdomain;

        // 1. External
        if (!isInternal && config.skipExternal) {
            return "External link (skipExternal enabled)";
        }

        // 2. Subdomain
        if (isSubdomain && !isExactHost && config.excludeSubdomains) {
            return "Subdomain (excludeSubdomains enabled)";
        }

        // 3. Backward
        if (config.doNotTraverseBackward) {
            const normalize = (u) => u.toLowerCase().replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
            const normalizedStart = normalize(config.startUrl);
            const normalizedCurrent = normalize(urlStr);

            if (!normalizedCurrent.startsWith(normalizedStart)) {
                return "Stay in Subpath (traversing backward)";
            } else {
                const remaining = normalizedCurrent.slice(normalizedStart.length);
                if (remaining.length > 0 && !remaining.startsWith('/')) {
                    return "Stay in Subpath (not a sub-folder)";
                }
            }
        }

        // 4. Regex/Wildcard
        const exclusion = shouldExclude(urlStr, config);
        if (exclusion.excluded) {
            return exclusion.reason || "Matches exclusion rule";
        }
    } catch (e) {
        return "Invalid URL format: " + e.message;
    }

    return null;
}

const testUrl = "https://www.novartis.com/about/awards-and-recognition";
console.log("Testing URL:", testUrl);
console.log("Skip Reason:", getSkipReason(testUrl, config));

const homepage = "https://www.novartis.com";
console.log("Homepage Skip Reason:", getSkipReason(homepage, config));
