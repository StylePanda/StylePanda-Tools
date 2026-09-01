# StylePanda Tools

StylePanda Tools ist eine kostenlose, werbefreie und nichtkommerzielle Sammlung von Browser-Werkzeugen. Verfügbar sind sechs Text Tools, zwölf PDF Tools und zehn Bild Tools.

## Privacy-First Architektur

Die Website verarbeitet Texte, PDFs und Bilder ausschließlich lokal im Browser. Nutzereingaben und ausgewählte Dateien dürfen nicht zur Verarbeitung an den StylePanda-Server oder externe Dienste übertragen werden.

Die Text Tools verarbeiten Eingaben ausschließlich im Arbeitsspeicher des Browsers. Es gibt keine Upload-Funktionen, Benutzerkonten, Datenbank, API, serverseitige Inhaltsverarbeitung, Werbung, Analyse oder Telemetrie.

Auch PDFs und Bilder werden ausschließlich im Browser-Arbeitsspeicher verarbeitet. Die lokal vendorten Open-Source-Bibliotheken, Versionen, Einsatzzwecke und Lizenzen sind in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) dokumentiert.

Die reproduzierbare Offline- und Browser-Validierung der Bild Tools ist in [tests/IMAGE_TOOLS_TESTING.md](tests/IMAGE_TOOLS_TESTING.md) beschrieben.

## Technischer Aufbau

- HTML5
- CSS
- Vanilla JavaScript
- keine Frameworks und kein Build-System
- keine externen Fonts, Skripte oder CDNs
- direkt als statische Website über nginx auslieferbar
- lokal vendorte, fest gepinnte Browser-Bibliotheken für PDF- und ZIP-Verarbeitung

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
