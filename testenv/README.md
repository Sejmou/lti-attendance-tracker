# Test environment

A throwaway Moodle with the check-in app registered in it as both LTI tools,
all in one compose project. Nothing to click through in Moodle: on its first
start it installs itself and sets up a course the way the main README tells an
organizer to.

| Service  | What it is                                                                                                                                             |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `moodle` | Moodle **5.2**, the release TUWEL runs, on `moodlehq/moodle-php-apache:8.3`                                                                            |
| `db`     | PostgreSQL 16 for Moodle                                                                                                                               |
| `app`    | The check-in app, built from this repository. Pushes its schema and registers the test Moodle's tools with `pnpm lti:register-platform` on every start |

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
check-in log records addresses from it). Caddy does both by default:

```caddy
moodle.example.com {
	reverse_proxy 127.0.0.1:8080
}
checkin.example.com {
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

A course **Event check-in (test)** (`CHECKIN`) with:

- **Event check-in: set up your phone**, launching the attendee tool, visible to everyone.
- **Event check-in: organizer screen**, launching the admin tool, hidden from students.

Both tools are course tools with the privacy settings the app needs, opening
in a new window. Their client IDs are fixed (`checkin-admin`,
`checkin-attendee`), so the app registers them without reading anything back.

| Moodle user    | Role in the course | In the app                                     |
| -------------- | ------------------ | ---------------------------------------------- |
| `organizer`    | Teacher            | Organizer (sees the hidden organizer activity) |
| `student1`–`3` | Student            | Guests                                         |
| `admin`        | Site admin         | Not enrolled; Moodle's own administration      |

The test users' password is `Moodle-Test-1`, `admin`'s is `Admin-Test-1`, unless
`.env` says otherwise.

To try it: sign in to Moodle as `organizer`, open the organizer activity and
**Show the check-in code**. Then, on a phone, sign in as a student, open the
set-up activity, set the phone up, and scan the code.

## Changing things

- **Setup:** `moodle/testenv_setup.php` runs on every start of `moodle`. It
  updates what it finds (the tools' URLs follow `APP_HOST` and `BASE_PATH`), and
  creates what's missing. Edit it and `up -d --build moodle`.
- **The app:** `up -d --build app` after changing the code.
- **Hostnames:** starting over is the reliable way (below). Both sides keep URLs
  in their databases.
- **Start over:** `podman compose -f testenv/compose.yml down -v` deletes Moodle,
  its database and the app's database.

The app runs from the image's `build` stage rather than the production one:
`app-start.sh` needs drizzle-kit and the script loader, which the production
image leaves out. It is the same built app either way.
