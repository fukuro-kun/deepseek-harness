/**
 * German (de) language pack for the browser client. Registers `de` as a
 * selectable language (fallback `en`) and contributes dictionaries into the
 * namespaces owned by the shipped client packages, so upstream sources stay
 * untouched.
 *
 * @module @deepseek-ai/dsh-client-locale-de/client
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale'
import { DICTS, LOCALE_FALLBACK, LOCALE_ID, LOCALE_LABEL } from './dicts.ts'

export const inject = ['locale']

/**
 * Client plugin body: publish the language definition, then contribute the
 * per-namespace dictionaries. Registration order is irrelevant — a namespace
 * map accumulates locales independently of the owning package's own
 * registrations.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.locale.addLanguage({ id: LOCALE_ID, label: LOCALE_LABEL, fallback: LOCALE_FALLBACK })
  for (const [ns, dict] of Object.entries(DICTS)) {
    ctx.effect(() => ctx.locale.register(ns, LOCALE_ID, dict), `locale-de: ${ns}`)
  }
}
