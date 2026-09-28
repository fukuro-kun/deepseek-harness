/** The `write` endpoint: guarded full-text replacement and its refusals. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { chmod, mkdir, readFile, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { failureOf, openWorkspace, signal, type Harness } from './harness.ts'

let harness: Harness
let workspace: string
let outside: string

beforeEach(async () => {
  harness = await openWorkspace('dsh-workspace-files-write-')
  workspace = harness.workspace
  outside = harness.outside
})

afterEach(async () => {
  await harness.dispose()
})

const endpoint = (caps?: { maxFileBytes?: number }): ReturnType<Harness['endpoint']> =>
  harness.endpoint(caps)

describe('workspaceFiles.write — the happy path', () => {
  it('replaces the file text and reports the post-write version', async () => {
    await writeFile(join(workspace, 'notes.txt'), 'before\n', 'utf8')
    const stat = await endpoint().stat(harness.scope, 'notes.txt', signal())
    const result = await endpoint().write(
      harness.scope, 'notes.txt', { text: 'after\n', expectedVersion: stat.version }, signal(),
    )
    expect(result.operation).toBe('update')
    expect(result.version).not.toBe(stat.version)
    expect(result.absolutePath.endsWith('notes.txt')).toBe(true)
    await expect(readFile(join(workspace, 'notes.txt'), 'utf8')).resolves.toBe('after\n')
  })

  it('overwrites unconditionally when the guard is omitted', async () => {
    await writeFile(join(workspace, 'notes.txt'), 'before\n', 'utf8')
    const result = await endpoint().write(harness.scope, 'notes.txt', { text: 'after\n' }, signal())
    expect(result.operation).toBe('update')
    await expect(readFile(join(workspace, 'notes.txt'), 'utf8')).resolves.toBe('after\n')
  })

  it('writes a file outside the workspace: the human principal shares the read boundary', async () => {
    await writeFile(join(outside, 'external.txt'), 'before\n', 'utf8')
    const result = await endpoint().write(
      harness.scope, join(outside, 'external.txt'), { text: 'after\n' }, signal(),
    )
    expect(result.operation).toBe('update')
    await expect(readFile(join(outside, 'external.txt'), 'utf8')).resolves.toBe('after\n')
  })
})

describe('workspaceFiles.write — the freshness guard', () => {
  it('refuses a stale version and writes nothing', async () => {
    await writeFile(join(workspace, 'notes.txt'), 'before\n', 'utf8')
    const stat = await endpoint().stat(harness.scope, 'notes.txt', signal())
    await writeFile(join(workspace, 'notes.txt'), 'meanwhile\n', 'utf8')
    const failure = await failureOf(endpoint().write(
      harness.scope, 'notes.txt', { text: 'after\n', expectedVersion: stat.version }, signal(),
    ))
    expect(failure.code).toBe('workspace-file/stale-version')
    await expect(readFile(join(workspace, 'notes.txt'), 'utf8')).resolves.toBe('meanwhile\n')
  })

  it('accepts the version a read returned', async () => {
    await writeFile(join(workspace, 'notes.txt'), 'before\n', 'utf8')
    const page = await endpoint().read(harness.scope, 'notes.txt', {}, signal())
    const result = await endpoint().write(
      harness.scope, 'notes.txt', { text: `${page.text}\nadded\n`, expectedVersion: page.version }, signal(),
    )
    expect(result.operation).toBe('update')
    await expect(readFile(join(workspace, 'notes.txt'), 'utf8')).resolves.toBe('before\nadded\n')
  })
})

describe('workspaceFiles.write — the refusals', () => {
  it('refuses a path with no file: writes never create', async () => {
    const failure = await failureOf(endpoint().write(
      harness.scope, 'missing.txt', { text: 'after\n' }, signal(),
    ))
    expect(failure.code).toBe('workspace-file/not-found')
  })

  it('refuses a directory', async () => {
    await mkdir(join(workspace, 'dir'))
    const failure = await failureOf(endpoint().write(
      harness.scope, 'dir', { text: 'after\n' }, signal(),
    ))
    expect(failure.code).toBe('workspace-file/not-regular-file')
  })

  it('refuses a symlink, as the read does', async () => {
    await writeFile(join(workspace, 'real.txt'), 'before\n', 'utf8')
    await symlink(join(workspace, 'real.txt'), join(workspace, 'link.txt'))
    const failure = await failureOf(endpoint().write(
      harness.scope, 'link.txt', { text: 'after\n' }, signal(),
    ))
    expect(failure.code).toBe('workspace-file/not-regular-file')
    await expect(readFile(join(workspace, 'real.txt'), 'utf8')).resolves.toBe('before\n')
  })

  it('refuses a write beyond the configured full-file cap before touching the file', async () => {
    await writeFile(join(workspace, 'notes.txt'), 'before\n', 'utf8')
    const failure = await failureOf(endpoint({ maxFileBytes: 8 }).write(
      harness.scope, 'notes.txt', { text: '0123456789\n' }, signal(),
    ))
    expect(failure.code).toBe('workspace-file/too-large')
    await expect(readFile(join(workspace, 'notes.txt'), 'utf8')).resolves.toBe('before\n')
  })

  it('maps a refused filesystem write to write-failed, distinct from the freshness refusal', async () => {
    const dir = join(workspace, 'locked')
    await mkdir(dir)
    await writeFile(join(dir, 'notes.txt'), 'before\n', 'utf8')
    await chmod(dir, 0o555)
    try {
      const failure = await failureOf(endpoint().write(
        harness.scope, 'locked/notes.txt', { text: 'after\n' }, signal(),
      ))
      expect(failure.code).toBe('workspace-file/write-failed')
      await expect(readFile(join(dir, 'notes.txt'), 'utf8')).resolves.toBe('before\n')
    } finally {
      await chmod(dir, 0o755)
    }
  })
})
