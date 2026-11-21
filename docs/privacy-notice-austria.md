# Privacy Notice for Attendance Tracking

This notice explains which personal data [Name of the Verein] processes when recording attendance at its events, why, and for how long.

This is a translation of the German Datenschutzerklärung. If the two differ, the German version takes precedence.

## Controller

[Name of the Verein]
[Address]
ZVR number: [ZVR number]
Email: [contact address for data protection requests]

## Where the data comes from

Attendance tracking is reached through the Verein's Moodle course, which only active members can open. The data comes from these sources:

- **Moodle:** when you open the activity, Moodle passes your first name, last name, email address, Moodle user ID and login data such as your role and course.
- **Your device:** when you set up a device or scan a QR code, your browser sends your IP address, its identifier (user agent), a random browser ID (see [Storage on your device](#storage-on-your-device)) and, when setting up, the public device key. The app itself records the time and event of each scan.
- **You:** if scanning doesn't work for you and you confirm your attendance by hand, the first name, last name and email address you enter.

## What we process and why

**Member details:** first name, last name, email address, Moodle user ID, and when you first and last opened the app. We use them to attribute scans to you. Organizers need the email address to tell apart members with the same name.

**Attendance:** for every scan of the QR code, the event, the time, and how it was confirmed (a set-up device, a Moodle launch, being the organizer showing the code, or details entered by hand). Your first scan of an event counts as checking in, your last as checking out.

**Details entered by hand:** if you confirm your attendance by entering your name and email address, we store them as a separate entry, apart from your Moodle account, and note on your scans that they were entered by hand. We cannot verify that it was really you. Organizers can assign these scans to your Moodle account for each event; the entry you made is kept, so the assignment can be undone.

**Preventing abuse:** so nobody can scan for absent members, we store with every scan

- an irreversible check value (HMAC) of your IP address. The address itself is not stored. The value is computed differently for every event and only shows whether several scans at the same event came from the same address.
- your browser's identifier (user agent), which shows the device type, operating system and browser, including versions.
- an irreversible check value of your browser's random ID (see [Storage on your device](#storage-on-your-device)). The ID itself is not stored with the scan. Like the IP check value, it is computed differently for every event and only shows whether several people's attendance at the same event was confirmed from the same browser.
- for details entered by hand on a device that is set up for another member: which member's device it was.

We also record when you set up a device for scanning, with its browser identifier, so that unusual device changes stand out.

**Device key:** when you set up a browser by tapping "Set up this browser" on the page Moodle opens, your browser creates a key pair. The private key stays in your browser and cannot be read out, not even by us. We only store the public key. Nothing is set up without that tap.

**Viewing your own attendance:** the page Moodle opens shows your attendance. In a browser you set up, the app's start page shows it too, without Moodle. For that, your browser signs a one-time value that is valid for 5 minutes with the device key. Nothing is stored for this, and there is no login.

**Login data from Moodle:** on every launch from Moodle we store the login data it sends (including name, email address, role and course) for 24 hours, because the LTI library the app uses requires it for the login process.

## Storage on your device

The app only stores what it technically needs to work:

- the device key (see above) in your browser's storage (IndexedDB), once you tap "Set up this browser", until you clear the site data or set up another device
- after a scan, a cookie confirming for 10 minutes that you scanned a valid code
- after a scan, a cookie with a random browser ID, valid for 12 months and renewed with every scan, so that several people confirmed from one browser stand out (see [Preventing abuse](#what-we-process-and-why))
- if you confirm your attendance by hand, the name and email address you entered, in your browser's storage (localStorage), so you don't have to enter them again; until you clear the site data
- for organizers, a login cookie valid for 24 hours

There are no analytics or advertising cookies and no third-party services.

## Who sees the data

- **The Verein's organizers**, meaning whoever can open the admin tool in Moodle: all of the data above, for all events.
- **You:** your own attendance, for every event: when you scanned, how each scan was confirmed, and which scans count as checking in and out. Not the check values against abuse. Anyone using a browser you set up can see this too, so only set up a browser on a device that is yours.
- **People present at the event:** the screen showing the QR code displays a short name for every scan: your first name (only the first one, if you have several), and only if another member shares it, as many letters of your last name as needed to tell you apart (e.g. "Anna B."). If another person has exactly the same name, a number tells you apart instead (e.g. "Anna (2)"). Attendance confirmed by hand is marked with a symbol.
- **[Hosting provider, location]** as a processor running the server.

We do not pass data to any other third parties or transfer it to countries outside the EEA. [Adjust if the hosting provider is outside the EEA.]

## Legal basis

- Recording attendance: [Art. 6(1)(b) GDPR (membership relationship, § [x] of the statutes) or Art. 6(1)(f) GDPR (the Verein's legitimate interest in reliable attendance records)]
- Preventing abuse (IP and browser check values, browser identifier, device setups, the device used for details entered by hand): Art. 6(1)(f) GDPR, legitimate interest in tamper-proof attendance records
- Storage on your device: § 165(3) TKG 2021 (Austrian Telecommunications Act), as strictly necessary

## How long we keep data

| Data                                                                          | Retention                                                          |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Member details, device key                                                    | until your membership ends                                         |
| Details entered by hand                                                       | until your membership ends                                         |
| IP check value and browser identifier per scan                                | 12 months, at most until your membership ends                      |
| Browser check value per scan, and the device used for details entered by hand | 12 months, at most until your membership ends                      |
| Device setups                                                                 | 12 months, at most until your membership ends                      |
| Login data from Moodle                                                        | 24 hours                                                           |
| Scans (event, time)                                                           | kept in anonymised form after your membership ends, for statistics |
| Backups                                                                       | [x] days                                                           |

**Anonymisation:** when your membership ends, we delete your member details, your details entered by hand, your device key and all device setups. Your scans are kept for attendance statistics, but each event's scans get their own random ID. They can be linked neither to you nor to each other across events. The IP and browser check values and the browser identifier are removed in the process, and so is the note on other members' entries made by hand on your device.

Deleted data may remain in backups until those expire.

## Do you have to provide the data?

[Adjust to the statutes, e.g.: Attendance tracking is voluntary. Without the name and email address from Moodle, attendance cannot be recorded.]

There is no automated decision-making or profiling within the meaning of Art. 22 GDPR.

## Your rights

You have the right of access (Art. 15 GDPR), rectification (Art. 16), erasure (Art. 17), restriction of processing (Art. 18) and data portability (Art. 20). Where we rely on legitimate interests, you may object to the processing on grounds relating to your particular situation (Art. 21). To exercise these rights, contact [contact address]. You can also see your scans yourself in the app at any time (see [Who sees the data](#who-sees-the-data)).

You also have the right to lodge a complaint with the supervisory authority:
Austrian Data Protection Authority (Österreichische Datenschutzbehörde), Barichgasse 40–42, 1030 Vienna, dsb@dsb.gv.at, www.dsb.gv.at

Last updated: [date]
