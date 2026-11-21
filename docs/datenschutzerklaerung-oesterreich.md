# Datenschutzerklärung zur Anwesenheitserfassung

Diese Datenschutzerklärung informiert dich darüber, welche personenbezogenen Daten der [Name des Vereins] bei der Erfassung der Anwesenheit bei Vereinsveranstaltungen zu welchem Zweck verarbeitet. Außerdem erfährst du, welche Daten wie lange gespeichert werden.

## Verantwortlicher

[Name des Vereins]
[Anschrift]
ZVR-Zahl: [ZVR-Zahl]
E-Mail: [Kontaktadresse für Datenschutzanfragen]

## Woher die Daten stammen

Die Anwesenheitserfassung ist über den Moodle-Kurs des Vereins erreichbar, der nur aktiven Mitgliedern offensteht. Die Daten stammen aus diesen Quellen:

- **Moodle:** wenn du die Aktivität öffnest, übermittelt Moodle deinen Vornamen, Nachnamen, deine E-Mail-Adresse, deine Moodle-Benutzerkennung sowie Anmeldedaten wie Rolle und Kurs.
- **Dein Gerät:** wenn du ein Gerät einrichtest oder einen QR-Code scannst, sendet dein Browser deine IP-Adresse, seine Kennung (User-Agent), eine zufällige Browser-ID (siehe [Speicherung auf deinem Gerät](#speicherung-auf-deinem-gerät)) und beim Einrichten den öffentlichen Geräteschlüssel. Zeitpunkt und Veranstaltung eines Scans hält die Anwendung selbst fest.
- **Du selbst:** wenn das Scannen bei dir nicht klappt und du deine Anwesenheit von Hand bestätigst, den Vornamen, Nachnamen und die E-Mail-Adresse, die du eingibst.

## Welche Daten wir verarbeiten und wozu

**Stammdaten:** Vorname, Nachname, E-Mail-Adresse, Moodle-Benutzerkennung, Zeitpunkt deines ersten und letzten Aufrufs. Damit ordnen wir Scans dir zu. Die E-Mail-Adresse brauchen die Organisator:innen, um Mitglieder mit gleichem Namen zu unterscheiden.

**Anwesenheit:** bei jedem Scan des QR-Codes die Veranstaltung, der Zeitpunkt und die Art der Bestätigung (eingerichtetes Gerät, Moodle-Aufruf, als Organisator:in, die den Code anzeigt, oder von Hand eingegebene Daten). Dein erster Scan einer Veranstaltung gilt als Einscannen, dein letzter als Ausscannen.

**Von Hand eingegebene Daten:** bestätigst du deine Anwesenheit, indem du Name und E-Mail-Adresse eingibst, speichern wir sie als eigenen Eintrag, getrennt von deinem Moodle-Konto, und vermerken bei deinen Scans, dass sie von Hand eingegeben wurden. Dass du es wirklich warst, können wir nicht prüfen. Organisator:innen können diese Scans je Veranstaltung deinem Moodle-Konto zuordnen; dein Eintrag bleibt dabei erhalten, damit sich die Zuordnung rückgängig machen lässt.

**Schutz vor Missbrauch:** damit niemand für abwesende Mitglieder scannt, speichern wir zu jedem Scan

- einen nicht umkehrbaren Prüfwert (HMAC) deiner IP-Adresse. Die Adresse selbst wird nicht gespeichert. Der Prüfwert wird je Veranstaltung anders berechnet und zeigt nur, ob mehrere Scans derselben Veranstaltung von derselben Adresse kamen.
- die Kennung deines Browsers (User-Agent), aus der Gerätetyp, Betriebssystem und Browser samt Versionen hervorgehen.
- einen nicht umkehrbaren Prüfwert der zufälligen Browser-ID (siehe [Speicherung auf deinem Gerät](#speicherung-auf-deinem-gerät)). Die ID selbst wird beim Scan nicht gespeichert. Wie der IP-Prüfwert wird er je Veranstaltung anders berechnet und zeigt nur, ob die Anwesenheit mehrerer Personen bei derselben Veranstaltung vom selben Browser aus bestätigt wurde.
- bei von Hand eingegebenen Daten auf einem Gerät, das für ein anderes Mitglied eingerichtet ist: wessen Gerät es war.

Außerdem speichern wir, wann du ein Gerät für das Scannen eingerichtet hast, mit dessen Browserkennung. So fallen ungewöhnliche Gerätewechsel auf.

**Geräteschlüssel:** wenn du ein Gerät einrichtest, indem du auf der von Moodle geöffneten Seite auf „Dieses Handy verknüpfen“ tippst, erzeugt dein Browser ein Schlüsselpaar. Der private Schlüssel bleibt in deinem Browser und kann nicht ausgelesen werden, auch nicht von uns. Wir speichern nur den öffentlichen Schlüssel. Ohne dieses Tippen wird nichts eingerichtet.

**Einsicht in deine eigene Anwesenheit:** die von Moodle geöffnete Seite zeigt deine Anwesenheit an. In einem Browser, den du eingerichtet hast, zeigt sie auch die Startseite der Anwendung, ohne Moodle. Dazu signiert dein Browser mit dem Geräteschlüssel einen einmaligen, 5 Minuten gültigen Wert. Dafür wird nichts gespeichert, und es gibt keine Anmeldung.

**Anmeldedaten aus Moodle:** bei jedem Aufruf aus Moodle speichern wir die übermittelten Anmeldedaten (unter anderem Name, E-Mail-Adresse, Rolle und Kurs) für 24 Stunden, weil die eingesetzte LTI-Bibliothek das für den Anmeldevorgang vorsieht.

## Speicherung auf deinem Gerät

Die Anwendung legt nur ab, was für ihre Funktion technisch notwendig ist:

- den Geräteschlüssel (siehe oben) im Speicher deines Browsers (IndexedDB), sobald du auf „Dieses Handy verknüpfen“ tippst, bis du die Websitedaten löschst oder ein anderes Gerät einrichtest
- nach einem Scan ein Cookie, das 10 Minuten lang bestätigt, dass du einen gültigen Code gescannt hast
- nach einem Scan ein Cookie mit einer zufälligen Browser-ID, gültig für 12 Monate und mit jedem Scan erneuert, damit auffällt, wenn mehrere Personen vom selben Browser aus bestätigt werden (siehe [Schutz vor Missbrauch](#welche-daten-wir-verarbeiten-und-wozu))
- wenn du deine Anwesenheit von Hand bestätigst, den eingegebenen Namen und die E-Mail-Adresse im Speicher deines Browsers (localStorage), damit du sie nicht noch einmal eingeben musst; bis du die Websitedaten löschst
- für Organisator:innen ein Anmelde-Cookie, gültig für 24 Stunden

Es gibt keine Analyse- oder Werbe-Cookies und keine Einbindung von Drittanbietern.

## Wer die Daten sieht

- **Organisator:innen des Vereins**, also wer in Moodle Zugriff auf das Admin-Werkzeug hat: alle oben genannten Daten, für alle Veranstaltungen.
- **Du selbst:** deine eigene Anwesenheit bei jeder Veranstaltung: wann du gescannt hast, wie jeder Scan bestätigt wurde und welche Scans als Ein- und Ausscannen zählen. Nicht die Prüfwerte gegen Missbrauch. Das sieht auch, wer einen von dir eingerichteten Browser benutzt; richte daher nur ein Gerät ein, das dir gehört.
- **Anwesende bei der Veranstaltung:** der Bildschirm mit dem QR-Code zeigt bei jedem Scan einen Kurznamen an: deinen Vornamen (bei mehreren nur den ersten), und nur wenn ein anderes Mitglied denselben Vornamen hat, so viele Buchstaben deines Nachnamens wie nötig, um dich zu unterscheiden (z. B. „Anna B.“). Hat eine andere Person genau denselben Namen, unterscheidet euch stattdessen eine Nummer (z. B. „Anna (2)“). Von Hand bestätigte Anwesenheit ist mit einem Symbol markiert.
- **[Hosting-Anbieter, Sitz]** als Auftragsverarbeiter, der den Server betreibt.

Wir geben keine Daten an sonstige Dritte weiter und übermitteln keine Daten in Länder außerhalb des EWR. [Anpassen, falls der Hosting-Anbieter außerhalb des EWR sitzt.]

## Rechtsgrundlage

- Erfassung der Anwesenheit: [Art. 6 Abs. 1 lit. b DSGVO (Mitgliedschaftsverhältnis, § [x] der Statuten) oder Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse des Vereins an einer verlässlichen Anwesenheitserfassung)]
- Schutz vor Missbrauch (IP- und Browser-Prüfwert, Browserkennung, Geräteeinrichtungen, das Gerät bei von Hand eingegebenen Daten): Art. 6 Abs. 1 lit. f DSGVO, berechtigtes Interesse an einer fälschungssicheren Anwesenheitserfassung
- Speicherung auf deinem Gerät: § 165 Abs. 3 TKG 2021, da technisch unbedingt erforderlich

## Wie lange wir Daten speichern

| Daten                                                           | Speicherdauer                                                        |
| --------------------------------------------------------------- | -------------------------------------------------------------------- |
| Stammdaten, Geräteschlüssel                                     | bis zum Ende deiner Mitgliedschaft                                   |
| Von Hand eingegebene Daten                                      | bis zum Ende deiner Mitgliedschaft                                   |
| IP-Prüfwert und Browserkennung je Scan                          | 12 Monate, längstens bis zum Ende deiner Mitgliedschaft              |
| Browser-Prüfwert je Scan, Gerät bei von Hand eingegebenen Daten | 12 Monate, längstens bis zum Ende deiner Mitgliedschaft              |
| Geräteeinrichtungen                                             | 12 Monate, längstens bis zum Ende deiner Mitgliedschaft              |
| Anmeldedaten aus Moodle                                         | 24 Stunden                                                           |
| Scans (Veranstaltung, Zeitpunkt)                                | nach Ende deiner Mitgliedschaft anonymisiert weiter, für Statistiken |
| Sicherungskopien                                                | [x] Tage                                                             |

**Anonymisierung:** endet deine Mitgliedschaft, löschen wir deine Stammdaten, deine von Hand eingegebenen Daten, deinen Geräteschlüssel und alle Geräteeinrichtungen. Deine Scans bleiben für Teilnahmestatistiken erhalten, erhalten aber je Veranstaltung eine eigene Zufallskennung. Sie lassen sich weder dir noch untereinander über Veranstaltungen hinweg zuordnen. IP- und Browser-Prüfwert sowie Browserkennung werden dabei entfernt, ebenso der Vermerk bei Einträgen anderer Mitglieder, die auf deinem Gerät von Hand gemacht wurden.

Bis zum Ablauf ihrer Speicherdauer können gelöschte Daten noch in Sicherungskopien enthalten sein.

## Ist die Bereitstellung verpflichtend?

[Anpassen an die Statuten, z. B.: Die Anwesenheitserfassung ist freiwillig. Ohne Name und E-Mail-Adresse aus Moodle ist eine Erfassung nicht möglich.]

Es findet keine automatisierte Entscheidungsfindung oder Profilbildung im Sinne von Art. 22 DSGVO statt.

## Deine Rechte

Du hast das Recht auf Auskunft (Art. 15 DSGVO), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung der Verarbeitung (Art. 18) und Datenübertragbarkeit (Art. 20). Soweit wir uns auf berechtigte Interessen stützen, kannst du der Verarbeitung aus Gründen, die sich aus deiner besonderen Situation ergeben, widersprechen (Art. 21). Wende dich dafür an [Kontaktadresse]. Deine Scans kannst du außerdem jederzeit selbst in der Anwendung einsehen (siehe [Wer die Daten sieht](#wer-die-daten-sieht)).

Du hast außerdem das Recht, dich bei der Datenschutzbehörde zu beschweren:
Österreichische Datenschutzbehörde, Barichgasse 40–42, 1030 Wien, dsb@dsb.gv.at, www.dsb.gv.at

Stand: [Datum]
