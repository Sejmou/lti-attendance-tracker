# Privacy Notice for Attendance Tracking

This notice explains which personal data [Name of the Verein] processes when recording attendance at its events, why, and for how long.

## Controller

[Name of the Verein]
[Address]
ZVR number: [ZVR number]
Email: [contact address for data protection requests]

## Where the data comes from

Attendance tracking is reached through the Verein's Moodle course, which only active members can open. When you first open the activity, Moodle passes your first name, last name, email address and Moodle user ID to the app.

## What we process and why

**Member details:** first name, last name, email address, Moodle user ID, and when you first and last opened the app. We use them to attribute scans to you. Organizers need the email address to tell apart members with the same name.

**Attendance:** for every scan of the QR code, the event, the time, and how it was confirmed (a set-up device, a Moodle launch, or being the organizer showing the code). Your first scan of an event counts as checking in, your last as checking out.

**Preventing abuse:** so nobody can scan for absent members, we store with every scan

- an irreversible check value (HMAC) of your IP address. The address itself is not stored. The value is computed differently for every event and only shows whether several scans at the same event came from the same address.
- your browser's identifier (user agent), which shows the device type, operating system and browser, including versions.

We also record when you set up a device for scanning, with its browser identifier, so that unusual device changes stand out.

**Device key:** when you set up a device, your browser creates a key pair. The private key stays in your browser and cannot be read out, not even by us. We only store the public key.

**Login data from Moodle:** on every launch from Moodle we store the login data it sends (including name, email address, role and course) for 24 hours, because the LTI library the app uses requires it for the login process.

## Storage on your device

The app only stores what it technically needs to work:

- the device key (see above) in your browser's storage (IndexedDB), until you clear the site data or set up another device
- after a scan, a cookie confirming for 10 minutes that you scanned a valid code
- for organizers, a login cookie valid for 24 hours

There are no analytics or advertising cookies and no third-party services.

## Who sees the data

- **The Verein's organizers**, meaning whoever can open the admin tool in Moodle: all of the data above, for all events.
- **People present at the event:** the screen showing the QR code displays a short name for every scan: your first name, and only if another member shares it, as many letters of your last name as needed to tell you apart (e.g. "Anna B.").
- **[Hosting provider, location]** as a processor running the server.

We do not pass data to any other third parties or transfer it to countries outside the EEA. [Adjust if the hosting provider is outside the EEA.]

## Legal basis

- Recording attendance: [Art. 6(1)(b) GDPR (membership relationship, § [x] of the statutes) or Art. 6(1)(f) GDPR (the Verein's legitimate interest in reliable attendance records)]
- Preventing abuse (IP check value, browser identifier, device setups): Art. 6(1)(f) GDPR, legitimate interest in tamper-proof attendance records
- Storage on your device: § 165(3) TKG 2021 (Austrian Telecommunications Act), as strictly necessary

## How long we keep data

| Data                                           | Retention                                                          |
| ---------------------------------------------- | ------------------------------------------------------------------ |
| Member details, device key                     | until your membership ends                                         |
| IP check value and browser identifier per scan | 12 months, at most until your membership ends                      |
| Device setups                                  | 12 months, at most until your membership ends                      |
| Login data from Moodle                         | 24 hours                                                           |
| Scans (event, time)                            | kept in anonymised form after your membership ends, for statistics |
| Backups                                        | [x] days                                                           |

**Anonymisation:** when your membership ends, we delete your member details, your device key and all device setups. Your scans are kept for attendance statistics, but each event's scans get their own random ID. They can be linked neither to you nor to each other across events. The IP check value and browser identifier are removed in the process.

Deleted data may remain in backups until those expire.

## Do you have to provide the data?

[Adjust to the statutes, e.g.: Attendance tracking is voluntary. Without the name and email address from Moodle, attendance cannot be recorded.]

There is no automated decision-making or profiling within the meaning of Art. 22 GDPR.

## Your rights

You have the right of access (Art. 15 GDPR), rectification (Art. 16), erasure (Art. 17), restriction of processing (Art. 18) and data portability (Art. 20). Where we rely on legitimate interests, you may object to the processing on grounds relating to your particular situation (Art. 21). To exercise these rights, contact [contact address].

You also have the right to lodge a complaint with the supervisory authority:
Austrian Data Protection Authority (Österreichische Datenschutzbehörde), Barichgasse 40–42, 1030 Vienna, dsb@dsb.gv.at, www.dsb.gv.at

Last updated: [date]
