# event-checkin

SvelteKit + Drizzle (SQLite) + ltijs.

## Setup

```sh
pnpm install
cp .env.example .env
```

Fill in `.env`:

- `DATABASE_URL` — SQLite file path, e.g. `local.db`
- `ORIGIN` — public origin, e.g. `http://localhost:5173` — no path, even under a sub-path (see [Serving under a sub-path](#serving-under-a-sub-path))
- `SIGNING_SECRET` — `openssl rand -base64 32`

Create the tables, then register the LMS's two tools (see [LTI platforms](#lti-platforms)):

```sh
pnpm db:push
pnpm lti:register-platform --url https://moodle.example.com --admin-client-id <id> --attendee-client-id <id>
pnpm dev            # or: pnpm dev:tailscale  (needs the tailscale CLI)
```

There are no accounts to create here. Organizers and guests alike come from the LMS:
whoever it lets open the admin tool is an organizer, and whoever it lets open the
attendee tool is a guest.

## Docker

```sh
cp .env.example .env      # fill it in, as above
docker compose build
docker compose run --rm tools pnpm db:push
docker compose run --rm tools pnpm lti:register-platform --url https://moodle.example.com --admin-client-id <id> --attendee-client-id <id>
docker compose up -d
```

The app listens on port 3000 in the container, published on the host's `HOST_PORT`
(3000 unless `.env` says otherwise). The SQLite file
lives on the `db` volume, so compose overrides `DATABASE_URL` to `/data/app.db` for
both services — the value in `.env` only applies outside Docker.

### Backups

`pnpm db:backup [dest]` snapshots the database through SQLite's `VACUUM INTO`, which
is consistent while the app is writing — a plain `cp` of a live database is not. It
refuses to write over an existing file. Without `dest` it writes next to the database
(`local.db.2026-09-11.bak`), which under Docker means the volume, where
`docker compose cp` can reach it:

```sh
docker compose run --rm tools pnpm db:backup
docker compose cp app:/data/app.db.2026-09-11.bak ./
```

`pnpm db:restore <backup>` puts one back. Stop the app first — restoring under a
running process leaves it holding a file that no longer exists:

```sh
docker compose stop app
docker compose cp ./app.db.2026-09-11.bak app:/data/restore-me.bak
docker compose run --rm tools pnpm db:restore /data/restore-me.bak
docker compose start app
```

The backup is checked (`pragma integrity_check`) before anything is overwritten, so a
truncated or unreadable file fails while the database it would have replaced is still
in place. The database being replaced is moved aside as
`<db>.<timestamp>.pre-restore.bak` rather than deleted, so restoring the wrong file
costs nothing but the confusion.

`docker compose down -v` deletes the `db` volume and everything in it. Without `-v` the
volume survives, and the next `up` finds the same database.

`tools` is the same image built one stage earlier, where the dev dependencies
(drizzle-kit, the Vite loader `pnpm lti:register-platform` runs on) still exist. It is
behind a compose profile, so `docker compose up` never starts it.

It runs as `node`, the same user the app runs as. Left as root it would create an
`app.db` the app can read but not write, and the only symptom is "Something went
wrong" on the first launch. On a volume created before that was fixed, repair the
ownership once:

```sh
docker compose run --rm --user root tools chown -R node:node /data
docker compose restart app
```

### Environment

Read from `.env` via `env_file`, and by `pnpm dev` outside Docker.

Most are read when the server **starts**: change them and restart, no rebuild. With
Docker that means `docker compose up -d`, which recreates the container with the new
`.env` (a plain `restart` keeps the old values). `BASE_PATH` is the exception: it is
compiled into the **build**, so changing it means `pnpm build` or
`docker compose build` first. `HOST_PORT` is compose's own and never reaches the app.

| Variable         | Required | Read at      | Notes                                                                                                                                                                                                                                                                         |
| ---------------- | -------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`   | yes      | start        | SQLite file path. Compose overrides it to `/data/app.db`                                                                                                                                                                                                                      |
| `ORIGIN`         | yes      | start        | Public origin: scheme, host, port — **never a path**, see [below](#serving-under-a-sub-path). adapter-node rejects cross-origin form posts without it, the check-in QR code points at it, and guests' phones need it on HTTPS (see [Setting up a phone](#setting-up-a-phone)) |
| `SIGNING_SECRET` | yes      | start        | Signs organizer sessions and the QR, presence and enrollment tokens. Changing it signs every organizer out and invalidates outstanding QR codes and setup links, not set-up phones                                                                                            |
| `BASE_PATH`      | no       | **build**    | Sub-path the app is served under, e.g. `/check-in`. See [below](#serving-under-a-sub-path)                                                                                                                                                                                    |
| `ADDRESS_HEADER` | no       | start        | Set to `x-forwarded-for` behind a reverse proxy, or `check_in.ip_address` records the proxy for everyone                                                                                                                                                                      |
| `PORT`           | no       | start        | Defaults to 3000. Set in the image, not in `.env`                                                                                                                                                                                                                             |
| `HOST_PORT`      | no       | compose `up` | Host port compose publishes the app on. Defaults to 3000                                                                                                                                                                                                                      |

Behind a reverse proxy, `ORIGIN` is the public HTTPS URL — not the container's.

### Serving under a sub-path

To serve the app at `https://example.com/check-in` while `/` is something else:

```sh
ORIGIN=https://example.com   # not https://example.com/check-in
BASE_PATH=/check-in
```

It's tempting to put the whole URL in `ORIGIN`. Don't: it is an _origin_, and the
path would be lost or break things, depending on who reads it. adapter-node quietly
drops it, so pages would still load and hide the mistake, while the check-in QR code
would point somewhere else. The app builds full URLs (the QR code) from `ORIGIN` plus
`BASE_PATH`.

`BASE_PATH` becomes SvelteKit's `paths.base`, which is compiled into the build: it
is read from the environment (or `.env`) when `pnpm build` runs, not when the server
starts. With Docker, compose passes it as a build arg, so change it and
`docker compose build` again. `pnpm dev` picks it up too, which is the quickest way
to try a sub-path locally.

The reverse proxy has to forward requests **with the prefix intact** —
`/check-in/admin` reaches the app as `/check-in/admin`, not `/admin`. Links, redirects,
cookie paths and the QR code all include it. The tool URLs become
`https://example.com/check-in/lti-link/…`.

## How guests get in

Guests have no password and never sign in, and there is no guest list. The course has a
check-in activity (an LTI 1.3 "external tool", the **attendee tool**): opening it proves
who someone is, through the LMS, and makes them a guest on the spot — anyone who can open
the activity can come in. The page it opens then offers two ways in:

- **Scan here:** at the door, they open the activity and scan the code with the camera
  inside that page. Nothing is stored on the phone, so it works in any browser, but
  they need Moodle every time (see [Scanning from the launched page](#scanning-from-the-launched-page)).
- **Link this phone:** they set the phone up once, and from then on scanning the code
  with the camera app is all it takes, for as long as the browser keeps what the setup
  stored (see [Setting up a phone](#setting-up-a-phone)).

1. Both tools are added to the LMS and registered here — see [LTI platforms](#lti-platforms).
2. An organizer opens the admin tool's activity, which signs them in (see
   [Organizers](#organizers)).
3. They open **Show the check-in code** and leave it on a screen at the door. The QR
   code **rotates every 30 seconds** and stays up indefinitely.

Everyone is created on their first launch of either tool, with the name and email the
LMS shares, and found again on every later one by their LMS account: `user.lti_subject`,
the launch's issuer and user ID (`iss` and `sub`). Not by email — a Moodle user may be
able to change theirs, and the ID never changes. The email is only shown in the log; two
accounts sharing one are two people here.

### Organizers

There is no list of organizers, and nothing to sign in with. An organizer is whoever the
LMS lets open the **admin tool**: its launch creates or finds them like any guest, then
signs them in to the admin pages instead of setting up a phone. The LTI roles claim is
ignored — which tool someone opened already says it, the same way on every platform.
So who is an organizer is managed entirely in the LMS: put the admin tool's activity
where only organizers can see it (see [LTI platforms](#lti-platforms)).

The launch can't set a session cookie itself: the LMS may open it in a frame on its own
page, where the cookie would be a third-party one. It sends the organizer to
`/lti-link/admin` with a signed, five-minute token in the URL fragment instead. Opened
top-level, that page trades it for the session straight away; in a frame, it offers
**Continue in a new tab** first, like the phone setup does.

The session is a signed cookie (`admin_session`) naming the organizer, good for **24
hours** and not renewed by use — a check-in screen left running overnight needs a fresh
launch in the morning. Nothing about it is stored, so the only way to end one early is
**Sign out** on that browser, or changing `SIGNING_SECRET`, which ends all of them.
Someone the LMS stops letting open the admin tool drops out when their current session
runs out.

The same person can be both: opening the admin tool signs them in as an organizer, and
opening the attendee tool on their phone sets that phone up for them as a guest.

## Setting up a phone

The guest opens the check-in activity in Moodle **on the phone they'll bring**. Moodle
launches the tool, vouching for who they are, and the tool finds or creates the guest
(see [How guests get in](#how-guests-get-in)) and sends them to `/lti-link/enroll`. There,
under **Link this phone**, they tap **Set up this phone**:

1. The browser makes an ECDSA P-256 key pair with WebCrypto, the private half
   **non-extractable** — scripts on the page can sign with it, but nothing can read it
   out, not even this app. It is kept in IndexedDB.
2. It sends the public half, signed with the private half, and the proof of the launch.
3. The server stores the public key against the guest (`device_key`), replacing any
   earlier one.

The proof of the launch is an enrollment token: HMAC-signed, naming the guest, and good
for 15 minutes. It travels in the URL **fragment**, which
browsers never send to a server, so it can't end up in a log or a `Referer`, and the page
takes it out of the address bar as soon as it loads. Setting up a key spends it: a token
issued before the guest's current key was set up is turned down.

### Things that undo it

The key lives in one browser on one phone. The guest has to open Moodle again if:

- they clear that browser's website data, or used a private window
- they set up another phone or browser — there is one key per guest, and the old one stops
  working
- **Safari deletes it.** WebKit clears script-writable storage, IndexedDB included, for a
  site the user hasn't visited in seven days. Setting up more than a week before the event
  may not survive on an iPhone. The setup page asks for persistent storage, but that does
  not switch this rule off. Ask guests to set up in the last few days, or plan for them
  redoing it.

The check-in page says so when it finds no key, and points to scanning from Moodle
instead. Redoing the setup takes a minute.

### Which browser

The key has to be in the browser that opens when the phone's camera reads a QR code —
usually Safari on an iPhone and Chrome on Android. That is often not the browser someone
uses Moodle in, which is why [scanning from the launched page](#scanning-from-the-launched-page)
exists: it needs no particular browser. For linking, two things get in the way:

- **Moodle embedding the tool.** Opened in a frame on Moodle's page, the tool's storage is
  partitioned under Moodle's site (all current browsers do this for third-party frames),
  so a key saved there is invisible to the tab a scan opens. The setup page detects the
  frame and offers a **Continue in a new tab** button, which sets the phone up in a tab
  of its own. Embedding works that way; opening the activity in a new window (see
  [LTI platforms](#lti-platforms)) just saves guests that one tap.
- **The Moodle app.** It opens external tools in its own browser view, whose storage
  isn't the phone's browser's. Guests should use Moodle in the phone's browser for this.

A laptop set up this way works, but nobody scans a QR code with one.

The key needs a **secure context**: `crypto.subtle` doesn't exist outside HTTPS, or
`localhost` exactly, so phones need `ORIGIN` on HTTPS. Setup can't be tried off
`localhost` without `tailscale serve` or a real certificate.

### Why device keys, not passkeys

Guests could set up a passkey at one point. That was removed:

- **Phone passkeys are synced.** A passkey made on an iPhone goes into iCloud Keychain,
  and on Android into Google Password Manager. Both always sync, and so do third-party
  managers like 1Password. There is no setting to keep one on the device only.
- **The site can't ask for a device-bound passkey.** WebAuthn has no option to require
  a passkey that isn't synced. The server only learns whether it is synced (the
  backup-eligible flag) after the guest has already used their face or fingerprint.
- **The flag can't be trusted anyway.** The authenticator reports it, and proving it
  would take attestation, which this app doesn't collect.

The device key does what a passkey was meant to: it stays in one browser. It is no more
provable than a passkey's flag (see [What stops abuse](#what-stops-abuse)), but it
doesn't sync, needs no biometric prompt at the door, and can't be copied off by accident.

## Checking in

The guest scans the code at the door. `/checkin` records that they saw a live code (the
presence cookie), then the page signs that scan with the device key and posts it straight
back — no tapping. The server checks the signature against the stored public key and
writes the check-in with `method = 'device'`.

What gets signed is `checkin:<scan id>`, the scan's own handle, so a signature is only good
for the scan it was made for, and the unique index collapses any replay of it. The
enrollment signs `enroll:<token>` — the prefixes keep a signature made for one from
passing for the other.

Organizers check in the same way, with a phone they set up through the attendee tool —
or not at all, and let the screen do it (below).

### Scanning from the launched page

A guest who didn't link a phone, or whose camera app opens a different browser than the
one they linked, opens the check-in activity at the door and taps **Scan the check-in
code**. The page opens the camera itself (`getUserMedia`, decoded with
[jsQR](https://www.npmjs.com/package/jsqr), loaded only then) and reads the code on the
screen. It takes the code out of the URL the QR code holds, without going there, and
posts it to the page's `scan` action together with the enrollment token from the launch.

The server checks both: the token says who Moodle vouched for in the last 15 minutes,
the code that they saw a live one. The check-in is written with `method = 'lti'`. The
token is not spent, since it expires on its own and a second scan with it is the same
guest either submitting twice or coming back in. Its `scan_id` is an HMAC of token and
code, so a double submit gets the same one and is collapsed, while two guests scanning
the same code get different ones.

Nothing is stored in the browser, so none of [Things that undo it](#things-that-undo-it)
applies, and a private window works. The page needs camera permission, and like a
device key, a secure context. If Moodle embeds the tool in a frame and its page doesn't
allow the camera, the page says so and offers **Continue in a new tab**.

The one catch is the 15 minutes: a page opened at home has expired by the time the
guest reaches the door, and the page tells them to open the activity again.

Every check-in puts a row in `check_in`. Re-entry is normal, so a guest may have several
rows. A double submit is not: the unique index on `(user_id, scan_id)` collapses
everything riding one scan into one row, while a later scan gets a row of its own.

The organizer showing the code gets checked in too. The first time a guest checks in
through their screen, a second row goes in for the admin, with `method = 'host'` and
the guest's `scan_id`, so the log shows the two side by side. It happens only if the
admin has no check-in yet. If they checked in themselves first, or an earlier guest
already did it for them, nothing is added.

The check-in screen shows how many are present, and not "of how many": with no guest
list, the app only knows who has opened the Moodle activity so far, which says nothing
about who is coming.

`host` means "this admin was signed in on the screen showing the code a guest just
scanned". It is weaker than `device`: nobody confirmed who was standing at
that screen, only that one signed in as the admin was showing the code at the door. A
screen left running, or signed in on someone else's laptop, checks the admin in all
the same.

### What stops abuse

Checking a guest in takes their phone — or rather, the key its browser made — or a
Moodle launch in the last 15 minutes, plus a code seen at the door in the last
half-minute. Setting up the key takes their Moodle login too, and a guest is their
Moodle account, not an email address: nobody can take a guest over by putting their
address on another Moodle profile.

What it does **not** stop:

- **A guest handing over their own check-in.** The server can't tell that a key was made
  non-extractable: WebCrypto has no attestation, so a guest who calls the enrollment
  endpoint by hand can register a key they generated themselves and pass it on. It takes
  deliberate effort, and there is still one key per guest, but it can't be prevented —
  the same is true of lending someone the phone. Likewise, a guest can copy the
  enrollment token out of the launched page and hand it on for its 15 minutes.
- **Checking in from elsewhere.** A photo of the code, sent to an absent guest within its
  30 seconds, checks them in from wherever they are. The address and user agent columns
  and the door screen are what catch this.
- **Anyone who can open the activity.** There is no list to be on: everyone in the
  course becomes a guest by opening it. So does anyone in a course the tool is added to,
  if it is added site-wide (see [Courses](#courses)).
- **Anyone who can open the admin tool.** The same goes for organizers, and they see
  every check-in there is (see [Courses](#courses)).

What catches the rest is the screen at the door. Every check-in shows up there as it
happens, as a toast with the guest's name, and the last five stay listed under the code.
A name appearing that doesn't belong to the person standing in front of the screen is
visible to everyone in the queue. The toasts come over server-sent events from
`/admin/checkins/stream`, fanned out in-process, so they reach screens on the same
server only.

`/admin/checkins` is the full log afterwards, newest first, with the two things worth
seeing at a glance flagged. `again` is a guest who had already checked in earlier;
`shared` is an address more than one guest checked in from. Neither is wrong on its own
— people step out for air, and a whole table shares one hotspot — but a code that leaked
looks like several guests on one address who never passed the door.

### What the QR code actually proves

A code is an HMAC of the current 30-second time bucket and the ID of the admin showing
it, derived from the clock rather than stored. The route recomputes it and accepts the current bucket and the previous
one, so a scan that crosses a rotation still works.

It is deliberately **multi-use**: everyone who scans during its window gets in, which is
the point of leaving it on screen. What it proves is that the scanner saw the check-in
screen within the last half-minute, nothing more. On a successful scan the guest gets a
signed presence cookie good for 10 minutes, so the code rotating while they confirm
costs them nothing. The cookie carries the admin's ID along, signed, so the check-in
knows whose screen it came through, and neither token can be moved to another admin.

The enrollment token from a Moodle launch is signed with the same secret but has a
prefix of its own, so neither token passes for the other —
`src/lib/server/scan-token.spec.ts` pins that down.

## LTI platforms

The app is two LTI 1.3 tools, run inside it by
[ltijs](https://www.npmjs.com/package/ltijs) rather than as a server of its own. Every
platform (LMS) it works with gets **both**, set up identically, each with a client ID of
its own:

- the **attendee tool**, whose launch sets up the guest's phone
  ([Setting up a phone](#setting-up-a-phone)), and
- the **admin tool**, whose launch signs an organizer in ([Organizers](#organizers)).

The pair is one registration, `lti_registration`: the platform's URL and the two client
IDs. A launch through a client ID that no pair names is turned away, even if ltijs knows
it. The steps below are for Moodle; any LMS that launches LTI 1.3 tools the same way
should work, given its own endpoints in `scripts/register-platform.ts`.

The routes live under `/lti-link`, the same for both tools:

| URL                        | What Moodle calls it                            |
| -------------------------- | ----------------------------------------------- |
| `<ORIGIN>/lti-link/launch` | Tool URL, and Redirection URI(s)                |
| `<ORIGIN>/lti-link/login`  | Initiate login URL                              |
| `<ORIGIN>/lti-link/keys`   | Public keyset URL (Public key type: Keyset URL) |

With a `BASE_PATH`, it goes between `ORIGIN` and `/lti-link`.

Do the following **twice**, once for each tool, with a name that says which is which
(say "Event check-in" and "Event check-in (organizers)"):

1. In the course, go to **More → LTI External tools → Add tool**
   (`/mod/lti/coursetools.php?id=<course id>`). If there's no button, the Moodle site's
   admins have to allow course-level tools or add them for you.
2. Fill in the URLs above, LTI version **LTI 1.3**, and under **Privacy** set both
   **Share launcher's name with tool** and **Share launcher's email with tool** to
   **Always** — people are created from them, and without them the launch ends on a
   page saying Moodle didn't share what it needs.
3. Optionally, set **Default launch container** to **New window**. Embedded in Moodle's
   page works too, but people have to tap "Continue in a new tab" first (see
   [Which browser](#which-browser)).
4. Save. Moodle then shows a **Client ID**.

Then register the pair here, telling it which client ID is which:

```sh
pnpm lti:register-platform --url https://moodle.example.com \
  --admin-client-id <admin tool's client id> --attendee-client-id <attendee tool's client id>
```

Finally, add each tool to the course as an activity:

- The attendee tool, visible to everyone. Something like **"Event check-in: set up your
  phone"** tells guests what it's for — to them it is just a link that opens a page with
  one button.
- The admin tool, **visible only to organizers.** This is the whole of access control:
  anyone who can open it is an organizer. Hiding the activity from students leaves it to
  those with the capability to see hidden activities (teachers, by default); Moodle's
  **Restrict access** can narrow it to a group of organizers instead.

`--url` is the Moodle site's base URL exactly as Moodle sends it as the issuer, with no
trailing slash. The script derives Moodle's auth, token and keyset endpoints from it.
If this server reaches Moodle somewhere else than browsers do (inside a container
network, say), `--internal-url` says where. Only the keyset and token endpoints are
fetched from there; browsers are still sent to `--url`.
Re-running it for a pair already registered does nothing; it refuses a client ID that is
already part of a different pair, and a pair whose two client IDs are the same — that
would make every guest an organizer.

### Courses

For now, the tools ignore which course a launch comes from. Everyone who opens the
attendee tool can set up a phone, and everyone who opens the admin tool is an organizer
for **everything**: every check-in code checks anyone in, and every organizer sees the
whole log. That is fine while the tools are in one course, and not beyond it:

- Added site-wide, or registered once and reused in several courses, the admin tool
  makes every teacher who can add it to their own course an organizer of every event.
- Two events in two courses share one log, one count and one set of door screens.

Every launch does say which course it came from: the `context` claim in the `id_token`,
whose `id` is Moodle's course ID (unique only together with `iss`). Scoping by course
would mean carrying it in the organizer's session and in the check-in code, and filing
each check-in under it.

### How it fits into SvelteKit

ltijs normally starts its own Express server. Here it gets an `HttpHandler` of ours
(`src/lib/server/lti/http-handler.ts`) that collects its routes, and
`src/routes/lti-link/[...path]/+server.ts` hands requests to it — one process, one port,
and `provider.listen()` is never called. Its storage is `DrizzleDatabaseManager`, on the
app's own better-sqlite3 connection and in the same database file: better-sqlite3 is
synchronous, so no two writes in the process can interleave, and other processes (the
seed and register scripts) wait on SQLite's lock as they already did. It shares the
backups and `db:push`. Its tables are the four `lti_*` ones; `lti_platform` holds the
tool's private RSA key for each platform, so treat backups accordingly.

Moodle posts the launch from its own origin, which SvelteKit's CSRF check turns away —
in production only, as `vite dev` skips the check, so it works locally and fails
deployed. SvelteKit can't exempt a single route, so the check is off in `vite.config.ts`
and done again in `src/hooks.server.ts`, identically, except for `/lti-link/login` and
`/lti-link/launch`. Those two are protected by ltijs itself: signed state, a single-use
nonce, and an id_token signed by the platform.

`ltijs` is in `dependencies`, not `devDependencies` like everything else: Vite bundles
dev dependencies into the build, and ltijs finds its HTML templates relative to its own
files.

`src/lib/server/lti/launch.spec.ts` runs whole launches of both tools against a fake Moodle.

## Test environment

`testenv/` runs a Moodle of the version TUWEL uses, with the app registered in it as
both tools and a course with an organizer and students, all in one compose project.
It only needs a reverse proxy for HTTPS in front. See [testenv/README.md](testenv/README.md).

## Commands

| Command                                          | What it does                                                                         |
| ------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `pnpm dev`                                       | Dev server                                                                           |
| `pnpm build` / `pnpm preview`                    | Production build (adapter-node) / preview it                                         |
| `pnpm check`                                     | `svelte-check`                                                                       |
| `pnpm lint` / `pnpm format`                      | Prettier + ESLint                                                                    |
| `pnpm test:unit` / `pnpm test:e2e` / `pnpm test` | Vitest / Playwright / both                                                           |
| `pnpm db:push`                                   | Apply the schema straight to the DB (no migration files)                             |
| `pnpm db:backup` / `pnpm db:restore`             | Snapshot the DB, and put a snapshot back (see [Backups](#backups))                   |
| `pnpm lti:register-platform`                     | Register a platform's admin and attendee tools (see [LTI platforms](#lti-platforms)) |
| `pnpm db:generate` / `pnpm db:migrate`           | Generate / apply migration files                                                     |
| `pnpm db:studio`                                 | Drizzle Studio                                                                       |

`pnpm lti:register-platform` runs through `scripts/run.js`, a five-line Vite SSR loader.
Node can't resolve SvelteKit's `$env/*` and `$lib/*` aliases on its own and SvelteKit
ships no script runner, so the script would otherwise need its own copy of the ltijs
setup.

Tests read `.env.test`, which points `DATABASE_URL` at a scratch database. Vite gives
`.env.test` precedence over `.env` in test mode, and `$env/dynamic/private` reads what
Vite loaded — so overriding `process.env` from inside a spec does **not** work.

## Schema notes

Besides the log, `device_key` (see [Setting up a phone](#setting-up-a-phone)), the tool
pairs in `lti_registration` and ltijs's `lti_*` tables (see [LTI platforms](#lti-platforms)),
there is `user`: everyone who has launched either tool. Its `lti_subject` — the LMS
account, `["<iss>","<sub>"]`, unique — is how every launch finds them.

Deliberately absent:

- No role on `user`, and no password, passkey or session tables — being an organizer is
  a matter of which tool someone opened, and their session a signed cookie that says so
  (see [Organizers](#organizers)).
- No summary or attendance table — the log page derives its counts from `check_in` on
  each load, and a stored total can only drift from the rows it claims to count.
- No guest list or invite table — a guest's `user` row is created by their first
  launch, and the `UNIQUE` constraint on `lti_subject` is the dedupe.
- No QR or enrollment-token table — both are signed and carry their own expiry (see
  above). An enrollment is spent by the key it sets up, through `device_key.created_at`.

### `check_in`

The one table that is ours. One row per check-in:

| Column                     | Why it's there                                                                                                                                                                                                             |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `user_id`, `checked_in_at` | who and when                                                                                                                                                                                                               |
| `method`                   | `device` (the phone's key), `lti` (a Moodle launch and a scan from its page) or `host` (see below), as verified server-side at that moment. `link` and `passkey` are from the removed `/setup` link and organizer passkeys |
| `ip_address`, `user_agent` | a code photographed and passed around shows up as check-ins from addresses that aren't the venue's                                                                                                                         |
| `scan_id`                  | a non-secret handle for one scan; one device working through borrowed accounts shows up as one `scan_id` across many users                                                                                                 |

`method = 'host'` marks the organizer who was signed in on the check-in screen, checked in
automatically when the first guest got in through their code. It has no `ip_address`
or `user_agent`, because the request that wrote it came from the guest's phone, and
it shares that guest's `scan_id`. See [Checking in](#checking-in) for what it does and
doesn't prove.

`ip_address` comes from `event.getClientAddress()`. Behind a reverse proxy that is the
proxy unless adapter-node is told otherwise — set `ADDRESS_HEADER=x-forwarded-for` (and
`XFF_DEPTH`) or the column records one address for the whole event.

## Upgrading from organizer passwords

Before the admin tool, organizers were a superadmin created by `pnpm db:seed` and the
guests it promoted, signing in with passwords and passkeys. None of that is left. To
move an existing database over (take a [backup](#backups) first):

1. Add the admin tool to Moodle and register it together with the existing tool, which
   becomes the attendee tool — the script leaves an already-registered client ID alone:

   ```sh
   pnpm lti:register-platform --url https://moodle.example.com \
     --admin-client-id <new tool's client id> --attendee-client-id <existing client id>
   ```

   Until then, launches of the existing tool are turned away: it is in no pair yet.

2. Remove what `pnpm db:push` can't decide for itself. Accounts with no LMS account
   linked — the superadmin, and guests seeded from a list before launches created them —
   can't exist any more; their check-ins go with them. Dropping the old auth tables here
   also keeps `db:push` from asking whether `lti_registration` is one of them renamed.

   ```sql
   -- Off by default in the sqlite3 CLI; without it the check-ins and keys stay behind.
   pragma foreign_keys = on;
   delete from user where lti_subject is null;
   drop table passkey;
   drop table account;
   drop table session;
   drop table verification;
   ```

3. `pnpm db:push`. It drops the old columns from `user`, which it confirms first.
   drizzle-kit 0.31 may then stop with `index user_lti_subject_unique already exists`
   after rebuilding the table: the rebuild is done, and running `pnpm db:push` once
   more finds nothing left to change.

Organizers then open the admin tool; their old accounts, if they ever launched the
check-in activity, are the ones they get.
