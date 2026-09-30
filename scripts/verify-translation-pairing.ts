/**
 * Enforce complete English/Chinese/German pairs, matching structure, and
 * recorded git blob hashes for every in-scope document. The manifest contains
 * only explicit exclusions (which may have neither a counterpart nor a
 * sidecar) and the pending-german conversion list (pairs still valid as
 * English/Chinese pairs until their German side lands).
 * `--list` reports state; `--write <pairs...>` records the named confirmed
 * pairs (`--write --all` records every complete pair); `--cached <pairs...>`
 * checks exact index bytes for hooks. A check or write named with pair paths
 * touches only those pairs, so update iteration does not pay for a corpus
 * scan. Translation quality remains a review responsibility.
 * See `docs/i18n/README.md` for the owning contract.
 */

import { existsSync, globSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, join, resolve, sep } from 'node:path'
import {
  gitBlobHash,
  gitIndexPaths,
  readGitIndexBlob,
  storeGitBlob,
} from './translation-pairing-git.ts'
import {
  parseTranslationPairingRecord,
  renderTranslationPairingRecord,
  translationPairPaths,
} from './translation-pairing-record.ts'
import {
  languageSwitcherTargets,
  parseTranslationMarkdown,
  parseTranslationPairingCliArgs,
  parseTranslationPairingManifest,
  partitionGeneratedRegions,
  requiresSourceLanguageSwitcher,
  isTranslationPairingManifestExcluded,
  isTranslationPairingManifestPendingGerman,
  isTranslationScopeFile,
  TRANSLATION_SCOPE_GLOB_EXCLUDES,
  translationPairSourcePredicate,
  translationStructureDiff,
  translationStructureSignature,
} from './translation-pairing.ts'
import {
  hasLanguageSwitcher,
  normalizeTranslationMarkdownLinks,
  translationLinkLocaleViolations,
} from './translation-links.ts'

const root = resolve(import.meta.dirname, '..')
let request: ReturnType<typeof parseTranslationPairingCliArgs>
try {
  request = parseTranslationPairingCliArgs(process.argv.slice(2))
} catch (error) {
  console.error(`verify-translation-pairing: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(2)
}
const listMode = request.mode === 'list'
const writeMode = request.mode === 'write'
const indexMode = request.input === 'index'
const indexFiles = indexMode ? gitIndexPaths(root) : undefined

const contentCache = new Map<string, Buffer | undefined>()

/** Read one repository path from the selected worktree or index plane. */
function readRepositoryFile(file: string): Buffer | undefined {
  if (contentCache.has(file)) return contentCache.get(file)
  const content = indexMode
    ? indexFiles?.has(file) ? readGitIndexBlob(root, file)?.content : undefined
    : existsSync(join(root, file)) && statSync(join(root, file)).isFile()
      ? readFileSync(join(root, file))
      : undefined
  contentCache.set(file, content)
  return content
}

/** Whether one path exists in the selected content plane. */
function repositoryFileExists(file: string): boolean {
  return indexMode ? indexFiles?.has(file) === true : readRepositoryFile(file) !== undefined
}

/** Discover source Markdown and pairing sidecars before applying the corpus predicate. */
const SCOPE_PATTERNS = [
  '**/*.md',
  '**/*.i18n.yaml',
  '.agents/notes/**/*.md',
  '.agents/notes/**/*.i18n.yaml',
]

const manifestContent = readRepositoryFile('scripts/translation-pairing.manifest.json')
if (manifestContent === undefined) {
  throw new Error('scripts/translation-pairing.manifest.json is missing from the selected content plane')
}
const manifest = parseTranslationPairingManifest(manifestContent.toString('utf8'))
const isTranslationPairSource = translationPairSourcePredicate(manifest)

/**
 * An excluded entry ending in `/` excludes the whole directory. The trailing
 * slash IS the path boundary — `docs/tool-catalog/` cannot prefix-match a
 * sibling like `docs/tool-catalog-notes/x.md` — so directory entries in the
 * manifest must keep their trailing slash.
 */
function isExcluded(file: string): boolean {
  return isTranslationPairingManifestExcluded(file, manifest)
}

// Enumerate the scope once: the whole corpus, or exactly the named pairs'
// three files (a named pair whose files are absent is caught by the same
// completeness rules that cover discovered remnants).
const files = new Set<string>()
if (request.scope === 'pairs') {
  for (const anchor of request.anchors) {
    const { source, zh, de, meta } = translationPairPaths(anchor)
    for (const file of [source, zh, de, meta]) {
      if (repositoryFileExists(file)) files.add(file)
    }
    // A named worktree anchor with no files still enters the source list so
    // an interactive check reports it. An index check accepts a complete
    // four-file deletion and still rejects every partial deletion below.
    if (!indexMode && !repositoryFileExists(anchor)) files.add(anchor)
  }
} else {
  for (const pattern of SCOPE_PATTERNS) {
    for (const match of globSync(pattern, { cwd: root, exclude: TRANSLATION_SCOPE_GLOB_EXCLUDES })) {
      const normalized = match.split(sep).join('/')
      if (isTranslationScopeFile(normalized)) files.add(normalized)
    }
  }
}
const translations = [...files].filter(f => f.endsWith('.zh.md')).sort()
const german = [...files].filter(f => f.endsWith('.de.md')).sort()
const metas = [...files].filter(f => f.endsWith('.i18n.yaml')).sort()
const sources = [...files].filter(f => f.endsWith('.md') && !f.endsWith('.zh.md') && !f.endsWith('.de.md')).sort()

if (request.scope === 'pairs') {
  const rejected = request.anchors.filter(anchor => !isTranslationScopeFile(anchor) || isExcluded(anchor))
  const absent = request.anchors.filter((anchor) => {
    const { source, zh, de, meta } = translationPairPaths(anchor)
    return ![source, zh, de, meta].some(repositoryFileExists)
  })
  if (rejected.length > 0 || (!indexMode && absent.length > 0)) {
    for (const anchor of rejected) {
      console.error(`verify-translation-pairing: ${anchor} is not an in-scope pair (excluded or outside the documentation corpus; see docs/i18n/README.md)`)
    }
    for (const anchor of absent) {
      console.error(`verify-translation-pairing: ${anchor} names no pair on disk (none of its four files exist)`)
    }
    process.exit(2)
  }
}

// --write: (re)record the hashes for the requested complete pairs, creating
// missing records. A named pair that cannot be recorded (missing counterpart,
// or no German side for a converted pair) fails loud; corpus scope (--all)
// skips incomplete sources as before.
if (writeMode) {
  let written = 0
  for (const source of sources) {
    if (isExcluded(source)) continue
    const paths = translationPairPaths(source)
    const { zh, de, meta } = paths
    if (!repositoryFileExists(source) || !repositoryFileExists(zh)) {
      if (request.scope === 'pairs') {
        console.error(`verify-translation-pairing: cannot record ${source}: missing ${repositoryFileExists(source) ? zh : source}`)
        process.exit(2)
      }
      continue
    }
    const pending = isTranslationPairingManifestPendingGerman(source, manifest)
    const dePresent = repositoryFileExists(de)
    if (!dePresent && !pending) {
      if (request.scope === 'pairs') {
        console.error(`verify-translation-pairing: cannot record ${source}: missing ${de} (add the German side, or list the pair under pending-german until it is converted)`)
        process.exit(2)
      }
      continue
    }
    const sourceContent = readRepositoryFile(source)
    const zhContent = readRepositoryFile(zh)
    const deContent = dePresent ? readRepositoryFile(de) : undefined
    if (sourceContent === undefined || zhContent === undefined || (dePresent && deContent === undefined)) {
      throw new Error(`${source}: complete pair became unreadable`)
    }
    // A consistency record is also a recovery pointer for the briefing
    // generator. Persist the snapshots even when the sidecar text is already
    // current, because the bytes may exist only in this working tree.
    const record = renderTranslationPairingRecord(paths, {
      sourceHash: storeGitBlob(root, sourceContent),
      zhHash: storeGitBlob(root, zhContent),
      ...(deContent === undefined ? {} : { deHash: storeGitBlob(root, deContent) }),
    })
    if (existsSync(join(root, meta)) && readFileSync(join(root, meta), 'utf8') === record) continue
    writeFileSync(join(root, meta), record)
    console.log(`verify-translation-pairing: recorded ${meta}`)
    written++
  }
  console.log(`verify-translation-pairing: ${written} record(s) written; run the check to validate the pairs.`)
  process.exit(0)
}

const errors: string[] = []
const state = new Map<string, 'ok' | 'pending' | 'out-of-sync' | 'missing'>()

// 1. Every discovered, non-excluded source carries its counterparts. German
// is required unless the pair is still on the pending-german conversion
// list; a listed pair that already has a German side is stale list drift.
for (const source of sources) {
  if (isExcluded(source)) continue
  const { zh, de } = translationPairPaths(source)
  const pending = isTranslationPairingManifestPendingGerman(source, manifest)
  if (!repositoryFileExists(zh)) {
    errors.push(`${source}: in-scope documentation must merge bilingual (docs/i18n/README.md); add the counterpart and record the pair`)
    state.set(source, 'missing')
  }
  if (!repositoryFileExists(de) && !pending) {
    errors.push(`${source}: in-scope documentation must carry a German counterpart (docs/i18n/README.md); add the counterpart and record the pair`)
    state.set(source, 'missing')
  }
  if (repositoryFileExists(de) && pending) {
    errors.push(`${source}: pending-german lists a converted pair; remove the entry from scripts/translation-pairing.manifest.json`)
    state.set(source, 'out-of-sync')
  }
}

// 2. Every pair that exists at all is complete and consistent. Anchor on the
// union of .zh.md, .de.md files and .i18n.yaml records so a half-deleted pair
// is caught from either remnant.
const pairAnchors = new Set<string>()
for (const zh of translations) pairAnchors.add(zh.replace(/\.zh\.md$/, '.md'))
for (const de of german) pairAnchors.add(de.replace(/\.de\.md$/, '.md'))
for (const meta of metas) pairAnchors.add(meta.replace(/\.i18n\.yaml$/, '.md'))

for (const source of [...pairAnchors].sort()) {
  const paths = translationPairPaths(source)
  const { zh, de, meta } = paths
  const pending = isTranslationPairingManifestPendingGerman(source, manifest)
  const have = {
    source: repositoryFileExists(source),
    zh: repositoryFileExists(zh),
    de: repositoryFileExists(de),
    meta: repositoryFileExists(meta),
  }

  if (isExcluded(source)) {
    if (have.zh) errors.push(`${zh}: ${source} is excluded from pairing (generated or trilingual-by-construction); this translation must not exist`)
    if (have.de) errors.push(`${de}: ${source} is excluded from pairing; this translation must not exist`)
    if (have.meta) errors.push(`${meta}: ${source} is excluded from pairing; this consistency record must not exist`)
    continue
  }
  const missing = [
    ...(have.source ? [] : [source]),
    ...(have.zh ? [] : [zh]),
    ...(have.de ? [] : (pending ? [] : [de])),
    ...(have.meta ? [] : [meta]),
  ]
  if (missing.length > 0) {
    errors.push(`${source}: incomplete pair — missing ${missing.join(', ')} (pairs merge whole: every present language plus the .i18n.yaml record)`)
    continue
  }

  const sourceContent = readRepositoryFile(source)
  const zhContent = readRepositoryFile(zh)
  const metaContent = readRepositoryFile(meta)
  if (sourceContent === undefined || zhContent === undefined || metaContent === undefined) {
    throw new Error(`${source}: complete pair became unreadable`)
  }
  let deText: string | undefined
  let deBytes: Buffer | undefined
  if (have.de) {
    const content = readRepositoryFile(de)
    if (content === undefined) throw new Error(`${source}: complete pair became unreadable`)
    deText = content.toString('utf8')
    deBytes = content
  }
  const trilingual = deText !== undefined

  const record = parseTranslationPairingRecord(metaContent.toString('utf8'), paths)
  if (record === undefined) {
    errors.push(`${meta}: malformed consistency record (expected the \`${basename(source)}\` and \`${basename(zh)}\` hashes, plus \`${basename(de)}\` for a converted pair)`)
    continue
  }

  let consistent = true
  const checkHash = (file: string, content: Buffer, recorded: string | undefined): void => {
    if (recorded === undefined) {
      errors.push(`${meta}: record lacks the ${basename(file)} hash; re-record with --write`)
      consistent = false
      return
    }
    if (recorded !== gitBlobHash(content)) {
      errors.push(`${file}: out of sync — content no longer matches the pair's last confirmed-consistent state in ${meta} (bring the other side along, then re-record with --write)`)
      consistent = false
    }
  }
  checkHash(source, sourceContent, record.sourceHash)
  checkHash(zh, zhContent, record.zhHash)
  if (deBytes !== undefined) checkHash(de, deBytes, record.deHash)
  if (!consistent) {
    state.set(source, 'out-of-sync')
    continue
  }

  const sourceText = sourceContent.toString('utf8')
  const zhText = zhContent.toString('utf8')
  const sourceSwitcherTargets = trilingual
    ? [...languageSwitcherTargets(zh), ...languageSwitcherTargets(de)]
    : languageSwitcherTargets(zh)
  const zhSwitcherTargets = trilingual
    ? [...languageSwitcherTargets(source), ...languageSwitcherTargets(de)]
    : languageSwitcherTargets(source)
  const deSwitcherTargets = [...languageSwitcherTargets(source), ...languageSwitcherTargets(zh)]
  const linkContext = (sourcePath: string) => ({
    repoRoot: root,
    sourcePath,
    isTranslationPairSource,
    repositoryFileExists,
  })
  for (const violation of [
    ...translationLinkLocaleViolations(sourceText, linkContext(source)),
    ...translationLinkLocaleViolations(zhText, linkContext(zh)),
    ...(trilingual && deText !== undefined ? translationLinkLocaleViolations(deText, linkContext(de)) : []),
  ]) {
    errors.push(`${violation.sourcePath}:${violation.line}: link target ${JSON.stringify(violation.url)} uses the wrong locale; expected ${JSON.stringify(violation.expectedUrl)}`)
    state.set(source, 'out-of-sync')
  }

  // Generated regions must remain byte-identical after paired document paths
  // are normalized to one semantic target. The structural signature below
  // compares their contents again as part of the whole document; this named
  // check rejects any prose, ordering, code, marker, or non-locale URL drift.
  let sourceRegions: { regions: string[]; stripped: string }
  let zhRegions: { regions: string[]; stripped: string }
  let deRegions: { regions: string[]; stripped: string } | undefined
  try {
    sourceRegions = partitionGeneratedRegions(sourceText)
    zhRegions = partitionGeneratedRegions(zhText)
    deRegions = trilingual && deText !== undefined ? partitionGeneratedRegions(deText) : undefined
  } catch (error) {
    errors.push(`${source} ↔ ${zh}: ${error instanceof Error ? error.message : String(error)}`)
    state.set(source, 'out-of-sync')
    continue
  }
  const normalizedSourceRegions = sourceRegions.regions.map(region => normalizeTranslationMarkdownLinks(region, linkContext(source)))
  const normalizedZhRegions = zhRegions.regions.map(region => normalizeTranslationMarkdownLinks(region, linkContext(zh)))
  const normalizedDeRegions = (deRegions === undefined ? [] : deRegions.regions).map(region =>
    normalizeTranslationMarkdownLinks(region, linkContext(de)),
  )
  const regionPairs: Array<[string, string, string[], string[]]> = [
    [source, zh, normalizedSourceRegions, normalizedZhRegions],
    ...(trilingual && deText !== undefined && deBytes !== undefined
      ? [
        [source, de, normalizedSourceRegions, normalizedDeRegions] as [string, string, string[], string[]],
        [zh, de, normalizedZhRegions, normalizedDeRegions] as [string, string, string[], string[]],
      ]
      : []),
  ]
  for (const [left, right, leftRegions, rightRegions] of regionPairs) {
    if (leftRegions.length !== rightRegions.length
      || leftRegions.some((region, index) => region !== rightRegions[index])) {
      errors.push(`${left} ↔ ${right}: generated regions differ beyond paired-document locale paths — regenerate both sides`)
      state.set(source, 'out-of-sync')
    }
  }

  const sourceTree = parseTranslationMarkdown(sourceText)
  const zhTree = parseTranslationMarkdown(zhText)
  const deTree = trilingual && deText !== undefined ? parseTranslationMarkdown(deText) : undefined
  if (!hasLanguageSwitcher(zhTree, zhText, zhSwitcherTargets, 'zh', trilingual)) {
    errors.push(`${zh}: missing language switcher — no link to ${basename(source)}${trilingual ? ` and ${basename(de)}` : ''}`)
  }
  if (requiresSourceLanguageSwitcher(source) && !hasLanguageSwitcher(sourceTree, sourceText, sourceSwitcherTargets, 'en', trilingual)) {
    errors.push(`${source}: missing language switcher — no link back to ${basename(zh)}${trilingual ? ` and ${basename(de)}` : ''}`)
  }
  if (trilingual && deTree !== undefined && deText !== undefined
    && !hasLanguageSwitcher(deTree, deText, deSwitcherTargets, 'de', true)) {
    errors.push(`${de}: missing language switcher — no link to ${basename(source)} and ${basename(zh)}`)
  }
  const sourceSignature = translationStructureSignature(sourceTree, sourceSwitcherTargets, {
    repoRoot: root,
    sourcePath: source,
    isTranslationPairSource,
    repositoryFileExists,
    markdown: sourceText,
  }, 'en', trilingual)
  const zhSignature = translationStructureSignature(zhTree, zhSwitcherTargets, {
    repoRoot: root,
    sourcePath: zh,
    isTranslationPairSource,
    repositoryFileExists,
    markdown: zhText,
  }, 'zh', trilingual)
  for (const divergence of translationStructureDiff(sourceSignature, zhSignature)) {
    errors.push(`${source} ↔ ${zh}: ${divergence}`)
  }
  if (trilingual && deTree !== undefined && deText !== undefined) {
    const deSignature = translationStructureSignature(deTree, deSwitcherTargets, {
      repoRoot: root,
      sourcePath: de,
      isTranslationPairSource,
      repositoryFileExists,
      markdown: deText,
    }, 'de', true)
    for (const divergence of translationStructureDiff(sourceSignature, deSignature)) {
      errors.push(`${source} ↔ ${de}: ${divergence}`)
    }
    for (const divergence of translationStructureDiff(zhSignature, deSignature)) {
      errors.push(`${zh} ↔ ${de}: ${divergence}`)
    }
  }
  if (!state.has(source)) state.set(source, trilingual ? 'ok' : 'pending')
}

// Complete the state map for --list: any in-scope, non-excluded document with no pair is missing.
for (const source of sources) {
  if (!isExcluded(source) && !state.has(source)) state.set(source, 'missing')
}

if (listMode) {
  const order = { 'out-of-sync': 0, missing: 1, pending: 2, ok: 3 } as const
  const rows = [...state.entries()].sort((a, b) => order[a[1]] - order[b[1]] || a[0].localeCompare(b[0]))
  for (const [file, status] of rows) {
    console.log(`${status.padEnd(11)} ${file}${status === 'missing' ? '  (required)' : ''}`)
  }
  const counts = { 'ok': 0, 'pending': 0, 'out-of-sync': 0, 'missing': 0 }
  for (const status of state.values()) counts[status]++
  console.log(`verify-translation-pairing: ${counts.ok} ok, ${counts.pending} pending, ${counts['out-of-sync']} out-of-sync, ${counts.missing} missing (of ${state.size} in scope)`)
  process.exit(0)
}

if (errors.length === 0) {
  console.log(request.scope === 'pairs'
    ? `verify-translation-pairing: ${pairAnchors.size} named ${indexMode ? 'staged ' : ''}pair(s) consistent; the corpus-wide check still runs in doc-sync.`
    : `verify-translation-pairing: ${pairAnchors.size} pair(s) checked across all in-scope documentation, all consistent.`)
  process.exit(0)
}

console.error('verify-translation-pairing: trilingual pairing rules violated (see docs/i18n/README.md):')
for (const message of errors) console.error(`  ${message}`)
process.exit(1)
