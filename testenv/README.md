# Test environment

A throwaway Moodle with the attendance tool registered in it as both LTI tools,
all in one compose project. Nothing to click through in Moodle: on its first
start it installs itself and sets up a course the way the main README tells an
organizer to.

| Service  | What it is                                                                                                                                                |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `moodle` | Moodle **5.2**, the release TUWEL runs, on `moodlehq/moodle-php-apache:8.3`                                                                               |
| `db`     | PostgreSQL 16 for Moodle                                                                                                                                  |
| `app`    | The attendance tool, built from this repository. Pushes its schema and registers the test Moodle's tools with `pnpm lti:register-platform` on every start |

TUWEL's version was matched by its `admin/environment.xml`, which is identical
to the one on Moodle's `MOODLE_502_STABLE` branch. If TUWEL moves on, change
`MOODLE_BRANCH` (see `.env.example`) and rebuild.

## What you provide: HTTPS

Both Moodle and the app need a public HTTPS URL. LTI launches go through the
browser, which needs both origins on HTTPS. The phones' device keys need
WebCrypto, which browsers only allow over HTTPS. So a reverse proxy of your own
terminates TLS for two hostnames and forwards to the ports the stack publishes:

| Hostname      | Forwards to                         |
| ------------- | ----------------------------------- |
| `MOODLE_HOST` | `MOODLE_BIND_IP`:`MOODLE_HOST_PORT` |
| `APP_HOST`    | `APP_BIND_IP`:`APP_HOST_PORT`       |

The proxy has to **pass the `Host` header through unchanged** (Moodle turns
away any other hostname than its own) and should set `X-Forwarded-For` (the
scan log records addresses from it). Caddy does both by default:

```caddy
moodle.example.com {
	reverse_proxy 127.0.0.1:8080
}
attendance.example.com {
	reverse_proxy 127.0.0.1:3000
}
```

With nginx, add `proxy_set_header Host $host;` and
`proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`.

Nothing else has to reach anything through the proxy. The one server-to-server
request, the app fetching Moodle's signing keys, stays inside the compose
network: the `moodle` container answers to `MOODLE_HOST` there, over plain
http (`--internal-url` in `app-start.sh`).

## Start it

```sh
cp testenv/.env.example testenv/.env   # set MOODLE_HOST, APP_HOST, and where to bind
podman compose -f testenv/compose.yml up -d --build
podman compose -f testenv/compose.yml logs -f moodle   # until "testenv: Moodle is ready"
```

`docker compose` should work the same way (only Podman was tried). The first start installs Moodle, which
takes a minute or so (plus the image builds); later starts only reapply the setup.

## What you get

A course (`ATTENDANCE`) with an activity for each tool. Their names follow
`TESTENV_LOCALE` (`de` unless `.env` says otherwise):

|                                               | `de`                                      | `en`                                 |
| --------------------------------------------- | ----------------------------------------- | ------------------------------------ |
| Course                                        | Anwesenheit (Test)                        | Attendance (test)                    |
| Attendee tool's activity, visible to everyone | Anwesenheits-QR-Code scannen              | Scan attendance QR code              |
| Admin tool's activity, hidden from students   | Anwesenheitstool Admin (QR-Code anzeigen) | Attendance tool admin (show QR code) |

Changing `TESTENV_LOCALE` renames them on the next start of `moodle`. Only these
names: Moodle's own interface stays English.

Moodle's guided tours of its interface are switched off, on every start.

Both tools are course tools with the privacy settings the app needs, opening
in a new window. Their client IDs are fixed (`attendance-admin`,
`attendance-attendee`), so the app registers them without reading anything back.

| Moodle user    | Role in the course | In the app                                     |
| -------------- | ------------------ | ---------------------------------------------- |
| `organizer`    | Teacher            | Organizer (sees the hidden organizer activity) |
| `student1`–`3` | Student            | Attendees                                      |
| `admin`        | Site admin         | Not enrolled; Moodle's own administration      |

The test users' password is `Moodle-Test-1`, `admin`'s is `Admin-Test-1`, unless
`.env` says otherwise.

To try it: sign in to Moodle as `organizer`, open the organizer activity and
**Show the attendance QR code**. Then, on a phone, sign in as a student and open the
attendee activity. Either tap **Scan the attendance QR code** and scan the screen from
that page, or set the phone up and scan the code with the camera app.

Scanning from the page stores nothing, so trying several students on one phone
only takes a private tab per student (or signing out of Moodle in between). A
linked phone belongs to one student at a time: linking it again for another
takes it over.

## Made-up data

With `TESTENV_SEED` set in `.env` (any number), the app's database starts out with
half a year of made-up use: 80 attendees and 3 organizers, 31 events with their scans,
phone setups, details typed in by hand and linked, and a few attendees deleted (see
"Data to develop against" in the main README). Events span the six months before the day
it's seeded and the four weeks after, and one of them is that evening, so the
organizer's code screen suggests it.

It only seeds a database that isn't there yet: on the app's first start, or after
starting over. The test users are not among the made-up people. They appear
next to them once they open a tool, as on any other platform. The made-up
people come from a platform URL of their own, so no login is ever mistaken
for one of them.

To seed again, or for the first time, without losing Moodle, delete only the
app's volume:

```sh
podman compose -f testenv/compose.yml down              # containers only; data stays
podman volume rm attendance-testenv_appdata             # the app's database
podman compose -f testenv/compose.yml up -d
```

The seed is applied with the image's dependencies, so rebuild (`up -d --build app`)
if the image is older than the seeder.

## Changing things

- **Setup:** `moodle/testenv_setup.php` runs on every start of `moodle`. It
  updates what it finds (the tools' URLs follow `APP_HOST` and `BASE_PATH`), and
  creates what's missing. Edit it and `up -d --build moodle`.
- **The app:** `up -d --build app` after changing the code.
- **Hostnames:** starting over is the reliable way (below). Both sides keep URLs
  in their databases.
- **Start over:** `podman compose -f testenv/compose.yml down -v` deletes Moodle,
  its database and the app's database. With `TESTENV_SEED` set, the next start
  seeds the app's database anew (see [Made-up data](#made-up-data)).

The app runs from the image's `build` stage rather than the production one:
`app-start.sh` needs drizzle-kit and the script loader, which the production
image leaves out. It is the same built app either way.

## Developing against it

`compose.dev.yml` swaps the built app for Vite's dev server, running on the
source in this checkout. Edits under `src/`, `static/`, `messages/` and
`scripts/` show up right away, with hot reload through your proxy as well:

```sh
podman compose -f testenv/compose.yml -f testenv/compose.dev.yml up -d --build
podman compose -f testenv/compose.yml -f testenv/compose.dev.yml logs -f app
```

- **Same database** as the built app (volume `appdata`): the dev server runs
  as the image's `node` user, just like the built one.
- **Paraglide's output stays in the container.** It compiles `messages/` into
  `src/lib/paraglide`, which a volume of its own keeps out of the bind mount,
  so the dev server only reads your checkout and never writes to it.
- **Rebuild for everything else:** `package.json`, `vite.config.ts`, the
  `drizzle` config and the like come from the image, as does `node_modules`.
  `up -d --build app` with both files after changing them. After a schema
  change, restart `app` so `app-start.sh` pushes it.
- **Client addresses:** the scan log gets the same address for every scan. Say
  a phone at `203.0.113.7` scans. Its request reaches the app through your
  proxy and Podman's port forwarding, so the connection the app sees comes
  from that forwarding, with rootless Podman from the container's own address
  (e.g. `10.89.3.3`). `203.0.113.7` only survives in the `X-Forwarded-For`
  header the proxy adds. The built app reads that header, because
  `ADDRESS_HEADER` (an adapter-node setting) tells it to. The dev server
  doesn't know that setting and logs `10.89.3.3`.
- **Caching:** the dev server tells browsers which files they may keep, and
  nothing between them may change that. A proxy or CDN that caches
  responses, or rewrites `Cache-Control` with a lifetime of its own, leaves
  browsers with files from before the dev server last re-bundled its
  dependencies. A page then loads two copies of Svelte and fails to
  hydrate (`Cannot read properties of undefined (reading 'call')`) until
  the browser's cache is emptied; a hard reload isn't enough. With
  Cloudflare, add a Cache Rule for `APP_HOST`: bypass the cache, and leave
  the browser TTL to the origin. The built app doesn't need this.
- **Switching** between the two: `up -d` with the other set of files.
  podman-compose recreates every container for it, Moodle's too, but the
  volumes and with them all data stay.
