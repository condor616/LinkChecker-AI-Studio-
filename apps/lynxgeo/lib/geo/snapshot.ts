import type { Finding, PlaybookItem } from './score';
import { SCORE_MODEL_VERSION, type CategoryScores } from './score';

export type FrozenSnapshot = {
  score: number;
  scoreModelVersion: string;
  categories: CategoryScores;
  findings: Finding[];
  playbook: PlaybookItem[];
  pages: { url: string; status: string; statusCode: number | null }[];
  frozenAt: string;
};

export function freezeSnapshot(input: {
  score: number;
  categories: CategoryScores;
  findings: Finding[];
  playbook: PlaybookItem[];
  pages: FrozenSnapshot['pages'];
}): FrozenSnapshot {
  return {
    score: input.score,
    scoreModelVersion: SCORE_MODEL_VERSION,
    categories: input.categories,
    findings: input.findings,
    playbook: input.playbook,
    pages: input.pages,
    frozenAt: new Date().toISOString(),
  };
}

export type SnapshotDiff = {
  rubricChanged: boolean;
  scoreDelta: number;
  resolved: Finding[];
  newIssues: Finding[];
};

export function diffSnapshots(from: FrozenSnapshot, to: FrozenSnapshot): SnapshotDiff {
  const fromIssues = from.findings.filter((f) => f.severity !== 'pass');
  const toIssues = to.findings.filter((f) => f.severity !== 'pass');
  const fromIds = new Set(fromIssues.map((f) => f.id));
  const toIds = new Set(toIssues.map((f) => f.id));
  return {
    rubricChanged: from.scoreModelVersion !== to.scoreModelVersion,
    scoreDelta: to.score - from.score,
    resolved: fromIssues.filter((f) => !toIds.has(f.id)),
    newIssues: toIssues.filter((f) => !fromIds.has(f.id)),
  };
}

export function parseSnapshotPayload(raw: string | null | undefined): FrozenSnapshot | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as FrozenSnapshot;
    if (!parsed.scoreModelVersion) return null;
    return parsed;
  } catch {
    return null;
  }
}
