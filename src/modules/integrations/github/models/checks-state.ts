/** Итог CI коммита (enum GithubChecksState в схеме). */
export type ChecksState = 'none' | 'pending' | 'success' | 'failure';

/** Завершения check suite, которые означают «сломано». */
const FAILING_CONCLUSIONS: ReadonlySet<string> = new Set([
  'failure',
  'timed_out',
  'action_required',
  'startup_failure',
]);

/** Завершения, которые не влияют на итог (пропущено, отменено, устарело). */
const IGNORED_CONCLUSIONS: ReadonlySet<string> = new Set(['cancelled', 'skipped', 'stale']);

/**
 * Итог по check suites одного коммита: есть упавший → failure, иначе есть незавершённый →
 * pending, иначе есть успешный → success; нет значимых → none.
 */
export function aggregateChecksState(
  suites: readonly { status: string; conclusion: string | null }[],
): ChecksState {
  let pending = false;
  let success = false;
  for (const { status, conclusion } of suites) {
    if (status !== 'completed' || conclusion === null) {
      pending = true;
      continue;
    }
    if (FAILING_CONCLUSIONS.has(conclusion)) return 'failure';
    if (!IGNORED_CONCLUSIONS.has(conclusion)) success = true;
  }
  if (pending) return 'pending';
  return success ? 'success' : 'none';
}
