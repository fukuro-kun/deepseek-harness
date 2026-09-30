/** Locale-aware resolution and byte-preserving rewrites for trilingual Markdown links. */

import { existsSync, statSync } from 'node:fs'
import { posix, resolve } from 'node:path'
import type { Nodes } from 'mdast'
import {
  isExternalOrAbsoluteMarkdownUrl,
  markdownDestination,
  parseMarkdown,
  splitMarkdownUrlTarget,
  visitMarkdown,
  type MarkdownDestination,
} from './markdown.ts'

/** Repository and source document used to resolve one relative link. */
export interface TranslationLinkContext {
  /** Absolute repository root. */
  repoRoot: string
  /** Repository-relative Markdown source path. */
  sourcePath: string
  /** Whether an English Markdown path belongs to the active trilingual corpus. */
  isTranslationPairSource: (sourcePath: string) => boolean
  /** Selected content plane; defaults to regular files in the working tree. */
  repositoryFileExists?: (repoPath: string) => boolean
}

/** One relative document link whose target uses the wrong locale sibling. */
export interface TranslationLinkLocaleViolation {
  sourcePath: string
  line: number
  url: string
  expectedUrl: string
}

/** Result of rewriting wrong-locale relative document links. */
export interface TranslationLinkRewriteResult {
  content: string
  rewritten: number
}

/** The languages a paired document may be authored in. */
export type TranslationDocumentLanguage = 'en' | 'zh' | 'de'

/** The span of one top-level language switcher immediately following the H1. */
export interface LanguageSwitcherSpan {
  /** Start offset of the switcher paragraph. */
  start: number
  /** End offset of the switcher paragraph. */
  end: number
}

interface TranslationPairTarget {
  source: string
  zh: string
  de: string
}

interface ResolvedTranslationLink {
  pair: TranslationPairTarget
  targetPath: string
  suffix: string
  expectedPath: string
  expectedUrl: string
  locale: TranslationDocumentLanguage
}

interface Replacement {
  start: number
  end: number
  value: string
}

type LinkNode = Extract<Nodes, { type: 'link' | 'definition' }>

/**
 * Canonical switcher line per own language and pair mode. The German side has
 * no bilingual form: a `.de.md` file only exists as part of a converted pair.
 */
const SWITCHER_LINE: Record<TranslationDocumentLanguage, { bilingual: RegExp | null; trilingual: RegExp }> = {
  en: {
    bilingual: /^English \| \[中文\]\([^\n]+\)$/,
    trilingual: /^English \| \[中文\]\([^\n]+\) \| \[Deutsch\]\([^\n]+\)$/,
  },
  zh: {
    bilingual: /^\[English\]\([^\n]+\) \| 中文$/,
    trilingual: /^\[English\]\([^\n]+\) \| 中文 \| \[Deutsch\]\([^\n]+\)$/,
  },
  de: {
    bilingual: null,
    trilingual: /^\[English\]\([^\n]+\) \| \[中文\]\([^\n]+\) \| Deutsch$/,
  },
}

function findSwitcherParagraph(
  tree: Nodes,
  markdown: string,
  pattern: RegExp,
  linkCount: number,
): { start: number; end: number; links: LinkNode[] } | undefined {
  if (tree.type !== 'root') return undefined
  const headingIndex = tree.children.findIndex(node => node.type === 'heading' && node.depth === 1)
  if (headingIndex < 0) return undefined
  for (const node of tree.children.slice(headingIndex + 1)) {
    if (node.type === 'heading') return undefined
    if (node.type !== 'paragraph' || node.position === undefined) continue
    const start = node.position.start.offset
    const end = node.position.end.offset
    if (start === undefined || end === undefined) continue
    if (!pattern.test(markdown.slice(start, end))) continue
    const links: LinkNode[] = []
    for (const child of node.children) {
      if (child.type === 'link') links.push(child)
    }
    if (links.length !== linkCount) continue
    return { start, end, links }
  }
  return undefined
}

/**
 * Locate the canonical switcher of one language and pair mode, requiring every
 * switcher link to target an accepted counterpart.
 *
 * @param tree - Parsed document tree.
 * @param markdown - Source text the tree was parsed from.
 * @param acceptedTargets - Relative or public-repository links accepted as switcher targets.
 * @param ownLanguage - Language this document is authored in.
 * @param trilingual - Whether the pair carries a German side.
 * @returns The switcher paragraph span, or undefined when absent.
 */
export function languageSwitcherSpan(
  tree: Nodes,
  markdown: string,
  acceptedTargets: string | readonly string[],
  ownLanguage: TranslationDocumentLanguage,
  trilingual: boolean,
): LanguageSwitcherSpan | undefined {
  const pattern = SWITCHER_LINE[ownLanguage][trilingual ? 'trilingual' : 'bilingual']
  if (pattern === null) return undefined
  const accepted = new Set(typeof acceptedTargets === 'string' ? [acceptedTargets] : acceptedTargets)
  const found = findSwitcherParagraph(tree, markdown, pattern, trilingual ? 2 : 1)
  if (found === undefined || !found.links.every(link => accepted.has(link.url ?? ''))) return undefined
  return { start: found.start, end: found.end }
}

/** Locate the canonical switcher in any language and pair mode. */
function detectLanguageSwitcherSpan(tree: Nodes, markdown: string): LanguageSwitcherSpan | undefined {
  for (const ownLanguage of ['en', 'zh', 'de'] as const) {
    for (const trilingual of [false, true] as const) {
      const pattern = SWITCHER_LINE[ownLanguage][trilingual ? 'trilingual' : 'bilingual']
      if (pattern === null) continue
      const found = findSwitcherParagraph(tree, markdown, pattern, trilingual ? 2 : 1)
      if (found !== undefined) return { start: found.start, end: found.end }
    }
  }
  return undefined
}

/** Whether the tree carries its canonical top-level language switcher. */
export function hasLanguageSwitcher(
  tree: Nodes,
  markdown: string,
  acceptedTargets: string | readonly string[],
  ownLanguage: TranslationDocumentLanguage,
  trilingual: boolean,
): boolean {
  return languageSwitcherSpan(tree, markdown, acceptedTargets, ownLanguage, trilingual) !== undefined
}

function decodePath(path: string): string {
  try {
    return decodeURIComponent(path)
  } catch {
    return path
  }
}

function worktreeFileExists(repoRoot: string, repoPath: string): boolean {
  try {
    const path = resolve(repoRoot, repoPath)
    return existsSync(path) && statSync(path).isFile()
  } catch {
    return false
  }
}

function repositoryFileExists(context: TranslationLinkContext, repoPath: string): boolean {
  return context.repositoryFileExists?.(repoPath) ?? worktreeFileExists(context.repoRoot, repoPath)
}

function repositoryRelativePath(path: string): string | undefined {
  const normalized = posix.normalize(path)
  if (normalized === '' || normalized === '.' || normalized === '..' || normalized.startsWith('../') || posix.isAbsolute(normalized)) {
    return undefined
  }
  return normalized
}

function resolveRepositoryTarget(
  rawPath: string,
  context: TranslationLinkContext,
): string | undefined {
  const decoded = decodePath(rawPath)
  const exact = repositoryRelativePath(posix.join(posix.dirname(context.sourcePath), decoded))
  if (exact === undefined) return undefined
  if (repositoryFileExists(context, exact)) return exact
  // A pending conversion target resolves through its existing pair source: the
  // locale sibling is what the rollout still owes, and canonicalization maps
  // every side onto the source path.
  const source = exact.replace(/\.(?:zh|de)\.md$/, '.md')
  if (source !== exact && context.isTranslationPairSource(source)
    && repositoryFileExists(context, source)) {
    return exact
  }
  return undefined
}

function translationPairTarget(targetPath: string, context: TranslationLinkContext): TranslationPairTarget | undefined {
  let source: string
  if (targetPath.endsWith('.zh.md')) source = targetPath.replace(/\.zh\.md$/, '.md')
  else if (targetPath.endsWith('.de.md')) source = targetPath.replace(/\.de\.md$/, '.md')
  else if (targetPath.endsWith('.md')) source = targetPath
  else return undefined
  if (!context.isTranslationPairSource(source)) return undefined
  return {
    source,
    zh: source.replace(/\.md$/, '.zh.md'),
    de: source.replace(/\.md$/, '.de.md'),
  }
}

function encodePathSegment(segment: string): string {
  return encodeURIComponent(segment).replace(/[!'()*]/g, character => (
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  ))
}

function relativeExpectedPath(
  context: TranslationLinkContext,
  expectedPath: string,
  rawPath: string,
): string {
  const relative = posix.relative(posix.dirname(context.sourcePath), expectedPath)
  const encoded = relative.split('/').map(encodePathSegment).join('/')
  return rawPath.startsWith('./') && !encoded.startsWith('.') ? `./${encoded}` : encoded
}

function expectedLocalePath(
  rawPath: string,
  locale: TranslationDocumentLanguage,
  context: TranslationLinkContext,
  expectedPath: string,
): string {
  if (rawPath.endsWith('.md') && !rawPath.endsWith('.zh.md') && !rawPath.endsWith('.de.md')) {
    if (locale === 'zh') return rawPath.replace(/\.md$/, '.zh.md')
    if (locale === 'de') return rawPath.replace(/\.md$/, '.de.md')
  }
  if (rawPath.endsWith('.zh.md')) {
    if (locale === 'en') return rawPath.replace(/\.zh\.md$/, '.md')
    if (locale === 'de') return rawPath.replace(/\.zh\.md$/, '.de.md')
  }
  if (rawPath.endsWith('.de.md')) {
    if (locale === 'en') return rawPath.replace(/\.de\.md$/, '.md')
    if (locale === 'zh') return rawPath.replace(/\.de\.md$/, '.zh.md')
  }
  return relativeExpectedPath(context, expectedPath, rawPath)
}

function resolveTranslationLink(
  url: string,
  context: TranslationLinkContext,
  authoredUrl: string,
): ResolvedTranslationLink | undefined {
  if (isExternalOrAbsoluteMarkdownUrl(url)) return undefined
  const { path } = splitMarkdownUrlTarget(url)
  const authored = splitMarkdownUrlTarget(authoredUrl)
  if (path === '') return undefined
  const targetPath = resolveRepositoryTarget(path, context)
  if (targetPath === undefined) return undefined
  const pair = translationPairTarget(targetPath, context)
  if (pair === undefined) return undefined
  const locale: TranslationDocumentLanguage = context.sourcePath.endsWith('.de.md')
    ? 'de'
    : context.sourcePath.endsWith('.zh.md') ? 'zh' : 'en'
  const expectedPath = locale === 'zh' ? pair.zh : locale === 'de' ? pair.de : pair.source
  return {
    pair,
    targetPath,
    suffix: authored.suffix,
    expectedPath,
    expectedUrl: `${expectedLocalePath(authored.path, locale, context, expectedPath)}${authored.suffix}`,
    locale,
  }
}

function hasExpectedLocale(resolved: ResolvedTranslationLink): boolean {
  return resolved.targetPath === resolved.expectedPath
}

function replacementFor(destination: MarkdownDestination, value: string): Replacement {
  return { start: destination.start, end: destination.end, value }
}

function authoredExternalTarget(markdown: string, node: LinkNode): string {
  const start = node.position?.start.offset
  const end = node.position?.end.offset
  if (start === undefined || end === undefined) {
    throw new Error(`translation-links: external link ${JSON.stringify(node.url)} has no source offsets`)
  }
  const raw = markdown.slice(start, end)
  if (node.type === 'definition' || raw.startsWith('[')) return markdownDestination(markdown, node).url
  if (raw.startsWith('<') && raw.endsWith('>')) return raw.slice(1, -1)
  return raw
}

function applyReplacements(markdown: string, replacements: Replacement[]): string {
  let output = markdown
  for (const replacement of replacements.sort((left, right) => right.start - left.start)) {
    output = output.slice(0, replacement.start) + replacement.value + output.slice(replacement.end)
  }
  return output
}

function visitDocumentLinkNodes(
  markdown: string,
  visitor: (node: LinkNode) => void,
): void {
  const tree = parseMarkdown(markdown)
  const switcherSpan = detectLanguageSwitcherSpan(tree, markdown)
  const referencedIdentifiers = new Set<string>()
  const visitedDefinitions = new Set<string>()
  visitMarkdown(tree, (node) => {
    if (node.type === 'linkReference') referencedIdentifiers.add(node.identifier)
  })
  visitMarkdown(tree, (node) => {
    if (node.type === 'link') {
      if (switcherSpan !== undefined
        && node.position?.start.offset !== undefined
        && node.position.start.offset >= switcherSpan.start
        && node.position.start.offset < switcherSpan.end) return
      visitor(node)
    } else if (node.type === 'definition'
      && referencedIdentifiers.has(node.identifier)
      && !visitedDefinitions.has(node.identifier)) {
      visitedDefinitions.add(node.identifier)
      visitor(node)
    }
  })
}

function visitResolvedDocumentLinks(
  markdown: string,
  context: TranslationLinkContext,
  visitor: (node: LinkNode, destination: MarkdownDestination, resolved: ResolvedTranslationLink) => void,
): void {
  visitDocumentLinkNodes(markdown, (node) => {
    if (isExternalOrAbsoluteMarkdownUrl(node.url)) return
    const destination = markdownDestination(markdown, node)
    const resolved = resolveTranslationLink(node.url, context, destination.url)
    if (resolved !== undefined) visitor(node, destination, resolved)
  })
}

/** Return one violation per wrong-locale link or link definition. */
export function translationLinkLocaleViolations(
  markdown: string,
  context: TranslationLinkContext,
): TranslationLinkLocaleViolation[] {
  const violations: TranslationLinkLocaleViolation[] = []
  visitResolvedDocumentLinks(markdown, context, (node, destination, resolved) => {
    if (hasExpectedLocale(resolved)) return
    violations.push({
      sourcePath: context.sourcePath,
      line: node.position?.start.line ?? 0,
      url: destination.url,
      expectedUrl: resolved.expectedUrl,
    })
  })
  return violations
}

/** Rewrite wrong-locale document links without reserializing surrounding Markdown. */
export function rewriteTranslationLinkLocales(
  markdown: string,
  context: TranslationLinkContext,
): TranslationLinkRewriteResult {
  const replacements: Replacement[] = []
  visitResolvedDocumentLinks(markdown, context, (_node, destination, resolved) => {
    if (hasExpectedLocale(resolved)) return
    replacements.push(replacementFor(destination, resolved.expectedUrl))
  })
  return { content: applyReplacements(markdown, replacements), rewritten: replacements.length }
}

/** Normalize only paired-document locale paths while retaining every other byte and URL suffix. */
export function normalizeTranslationMarkdownLinks(
  markdown: string,
  context: TranslationLinkContext,
): string {
  const replacements: Replacement[] = []
  visitResolvedDocumentLinks(markdown, context, (_node, destination, resolved) => {
    replacements.push(replacementFor(
      destination,
      `dsh-translation-target:${resolved.pair.source}${resolved.suffix}`,
    ))
  })
  return applyReplacements(markdown, replacements)
}

/** Semantic target of one authored inline link or referenced definition. */
export function semanticTranslationLinkNodeTarget(
  node: LinkNode,
  markdown: string,
  context: TranslationLinkContext,
): string {
  if (isExternalOrAbsoluteMarkdownUrl(node.url)) return authoredExternalTarget(markdown, node)
  const destination = markdownDestination(markdown, node)
  const resolved = resolveTranslationLink(node.url, context, destination.url)
  return resolved === undefined
    ? destination.url
    : `dsh-translation-target:${resolved.pair.source}${resolved.suffix}`
}
