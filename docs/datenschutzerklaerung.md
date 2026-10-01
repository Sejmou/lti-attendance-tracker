# Datenschutzerklärung zur Anwesenheitserfassung

Diese Datenschutzerklärung informiert dich darüber, welche personenbezogenen Daten der [Name des Vereins] bei der Erfassung der Anwesenheit bei Vereinsveranstaltungen verarbeitet, wozu und wie lange.

## Verantwortlicher

[Name des Vereins]
[Anschrift]
ZVR-Zahl: [ZVR-Zahl]
E-Mail: [Kontaktadresse für Datenschutzanfragen]

## Woher die Daten stammen

Die Anwesenheitserfassung ist über den Moodle-Kurs des Vereins erreichbar, der nur aktiven Mitgliedern offensteht. Wenn du die Aktivität zum ersten Mal öffnest, übermittelt Moodle deinen Vornamen, Nachnamen, deine E-Mail-Adresse und deine Moodle-Benutzerkennung an die Anwendung.

## Welche Daten wir verarbeiten und wozu

**Stammdaten:** Vorname, Nachname, E-Mail-Adresse, Moodle-Benutzerkennung, Zeitpunkt deines ersten und letzten Aufrufs. Damit ordnen wir Scans dir zu. Die E-Mail-Adresse brauchen die Organisator:innen, um Mitglieder mit gleichem Namen zu unterscheiden.

**Anwesenheit:** bei jedem Scan des QR-Codes die Veranstaltung, der Zeitpunkt und die Art der Bestätigung (eingerichtetes Gerät, Moodle-Aufruf oder als Organisator:in, die den Code anzeigt). Dein erster Scan einer Veranstaltung gilt als Einscannen, dein letzter als Ausscannen.

**Schutz vor Missbrauch:** damit niemand für abwesende Mitglieder scannt, speichern wir zu jedem Scan

- einen nicht umkehrbaren Prüfwert (HMAC) deiner IP-Adresse. Die Adresse selbst wird nicht gespeichert. Der Prüfwert wird je Veranstaltung anders berechnet und zeigt nur, ob mehrere Scans derselben Veranstaltung von derselben Adresse kamen.
- die Kennung deines Browsers (User-Agent), aus der Gerätetyp, Betriebssystem und Browser samt Versionen hervorgehen.

Außerdem speichern wir, wann du ein Gerät für das Scannen eingerichtet hast, mit dessen Browserkennung. So fallen ungewöhnliche Gerätewechsel auf.

**Geräteschlüssel:** wenn du ein Gerät einrichtest, erzeugt dein Browser ein Schlüsselpaar. Der private Schlüssel bleibt in deinem Browser und kann nicht ausgelesen werden, auch nicht von uns. Wir speichern nur den öffentlichen Schlüssel.

**Anmeldedaten aus Moodle:** bei jedem Aufruf aus Moodle speichern wir die übermittelten Anmeldedaten (unter anderem Name, E-Mail-Adresse, Rolle und Kurs) für 24 Stunden, weil die eingesetzte LTI-Bibliothek das für den Anmeldevorgang vorsieht.

## Speicherung auf deinem Gerät

Die Anwendung legt nur ab, was für ihre Funktion technisch notwendig ist:

- den Geräteschlüssel (siehe oben) im Speicher deines Browsers (IndexedDB), bis du die Websitedaten löschst oder ein anderes Gerät einrichtest
- nach einem Scan ein Cookie, das 10 Minuten lang bestätigt, dass du einen gültigen Code gescannt hast
- für Organisator:innen ein Anmelde-Cookie, gültig für 24 Stunden

Es gibt keine Analyse- oder Werbe-Cookies und keine Einbindung von Drittanbietern.

## Wer die Daten sieht

- **Organisator:innen des Vereins**, also wer in Moodle Zugriff auf das Admin-Werkzeug hat: alle oben genannten Daten, für alle Veranstaltungen.
- **Anwesende bei der Veranstaltung:** der Bildschirm mit dem QR-Code zeigt bei jedem Scan einen Kurznamen an: deinen Vornamen, und nur wenn ein anderes Mitglied denselben Vornamen hat, so viele Buchstaben deines Nachnamens wie nötig, um dich zu unterscheiden (z. B. „Anna B.“).
- **[Hosting-Anbieter, Sitz]** als Auftragsverarbeiter, der den Server betreibt.

Wir geben keine Daten an sonstige Dritte weiter und übermitteln keine Daten in Länder außerhalb des EWR. [Anpassen, falls der Hosting-Anbieter außerhalb des EWR sitzt.]

## Rechtsgrundlage

- Erfassung der Anwesenheit: [Art. 6 Abs. 1 lit. b DSGVO (Mitgliedschaftsverhältnis, § [x] der Statuten) oder Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse des Vereins an einer verlässlichen Anwesenheitserfassung)]
- Schutz vor Missbrauch (IP-Prüfwert, Browserkennung, Geräteeinrichtungen): Art. 6 Abs. 1 lit. f DSGVO, berechtigtes Interesse an einer fälschungssicheren Anwesenheitserfassung
- Speicherung auf deinem Gerät: § 165 Abs. 3 TKG 2021, da technisch unbedingt erforderlich

## Wie lange wir Daten speichern

| Daten                                  | Speicherdauer                                                        |
| -------------------------------------- | -------------------------------------------------------------------- |
| Stammdaten, Geräteschlüssel            | bis zum Ende deiner Mitgliedschaft                                   |
| IP-Prüfwert und Browserkennung je Scan | 12 Monate, längstens bis zum Ende deiner Mitgliedschaft              |
| Geräteeinrichtungen                    | 12 Monate, längstens bis zum Ende deiner Mitgliedschaft              |
| Anmeldedaten aus Moodle                | 24 Stunden                                                           |
| Scans (Veranstaltung, Zeitpunkt)       | nach Ende deiner Mitgliedschaft anonymisiert weiter, für Statistiken |
| Sicherungskopien                       | [x] Tage                                                             |

**Anonymisierung:** endet deine Mitgliedschaft, löschen wir deine Stammdaten, deinen Geräteschlüssel und alle Geräteeinrichtungen. Deine Scans bleiben für Teilnahmestatistiken erhalten, erhalten aber je Veranstaltung eine eigene Zufallskennung. Sie lassen sich weder dir noch untereinander über Veranstaltungen hinweg zuordnen. IP-Prüfwert und Browserkennung werden dabei entfernt.

Bis zum Ablauf ihrer Speicherdauer können gelöschte Daten noch in Sicherungskopien enthalten sein.

## Ist die Bereitstellung verpflichtend?

[Anpassen an die Statuten, z. B.: Die Anwesenheitserfassung ist freiwillig. Ohne Name und E-Mail-Adresse aus Moodle ist eine Erfassung nicht möglich.]

Es findet keine automatisierte Entscheidungsfindung oder Profilbildung im Sinne von Art. 22 DSGVO statt.

## Deine Rechte

Du hast das Recht auf Auskunft (Art. 15 DSGVO), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung der Verarbeitung (Art. 18) und Datenübertragbarkeit (Art. 20). Soweit wir uns auf berechtigte Interessen stützen, kannst du der Verarbeitung aus Gründen, die sich aus deiner besonderen Situation ergeben, widersprechen (Art. 21). Wende dich dafür an [Kontaktadresse].

Du hast außerdem das Recht, dich bei der Datenschutzbehörde zu beschweren:
Österreichische Datenschutzbehörde, Barichgasse 40–42, 1030 Wien, dsb@dsb.gv.at, www.dsb.gv.at

Stand: [Datum]
