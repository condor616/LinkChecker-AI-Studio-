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
  skipReason: string | null;
  error: string | null;
};
