# Wichteln — Secret Santa (client-side)

Diese kleine Single-Page-App ist komplett client-seitig und speichert alle Daten im Browser (localStorage). Du kannst sie direkt auf GitHub Pages hosten.

Dateien:
- `index.html` — Hauptseite
- `app.js` — App-Logik (Registration/Login, Wishlist, Draw)
- `styles.css` — Styling

Installation / Deployment

1. In dieses Verzeichnis pushen zu einem GitHub-Repository.
2. In den Repository-Einstellungen GitHub Pages aktivieren (branch: main / root).
3. Seite öffnen — die App läuft komplett im Browser.

Wichtig:
- Die App ist eine Demo: Passwörter werden unverschlüsselt im localStorage gespeichert. Bei echtem Einsatz sollte ein Server mit sicherer Auth verwendet werden.
- Der Admin kann über den Button "Draw" die Zuteilungen einmal zufällig erzeugen (Sattolo-Algorithmus). Die Pairs werden in localStorage unter `wichteln_data_v1` gespeichert.

Vorschläge für Verbesserungen:
- Persistenz auf Server (z.B. GitHub Pages + serverless function, oder Firebase)
- Echte Passwort-Hashes
- E-Mail-Bestätigung für Benutzer

Admin / Organizer Hinweise
-------------------------

- Wenn du möchtest, dass nur du Admin-Rechte bekommst, setze in `firebase-config.js` die Variable
	`window.organizerSecret = '<dein-passwort>';`. Beim Registrieren können Nutzer dann das Feld "Als Admin" auswählen
	und müssen das Organisator-Passwort angeben.
- Admins sehen im Admin-Panel die Pairs in kodierter Form (nicht die echten Namen). Das erlaubt dir, die
	Zuordnungen auf Konsistenz/Einzigartigkeit zu prüfen, ohne die echten Namen sichtbar zu machen.

