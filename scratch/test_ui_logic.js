
const targetUrls = ["https://mysite.com/target"];
const isTargeted = true;

const isUrlInternal = (url) => {
    return url.includes("mysite.com");
};

function filterLink(l) {
    if (l.status === 'SKIPPED') {
      if (isTargeted) {
        return !l.parentUrl || targetUrls.some((t) => {
          const cleanT = t.trim().replace(/\/$/, '');
          const cleanP = l.parentUrl.replace(/\/$/, '');
          return cleanP === cleanT || cleanP.includes(cleanT);
        });
      }
      const parent = l.parentUrl;
      if (!parent) return true;
      return isUrlInternal(parent);
    }

    if (isTargeted) {
      const isTarget = targetUrls.some((t) => {
        const cleanT = t.trim().replace(/\/$/, '');
        const cleanL = l.url.replace(/\/$/, '');
        return cleanL === cleanT || cleanL.includes(cleanT);
      });
      if (isTarget) return true;

      if (l.status === 'BROKEN' && l.parentUrl) {
        return targetUrls.some((t) => {
          const cleanT = t.trim().replace(/\/$/, '');
          const cleanP = l.parentUrl.replace(/\/$/, '');
          return cleanP === cleanT || cleanP.includes(cleanT);
        });
      }

      return false;
    }
    
    const parent = l.parentUrl;
    if (!parent) return true;
    return isUrlInternal(parent);
}

const testLinks = [
    { url: "https://mysite.com/target", status: "SUCCESS", parentUrl: null }, // Target
    { url: "https://google.com", status: "SKIPPED", parentUrl: "https://mysite.com/target" }, // External success on target
    { url: "https://broken.com", status: "BROKEN", parentUrl: "https://mysite.com/target" }, // External broken on target
    { url: "https://othersite.com", status: "BROKEN", parentUrl: "https://mysite.com/other" }, // External broken on non-target
];

testLinks.forEach(l => {
    console.log(`Link: ${l.url} (${l.status}) -> Included: ${filterLink(l)}`);
});
