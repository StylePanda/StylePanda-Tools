# StylePanda Tools

StylePanda Tools ist eine kostenlose, werbefreie und nichtkommerzielle Sammlung von Browser-Werkzeugen. Die erste verfügbare Funktionsgruppe umfasst sechs Text Tools; PDF-Tools sind geplant.

## Privacy-First Architektur

Die Website ist darauf ausgelegt, spätere Text- und PDF-Verarbeitung ausschließlich lokal im Browser auszuführen. Nutzereingaben und ausgewählte Dateien dürfen nicht zur Verarbeitung an den StylePanda-Server oder externe Dienste übertragen werden.

Die Text Tools verarbeiten Eingaben ausschließlich im Arbeitsspeicher des Browsers. Es gibt keine Upload-Funktionen, Benutzerkonten, Datenbank, API, serverseitige Inhaltsverarbeitung, Werbung, Analyse oder Telemetrie.

## Technischer Aufbau

- HTML5
- CSS
- Vanilla JavaScript
- keine Frameworks und kein Build-System
- keine externen Fonts, Skripte oder CDNs
- direkt als statische Website über nginx auslieferbar

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
