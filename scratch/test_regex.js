
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
            } catch (e) {
                console.log("Regex error:", e);
            }
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

const testUrl = "https://www.novartis.com/about/awards-and-recognition";
console.log("Testing URL:", testUrl);
const result = shouldExclude(testUrl, config);
console.log("Result:", result);

const languageUrl = "https://www.novartis.com/en-us/about";
console.log("Testing Language URL (en-us):", languageUrl);
console.log("Result:", shouldExclude(languageUrl, config));

const problemUrl = "https://www.novartis.com/about/awards-and-recognition";
const problemNormalized = "novartis.com/about/awards-and-recognition";
const problemRegex = new RegExp("novartis\\.com/[a-z]{2}-[a-z]{2}(/|$)");

console.log("Regex:", problemRegex.source);
console.log("Full URL Match:", problemRegex.test(problemUrl));
console.log("Normalized URL Match:", problemRegex.test(problemNormalized));

const match = problemNormalized.match(problemRegex);
console.log("Match detail:", match);
