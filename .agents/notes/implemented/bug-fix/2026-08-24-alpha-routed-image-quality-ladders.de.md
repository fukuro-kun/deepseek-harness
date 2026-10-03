# Agent Note: Alpha-routed image quality ladders replace colour-count codec routing

Status: implemented

[English](2026-08-24-alpha-routed-image-quality-ladders.md) | [中文](2026-08-24-alpha-routed-image-quality-ladders.zh.md) | Deutsch

## Problem

Bild-Normalisierung und Request-Image-Encoding in `@deepseek-ai/dsh-attachment-local` wählten ihren Codec über eine 5-Bit-Farbanzahl-Probe: Bilder, deren 128×128-Nearest-Neighbour-Probe innerhalb von 256 quantisierten Farben blieb, gingen vor WebP zu Palette-PNG (libimagequant), andere Alpha-Bilder zu WebP und andere opake Bilder zu JPEG. Hochfrequente fotografische JPEGs quantisieren routinemäßig unter der Schwelle — die 8000×8000-Reproduktionsbilder aus Issue #2885 messen 175 und 184 gesampelte Farben gegenüber 2145 und 4077 realen Farben —, und Palette-PNG ist der langsamste Encoder der Pipeline, während es bei solchem Content etwa viermal größere Dateien erzeugt als JPEG (gemessen 2657ms/3.95MiB gegenüber 26ms/0.95MiB bei der 2048px-Master-Größe). Die Probe selbst erzwingt einen vollständigen Decode (`fastShrinkOnLoad: false`), was auf 64MP-Quellen 86 bis 192ms pro Bild kostet. Wenn jeder Kandidat das Byte-Cap überschritt, traten beide Encoder außerdem in eine proportionale Downscale-Retry-Schleife ein, die in einem `IMAGE_TOO_LARGE`-Fehler endete, obwohl gemessene Worst-Case-Inputs (gleichförmiges Rauschen) bei der ersten Qualität in die Default-Budgets passten.

## Decision

Beide Encoder routen nur nach einem dekodierten Fakt: Quellen mit Alpha-Kanal encoden als Lossy-WebP bei Effort 0, opake Quellen als JPEG (libjpeg-turbo), jeweils entlang einer geteilten Quality-Ladder von 85, 75, 60 (`IMAGE_ENCODING_QUALITIES` / `WEBP_ENCODING_EFFORT` / `encodingLadder` in `encoding.ts`). Der Farbanzahl-Klassifikator und der Palette-PNG-Zweig werden gelöscht, nicht repariert, sodass die Fehlklassifikations-Bugklasse nicht wiederkehren kann und kein Bild den Klassifikations-Decode bezahlt. `normalizedImageMaxBytes` und das Routen-`maxBytes` werden Ladder-Ziele statt Caps: Die Ladder stoppt weiterhin bei der ersten passenden Qualität, aber wenn jede Qualität das Ziel überschreitet, wird der kleinste Output behalten, und die Downscale-Retry-Schleife ist weg. Provider-Byte-Limits (DeepSeek 32MiB pro Bild, Inline-Budgets) bleiben dort enforced, wo die Bytes übertragen werden. Master-Dimensionen wechseln von einer Long-Edge-Regel zu einem Gesamtpixel-Budget: `normalizedImageMaxPixels` (Default 2048x2048) skaliert das Raster proportional, und `normalizedImageMaxDimension` (Default 8192, passend zum Admission-Cap pro Seite) klemmt die lange Kante danach, sodass extreme Seitenverhältnisse wie hohe Seiten-Screenshots ihre Short-Edge-Auflösung behalten (eine 2000x20000-Quelle behält etwa 647px Breite statt 204px), während quadratische Quellen exakt wie zuvor normalisieren. Die Request-Transform-Version steigt auf `request-image-v5`, sodass bestehende gecachte Varianten per Identität neu generieren; content-adressierte Master bleiben ohne Migration gültig. Der Request-Cache-Read lehnt Einträge über dem Byte-Ziel nicht mehr ab, da ein ladder-erschöpfter Output das deterministische Ergebnis für seine Variant-Id ist.

Pareto-Messungen über dem Issue-#2885-Reproduktionsset (PR-#2989-Anhänge) stützen die Wahl: Auf fotografischem Content ist JPEG ein bis zwei Größenordnungen schneller als jede Alternative, und WebP bei Effort 0 erreicht die Größe von Palette-PNG auf Grafik-Content, ohne je falsch geroutet zu werden; Uniform-Noise-Worst-Cases passen bei Qualität 85 für opake Quellen in die Default-4MiB/1MiB-Ziele, und nur eine adversarische Random-Alpha-Ebene erschöpft die WebP-Ladder (etwa 6.3MiB, fünffach unter dem Provider-Cap).

Diese Entscheidung ersetzt partiell die [Unified-Image-Request-Pipeline-Note](../feature/2026-08-20-unified-image-request-pipeline.de.md), deren Normalisierungs- und Request-Encoding-Sektionen nun dieses Routing beschreiben; ihr Durable-Version-Split, der Files-Lebenszyklus und die Offload-Projektion bleiben unverändert.

## Alternatives considered

**Den Klassifikator reparieren (höher aufgelöstes Sampling, Gradientenstatistik) und Palette-PNG behalten.** Verworfen: Jeder Content-Klassifikator behält eine Misrouting-Klasse und den per-Bild-Klassifikations-Decode; die einzige Frontier-Nische von Palette-PNG (Grafik) wird von WebP bei einem Bruchteil der Encode-Zeit erreicht.

**Eine einzige WebP-Ladder für alles.** Verworfen: JPEG ist auf opakem fotografischem Content — der dominanten realen Last — vier- bis sechsmal schneller, und die Alpha-Probe ist ein kostenloser Metadaten-Read.

**Die Downscale-Retry-Schleife für ladder-erschöpfte Outputs behalten.** Verworfen: Gemessene Worst-Cases zeigen, dass die Schleife innerhalb der Default-Budgets toter Code ist, und ihr einziger erreichbarer Effekt war, adversarische Inputs vor dem Fehler auf 1×1 zu degradieren.

## Consequences

- Opake Grafiken mit wenigen Farben (Charts, Text-Screenshots) speichern nun als JPEG: zwei- bis dreimal größer als Palette-PNG im Hundert-Kilobyte-Bereich, mit JPEG-Ringing an harten Kanten; die modellsichtbare Request-Version wurde ohnehin bereits vom Pixel-Budget-Downscaling dominiert, sodass die Lesbarkeitsauswirkung marginal ist. Ein Grafik-Codec wieder einzuführen hieße, der Opak-Ladder einen WebP-Schritt hinzuzufügen, nicht die Klassifikation wiederherzustellen.
- GIF-Quellen dekodieren mit einer Alpha-Ebene unter gifload, sodass Still-Frame-GIFs auf die WebP-Ladder normalisieren.
- `IMAGE_TOO_LARGE` entsteht nicht mehr aus dem Encoding; es bleibt der Admission-Fehler für übergroße Quellen.
- Ein ladder-erschöpftes Attachment kann sein Byte-Ziel auf Disk und auf dem Wire überschreiten, bis ein Provider-Cap es ablehnt; gemessen nur mit adversarischem Random-Alpha-Input erreichbar. Ein solches Over-Target-Master erneut als neuen Upload einzureichen scheitert am Pass-through-Byte-Check und encodiert es erneut die Lossy-Ladder hinunter, sodass Normalisierung für diese nur adversarisch erreichbare Klasse nicht idempotent ist und jede Runde Generation Loss addiert.
- Test-Evidenz: `packages/attachment/attachment-local/tests` pinnt das Routing, das Ladder-Exhaustion- und das Readable-Text-Verhalten gegen echte Encoder, einschließlich der Issue-#2885-Misrouting-Charakteristik (hochfrequenter fotografischer Content verlässt den langsamen Pfad).
