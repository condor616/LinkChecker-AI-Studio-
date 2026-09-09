export type CrawlAuth = {
  username: string;
  password: string;
};

export type CrawlConfig = {
  startUrl: string;
  maxDepth?: number;
  randomDelay?: number;
  skipExternal?: boolean;
  excludeSubdomains?: boolean;
  doNotTraverseBackward?: boolean;
  saveSkippedLinks?: boolean;
  userAgent?: string;
  customUserAgent?: string;
  targetUrls?: string[];
  skipSelectors?: string[];
  regexRules?: string[];
  wildcardExclusions?: string[];
  excludeRegex?: string;
  auth?: CrawlAuth;
  isTargeted?: boolean;
  /**
   * When true: mid-crawl eager FlareSolverr unlock (host cookies) + end-of-scan
   * safety net for remaining CHALLENGED URLs (once per crawl wave).
   */
  bypassCloudflare?: boolean;
  /** Runtime phase persisted on scan config: crawling | cloudflare */
  phase?: 'crawling' | 'cloudflare';
  /**
   * After an end-of-scan FlareSolverr pass finishes with no new discoveries,
   * set so we do not re-enqueue forever for permanently blocked hosts.
   */
  cloudflareBypassPassDone?: boolean;
  [key: string]: unknown;
};

export type DiscoveredLink = {
  url: string;
  parentUrl: string;
  snippet: string;
  depth: number;
};

export type FetchedResource = {
  url: string;
  fetchUrl: string;
  ok: boolean;
  statusCode: number | null;
  contentType: string;
  headers: Record<string, string>;
  bodyText: string | null;
  blockedBySsrf: boolean;
  authGated: boolean;
  /** Cloudflare / WAF challenge interstitial (including HTTP 200). */
  challenged: boolean;
  skipReason: string | null;
  error: string | null;
};
