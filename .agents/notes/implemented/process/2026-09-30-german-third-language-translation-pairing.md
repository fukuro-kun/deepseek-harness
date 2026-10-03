# Agent Note: Make German a first-class translation pairing language
English | [中文](2026-09-30-german-third-language-translation-pairing.zh.md) | [Deutsch](2026-09-30-german-third-language-translation-pairing.de.md)

Status: implemented


## Problem

The documentation corpus paired every English source with a single Chinese translation: the gate, the manifest, the merge driver, and the standard modeled exactly two languages. Product documentation was also needed in German, and an optional German sibling without gate coverage would have left the third language's structure, links, and sync state unverified while claiming parity with the other two sides.

## Decision

German is a first-class third language of the translation pairing contract. A pair is `foo.md`, `foo.zh.md`, `foo.de.md`, and `foo.i18n.yaml`; all three languages carry equal authority, mirror each other's structure, and keep generated regions byte-identical modulo locale paths. The consistency record holds three blob hashes for a converted pair and two for a pair whose German side is still owed.

`verify-translation-pairing` verifies the trilingual structure: the canonical switcher on every side, the structural signature, and each side's link locale. A side links its own locale sibling; a `.de.md` target resolves through its existing pair source while the rollout still owes it, so a converted document may reference a target whose German side is not yet written. A stale `pending-german` entry for a converted pair is a gate error.

The manifest's `pending-german` list tracks the pairs that predate the German side. Every in-scope document, current and future, merges as a complete trilingual pair; the list is the sanctioned temporary exception, and converting a pair is one change that adds the German side, updates the switchers to the trilingual form, removes the manifest entry, and re-records the three hashes. The pairing merge driver refuses a merge that would mix a two-hash record with a three-hash record, so a conversion never composes silently against a stale record.

The German side follows the lightweight path: a structural mirror verified by the gate, without a dedicated prompt/brief pipeline, a terminology German column, or style samples until the corpus rollout supplies them. The [automatic pairing merges Agent Note](2026-08-08-automatic-translation-pairing-merges.md) owns the merge mechanism and is unchanged; it carries the trilingual records.

## Alternatives considered

**Add German as an optional, ungated sibling.** An unchecked third file would drift from the pair's structure and links while the gate kept certifying only two sides; parity claims would outpace verification.

**Convert the whole corpus in this change.** The corpus spans hundreds of pairs; converting it at once couples the language standard to a mass translation effort and blocks the standard's landing on translation throughput. The `pending-german` list tracks the rollout instead.

**Rank German below English and Chinese.** The pairing contract gives every language equal authority and a structural mirror; a derived third language would need its own sync direction and its own failure surface for no gain over the existing model.

## Consequences

- Every new in-scope document is a complete triplet at creation; the gate fails a converted pair missing any side.
- Conversions are recorded per pair with `pnpm run verify-translation-pairing --write`; a converted pair's record holds three hashes and its `pending-german` entry is removed.
- The merge driver refuses to compose a two-hash record with a three-hash record, so a concurrent conversion surfaces as an explicit conflict.
- The `pending-german` count is the corpus's remaining work; `pnpm run verify-translation-pairing --list` reports the current state of every in-scope document.
- The prompt/brief pipeline, the terminology German column, and the German style samples stay deferred to the corpus rollout, as stated in the [standard](../../../../docs/i18n/README.md).
