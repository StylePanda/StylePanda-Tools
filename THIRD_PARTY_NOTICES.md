# Drittanbieter-Bibliotheken

Die folgenden Produktionsbibliotheken liegen fest gepinnt unter `assets/vendor/`. Zur Laufzeit werden keine Bibliotheken von CDNs oder Drittservern geladen. Die vollständigen Originallizenzen liegen neben den jeweiligen Dateien.

## pdf-lib 1.17.1

- Projekt: https://github.com/Hopding/pdf-lib
- Lizenz: MIT
- Lokale Lizenz: `assets/vendor/pdf-lib/LICENSE.md`
- Verwendete Datei: `assets/vendor/pdf-lib/pdf-lib.min.js`
- Zweck: PDF-Erzeugung und strukturelle Bearbeitung, insbesondere Seiten kopieren, zusammenfügen, drehen, neu anordnen, Seitengrößen ändern, Standardmetadaten bearbeiten und JPEG/PNG einbetten.

## PDF.js / pdfjs-dist 5.7.284

- Projekt: https://github.com/mozilla/pdf.js
- Lizenz: Apache License 2.0
- Lokale Lizenz: `assets/vendor/pdfjs/LICENSE`
- Verwendete Distribution: `pdf.min.mjs`, `pdf.worker.min.mjs`, Bilddecoder sowie erforderliche lokale CMaps, Standard-Schriften und WASM-Ressourcen einschließlich ihrer mitgelieferten Lizenzdateien.
- Zweck: Lokales Laden und Rendern von PDF-Seiten, progressive Miniaturen, Rasterexport, passwortgestütztes Rendering und begrenzte Rekonstruktion eingebetteter Bildobjekte.

## JSZip 3.10.1

- Projekt: https://github.com/Stuk/jszip
- Lizenzwahl für dieses Projekt: MIT (das Projekt bietet alternativ GPL-3.0-or-later an)
- Lokale Lizenz: `assets/vendor/jszip/LICENSE.markdown`
- Verwendete Datei: `assets/vendor/jszip/jszip.min.js`
- Zweck: Mehrere lokal erzeugte PDFs oder Bilder im Browser als ZIP verpacken.

Alle drei gewählten Lizenzen erlauben die lokale Nutzung und Weitergabe der vendorten Browser-Distributionen unter Beibehaltung der Lizenzhinweise.
