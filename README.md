# Wichteln – Einrichtung

## Einmalig in der Firebase-Konsole (Projekt `wichteln-6fe74`)

1. **Anmeldung aktivieren:** *Authentication → Sign-in method → E-Mail/Passwort* aktivieren.
2. **Dein Admin-Konto anlegen:** *Authentication → Users → Add user*
   - E-Mail: `toni@wichteln.example` (die Adresse gibt es nicht, sie ist nur intern)
   - Passwort: ein neues, gutes Passwort
3. **Sicherheitsregeln:** *Firestore Database → Rules*, den Inhalt von `firestore.rules` einfügen und **Publish** klicken.
4. **Domain freigeben** (nur falls die Seite nicht unter `…firebaseapp.com` / `…web.app` läuft):
   *Authentication → Settings → Authorized domains* → deine Domain hinzufügen.

## Dateien

`index.html`, `styles.css`, `app.js` ersetzen die alten Dateien. Deine bestehende `firebase-config.js` bleibt, wie sie ist.

## Loslegen

1. Auf der Seite mit Name **Toni** und deinem neuen Passwort anmelden.
   Dabei werden die alten Daten (`shared/wichteln`) automatisch gelöscht.
2. *Organisation* → für alle ein Konto anlegen. Name und Passwort werden nach dem Anlegen angezeigt, zum Weitergeben.
3. Ausnahmen, Datum und Budget eintragen.
4. **Jetzt auslosen.** Wunschlisten bleiben danach offen.

## Gut zu wissen

- Angemeldet wird mit dem Namen, Groß-/Kleinschreibung und Umlaute sind egal („Oma Gerda“ = „oma gerda“).
- **Passwort ändern** oder **Login endgültig löschen** geht in der Firebase-Konsole unter *Authentication → Users*.
- Kommt nach der Ziehung jemand dazu: Ziehung zurücksetzen und neu auslosen.
- **Codename-Icons:** Bilddateien z. B. in einen Ordner `icons/` legen und in `app.js` bei `CODENAMEN` eintragen (`icon: 'icons/maroni.svg'`).
- Die Ziehung wird in deinem Browser berechnet. Die App zeigt sie dir nicht an und du kannst sie danach nicht mehr lesen, mit Entwicklerwerkzeugen könnte man im Moment des Auslosens aber hineinschauen.
