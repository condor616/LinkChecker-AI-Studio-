
const config = {
    startUrl: "https://mysite.com",
    skipExternal: true,
    saveSkippedLinks: true
};

function getIsInternal(urlStr, startUrl) {
    const startUrlObj = new URL(startUrl);
    const currentUrlObj = new URL(urlStr);
    const startHost = startUrlObj.hostname.toLowerCase().replace(/^www\./, '');
    const currentHost = currentUrlObj.hostname.toLowerCase().replace(/^www\./, '');
    const isExactHost = currentHost === startHost;
    const isSubdomain = currentHost.endsWith('.' + startHost);
    return isExactHost || isSubdomain;
}

function processLinkMock(url, isOk) {
    let status = isOk ? 'SUCCESS' : 'BROKEN';
    const isInternal = getIsInternal(url, config.startUrl);
    let skipReason = null;

    if (status === 'SUCCESS') {
        if (!isInternal && config.skipExternal) {
            skipReason = `External link (Verified)`;
        }
    }

    if (skipReason) {
        status = 'SKIPPED';
    }

    return { status, skipReason };
}

console.log("External Success:", processLinkMock("https://google.com", true));
console.log("External Broken:", processLinkMock("https://google.com/404", false));
console.log("Internal Success:", processLinkMock("https://mysite.com/page", true));
console.log("Internal Broken:", processLinkMock("https://mysite.com/404", false));
