/** Canonical paths, parsing, and rendering for trilingual pairing records. */

import { basename } from 'node:path'

/** The four repository-relative paths that form one trilingual pair. */
export interface TranslationPairPaths {
  /** English document path. */
  source: string
  /** Simplified Chinese document path. */
  zh: string
  /** German document path. */
  de: string
  /** Generated consistency-record path. */
  meta: string
}

/** The content hashes recorded for one pair. */
export interface TranslationPairingRecord {
  /** Git blob hash of the English document. */
  sourceHash: string
  /** Git blob hash of the Simplified Chinese document. */
  zhHash: string
  /** Git blob hash of the German document; absent while the pair is still a pending English/Chinese pair. */
  deHash?: string
}

const META_LINE = /^([^:#]+\.md): ([0-9a-f]{40})$/

/**
 * Derive the counterpart and consistency-record paths from an English document.
 *
 * @param source - Repository-relative English Markdown path.
 * @returns The complete four-path pair.
 */
export function translationPairPaths(source: string): TranslationPairPaths {
  if (!source.endsWith('.md') || source.endsWith('.zh.md') || source.endsWith('.de.md')) {
    throw new Error(`expected an English Markdown path, received ${JSON.stringify(source)}`)
  }
  return {
    source,
    zh: source.replace(/\.md$/, '.zh.md'),
    de: source.replace(/\.md$/, '.de.md'),
    meta: source.replace(/\.md$/, '.i18n.yaml'),
  }
}

/**
 * Derive one pair from its consistency-record path.
 *
 * @param meta - Repository-relative `foo.i18n.yaml` path.
 * @returns The complete four-path pair.
 */
export function translationPairPathsFromMeta(meta: string): TranslationPairPaths {
  if (!meta.endsWith('.i18n.yaml')) {
    throw new Error(`expected a trilingual consistency-record path, received ${JSON.stringify(meta)}`)
  }
  return translationPairPaths(meta.replace(/\.i18n\.yaml$/, '.md'))
}

/**
 * Parse a consistency record for its expected sibling names.
 *
 * @param content - Complete sidecar text.
 * @param paths - Expected sibling paths.
 * @returns The recorded hashes, or `undefined` for malformed, duplicate, or
 *   unexpected keys. A valid record carries exactly the two English/Chinese
 *   hashes (a pending pair) or all three hashes (a converted pair).
 */
export function parseTranslationPairingRecord(
  content: string,
  paths: TranslationPairPaths,
): TranslationPairingRecord | undefined {
  const hashes = new Map<string, string>()
  for (const line of content.split('\n')) {
    if (line === '' || line.startsWith('#')) continue
    const match = META_LINE.exec(line)
    if (!match?.[1] || !match[2] || hashes.has(match[1])) return undefined
    hashes.set(match[1], match[2])
  }
  const sourceHash = hashes.get(basename(paths.source))
  const zhHash = hashes.get(basename(paths.zh))
  const deHash = hashes.get(basename(paths.de))
  if (hashes.size === 2 && sourceHash !== undefined && zhHash !== undefined) {
    return { sourceHash, zhHash }
  }
  if (hashes.size === 3 && sourceHash !== undefined && zhHash !== undefined && deHash !== undefined) {
    return { sourceHash, zhHash, deHash }
  }
  return undefined
}

/**
 * Render the canonical consistency record for a pair.
 *
 * @param paths - Pair paths written into the record and its recovery command.
 * @param record - Confirmed content hashes.
 * @returns Canonical YAML text with exactly one trailing newline.
 */
export function renderTranslationPairingRecord(
  paths: TranslationPairPaths,
  record: TranslationPairingRecord,
): string {
  const header = record.deHash === undefined
    ? [
      '# Bilingual-pair consistency record (docs/i18n/README.md): the git blob hash of each',
      '# side as of the last confirmed-consistent state. Both languages carry equal authority;',
      '# after editing either side, bring the other along and re-record with:',
    ]
    : [
      '# Trilingual-pair consistency record (docs/i18n/README.md): the git blob hash of each',
      '# side as of the last confirmed-consistent state. All three languages carry equal',
      '# authority; after editing any side, bring the others along and re-record with:',
    ]
  return [
    ...header,
    `#   pnpm run verify-translation-pairing --write ${paths.source}`,
    `${basename(paths.source)}: ${record.sourceHash}`,
    `${basename(paths.zh)}: ${record.zhHash}`,
    ...(record.deHash === undefined ? [] : [`${basename(paths.de)}: ${record.deHash}`]),
    '',
  ].join('\n')
}
