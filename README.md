# StylePanda Tools

StylePanda Tools ist die technische Basis für eine kostenlose, werbefreie und nichtkommerzielle Sammlung von Browser-Werkzeugen. Die erste geplante Funktionsgruppe umfasst Text- und PDF-Tools.

## Privacy-First Architektur

Die Website ist darauf ausgelegt, spätere Text- und PDF-Verarbeitung ausschließlich lokal im Browser auszuführen. Nutzereingaben und ausgewählte Dateien dürfen nicht zur Verarbeitung an den StylePanda-Server oder externe Dienste übertragen werden.

Aktuell enthält das Projekt nur statische Übersichtsseiten. Es gibt keine Upload-Funktionen, Benutzerkonten, Datenbank, API, serverseitige Inhaltsverarbeitung, Werbung, Analyse oder Telemetrie.

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
    ↓
GitHub (Branch: main)
    ↓
Production Server
```

Dieses Repository dokumentiert bewusst keine erfundenen Produktionsbefehle. Deployment und Produktionsvalidierung erfolgen erst, wenn die reale Serverumgebung feststeht.
