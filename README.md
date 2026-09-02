# StylePanda Tools

StylePanda Tools ist eine kostenlose, werbefreie und nichtkommerzielle Sammlung von Browser-Werkzeugen. Verfügbar sind sechs Text Tools, zwölf PDF Tools, zehn Bild Tools, elf Entwickler Tools, sechs Security Tools, acht Rechner und sechs Werkzeuge für Datum & Zeit.

## Privacy-First Architektur

Die Website verarbeitet Texte, PDFs, Bilder, Inhalte der Entwickler Tools sowie Passwörter, Klartexte, verschlüsselte Daten und Dateien der Security Tools ausschließlich lokal im Browser. Nutzereingaben und ausgewählte Dateien dürfen nicht zur Verarbeitung an den StylePanda-Server oder externe Dienste übertragen werden.

Die Text Tools verarbeiten Eingaben ausschließlich im Arbeitsspeicher des Browsers. Es gibt keine Upload-Funktionen, Benutzerkonten, Datenbank, API, serverseitige Inhaltsverarbeitung, Werbung, Analyse oder Telemetrie.

Auch PDFs und Bilder werden ausschließlich im Browser-Arbeitsspeicher verarbeitet. Die lokal vendorten Open-Source-Bibliotheken, Versionen, Einsatzzwecke und Lizenzen sind in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) dokumentiert.

Die reproduzierbare Offline- und Browser-Validierung der Bild Tools ist in [tests/IMAGE_TOOLS_TESTING.md](tests/IMAGE_TOOLS_TESTING.md) beschrieben. Die Entwickler Tools werden mit `tests/developer_tools.test.js` und `tests/developer_pages_browser_test.js` einschließlich einer Netzwerksperre nach Seitenladung geprüft.

Die Kategorie **Sicherheit** enthält genau sechs Werkzeuge: Passwortgenerator, Passwortstärke prüfen, Zufallsstring-Generator, Text verschlüsseln & entschlüsseln, Datei verschlüsseln & entschlüsseln sowie Datei-Prüfsumme berechnen & vergleichen. AES-256-GCM, PBKDF2-SHA-256 und SHA-2 werden nativ über Web Crypto ausgeführt; es gibt keine Uploads, externen Sicherheitsdienste oder Persistenz sensibler Werte. Tests liegen in `tests/security_tools.test.js` und `tests/security_pages_browser_test.js`.

Die Kategorie **Rechner** enthält genau acht Werkzeuge: Prozentrechner, Dreisatzrechner, Rabattrechner, Mehrwertsteuerrechner, Einheitenumrechner, Datengrößenrechner, Temperaturumrechner und Geschwindigkeitsumrechner. Alle Formeln und festen Umrechnungsfaktoren liegen in lokalem JavaScript; es werden weder Eingaben noch Ergebnisse an einen Server oder externen Dienst übertragen. Tests liegen in `tests/calculator_tools.test.js` und `tests/calculator_pages_browser_test.js`.

Die Kategorie **Datum & Zeit** enthält genau sechs Werkzeuge: Datumsdifferenz berechnen, Tage zwischen zwei Daten, Datum addieren & subtrahieren, Altersrechner, Kalenderwochen-Rechner und Zeitdauer berechnen. Gemeinsame Civil-Date-Helfer vermeiden Zeitzonenfehler bei reinen Kalenderdaten; alle Berechnungen erfolgen lokal. Der vorhandene Unix-Timestamp-Konverter bleibt unverändert in der Kategorie Entwickler. Tests liegen in `tests/datetime_tools.test.js` und `tests/datetime_pages_browser_test.js`.

## Technischer Aufbau

- HTML5
- CSS
- Vanilla JavaScript
- keine Frameworks und kein Build-System
- keine externen Fonts, Skripte oder CDNs
- direkt als statische Website über nginx auslieferbar
- lokal vendorte, fest gepinnte Browser-Bibliotheken für PDF-, ZIP- und QR-Code-Verarbeitung

## Lokale Entwicklung

Die Seiten können direkt im Browser geöffnet werden. Für korrekte absolute Pfade und eine realistische lokale Vorschau empfiehlt sich ein vorhandener einfacher HTTP-Server im Repository-Stamm. Es müssen keine globalen Programme installiert werden.

Beispiel mit einer bereits vorhandenen Python-Installation:

```text
python -m http.server 8000
```

Anschließend ist die Startseite unter `http://localhost:8000/` erreichbar.

## Produktionsdomain

Die zukünftige Produktionsdomain ist:

`https://tools.stylepanda.me/`

Vor dem Produktionsstart müssen Hosting- und Webserver-Konfiguration, HTTP-Sicherheitsheader, Fehlerseiten-Zuordnung sowie tatsächliche Protokollierung geprüft werden.

## Deployment-Modell

```text
PC / Codex
    ↓ Commit
GitHub (Branch: main)
    ↓ Produktions-Deployment
Production Server
    ↓ Immutable Release + current-Symlink
nginx
```

Die Website wird ausschließlich über Git ausgerollt. Änderungen entstehen auf
dem PC, werden nach Prüfung separat committed und nach `main` gepusht. Erst
danach holt das Produktionssystem den exakten Stand von `origin/main`, erstellt
ein unveränderliches Release und schaltet den `current`-Symlink atomar um.

Der spätere normale Produktionsaufruf lautet:

```text
sudo /var/www/stylepanda-tools/deploy.sh
```

Die auf dem Server installierte Datei `/var/www/stylepanda-tools/deploy.sh` ist
eine root-eigene operative Kopie von `scripts/deploy.sh`. Das Skript wird nicht
aus dem öffentlichen Web-Release ausgeliefert. Produktionsdateien werden nicht
manuell bearbeitet und Deployments werden nicht direkt vom lokalen PC gestartet.

Der Ablauf ist:

```text
PC / Codex
    ↓
Git commit
    ↓
GitHub main
    ↓
Production deploy
```
