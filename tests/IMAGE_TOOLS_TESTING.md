# Bild-Tools: lokale und Offline-Validierung

Die Phase-4-Anwendung besteht ausschließlich aus statischen HTML-, CSS- und JavaScript-Dateien. Die Bilddaten werden per `File`/`Blob`, Objekt-URL und Canvas verarbeitet. Nur die bereits vendorte JSZip-Datei wird für ZIP-Downloads verwendet.

## Automatische Prüfungen

1. `node tests/image_tools.test.js` prüft Signaturen, Größenlogik, Drehabmessungen, Farbumrechnung, Favicon-Einpassung, Metadaten ohne EXIF sowie verbotene Netzwerk-/Code-Muster.
2. `node tests/validate_site.js` prüft alle 34 Seiten, Links, lokalen Assets, Metadaten und die statische Netzwerkgrenze.
3. `node tests/production_like_server.js 8010` startet die produktionsnahe statische Auslieferung.
4. Ein Chromium-Browser wird mit DevTools-Port gestartet; anschließend führt `node tests/image_pages_browser_test.js <port> http://127.0.0.1:8010` die Laufzeitprüfung aus.

Der Browser-Test lädt zunächst jede Seite und ihre lokalen Assets. Danach sperrt er über `Network.setBlockedURLs` sämtliche HTTP- und HTTPS-Zugriffe, ohne lokale `data:`-/`blob:`-Browserressourcen fälschlich als Netzwerk zu behandeln. Anschließend führt er Skalierung, Formatkonvertierung, Metadatenentfernung und Farbabtastung aus. Damit wird gezielt belegt, dass diese Bildverarbeitung nach dem Laden keine Serververbindung benötigt.

Eine direkte Decode-Regression reicht ein festes gültiges rotes 4×2-PNG sowie echte, im Chromium-Browser erzeugte JPEG- und WebP-Dateien über denselben `<input type="file">`- und Produktionsdecoder ein. Sie prüft MIME, Breite, Höhe, sichtbare CSP-kompatible Vorschau und einen über Canvas gelesenen Pixel. Zusätzlich laufen Bildauswahl, Vorschau, Maße und Werkzeugoperationen für PNG/JPEG/WebP über Kompressor, Größenänderung, Zuschnitt, Drehen/Spiegeln, Konverter, Metadatenanzeige und Farbauswahl.

Zusätzlich prüft der Laufzeittest Drehabmessungen, zwei Dateien in der Stapelverarbeitung, ZIP-Erzeugung, ein Bild ohne EXIF/GPS, eine beschädigte Eingabe, alle sechs Favicon-Größen und horizontalen Seiten-Overflow bei 320, 375, 390, 430, 768, 1024, 1280, 1440 und 1920 Pixeln.

## Manueller Ablauf ohne Automationsbrowser

Nach dem vollständigen Laden einer Tool-Seite kann im Browser-DevTools-Netzwerkbereich „Offline“ aktiviert werden. Danach ein lokales JPEG/PNG/WebP auswählen und die jeweilige Operation ausführen. Es dürfen keine Laufzeitrequests für Bildinhalte erscheinen; das Ergebnis muss als lokaler Download bereitstehen.
