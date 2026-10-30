# Self-hosted Jitsi Meet - local development

Runs a real self-hosted Jitsi Meet deployment on your own machine, for
developing and testing Lela's Meetings feature with no domain, no VPS, no
public IP, and no paid service of any kind. This vendors the actual
official [`jitsi/docker-jitsi-meet`](https://github.com/jitsi/docker-jitsi-meet)
project rather than reimplementing its Compose file by hand - that project
is large and env-var-heavy, and hand-duplicating it would drift from
upstream and risk subtle bugs. Lela's own `JITSI_*` env vars and the
`jitsi-session` API endpoint (see `docs/development/jitsi-integration.md`)
are identical whether this stack or the production one is running - the
business logic never changes, only which Jitsi deployment it points at.

## Setup (already done once on this machine - repeat on a fresh clone)

```bash
cd docker/jitsi/local
git clone --depth 1 https://github.com/jitsi/docker-jitsi-meet.git
cd docker-jitsi-meet
cp env.example .env
chmod +x gen-passwords.sh
./gen-passwords.sh          # the OFFICIAL script - fills in real random secrets
```

Then comment out the `CONFIG=~/.jitsi-meet-cfg` line near the top of the
generated `.env` and append the contents of `../lela-local-overrides.env`
(one directory up) to the bottom of it. Then create the config directories
the images expect:

```bash
mkdir -p .jitsi-meet-cfg/{web,web/custom-ca,storage/web,storage/transcripts,storage/prosody,tmp/web-load-test,prosody/config,prosody/prosody-plugins-custom,prosody/custom-ca,jicofo,jicofo/custom-ca,jvb,jvb/custom-ca}
```

Then start it:

```bash
cp ../../custom-interface_config.js .jitsi-meet-cfg/web/custom-interface_config.js
docker compose up -d
docker compose ps        # all 4 services (web, prosody, jicofo, jvb) should be Up
```

The shared `custom-interface_config.js` hides the clickable Jitsi logo. The
server configuration is required because Jitsi does not accept this branding
option through the iframe override whitelist. After changing this file, copy
it again and run `docker compose restart web` to apply it to newly opened rooms.

`docker-jitsi-meet/` and `.jitsi-meet-cfg/` are both gitignored (the clone
is vendored upstream code, not ours; the config directory holds generated
secrets/certs/state) - nothing here gets committed except this README and
`../lela-local-overrides.env`.

## Certificate setup (one manual step, required)

The browser's Secure Contexts rules would normally let plain HTTP on
`localhost` satisfy `getUserMedia` (camera/mic) with no certificate at
all - but that only helps a page's _own_ origin. The embedded Jitsi room
runs in its own iframe, and the official Jitsi IFrame API
(`external_api.js`) **unconditionally** builds that iframe's URL as
`https://${domain}/...` - there is no option to make it use plain HTTP.
So HTTPS is required for the Jitsi side specifically, even though Lela's
own `http://localhost:3000` stays plain HTTP throughout (loading an HTTPS
iframe from an HTTP page is fine - it's the opposite direction, HTTP
content inside an HTTPS page, that browsers block).

`lela-local-overrides.env` deliberately leaves `DISABLE_HTTPS` and
`ENABLE_LETSENCRYPT` unset - with both off, the official web image's own
entrypoint auto-generates a self-signed certificate (`CN=*`, valid for any
hostname) on first start and persists it. This is documented upstream
behavior for local/test use, not a workaround. The one consequence: a
self-signed cert is never silently trusted, so **before using Join
meeting in Lela, open `https://localhost:8443` directly in the same
browser profile once and accept the certificate warning** (Chrome:
"Your connection is not private" → Advanced → Proceed). That exception is
remembered for that origin in that browser profile, so Lela's own iframe
embed (served from a different origin, `http://localhost:3000`) will load
it without complaint afterward. If you skip this step, the Jitsi script/
iframe load fails silently with a certificate error, not an obvious one.

This stops working as described the moment you access this from anything
other than `localhost`/`127.0.0.1` - see "Testing from a second device"
below for what that actually requires.

## Connecting Lela to this local instance

In Lela's own `.env` (repo root, or `compose.yaml`'s `api` service):

```
JITSI_ENABLED=true
JITSI_DOMAIN=localhost:8443
```

Restart (or re-run `pnpm --filter @event-platform/api dev`, or restart the
`api` container if using `docker compose up` for Lela itself) so the API
picks up the new env. The Meetings feature will now mint real
`http://localhost:8000`-pointed sessions.

## Testing the actual workflow

**What you can fully test on this one machine, with two browser contexts
(no second device needed):**

1. Start Lela's own stack as usual (`docker compose up` from the repo
   root, or `pnpm dev`) and this Jitsi stack (above).
2. Sign in to Lela as one user in your normal browser window. Create an
   ONLINE or HYBRID meeting, inviting a second existing Lela user.
3. Open a **second, independent browser context** for the second user -
   e.g. a different browser entirely (Firefox alongside Chrome), or the
   same browser's "new window with a different profile" /
   incognito-plus-separate-profile combination. Plain incognito in the
   _same_ browser can still share some permission state with the normal
   window, so prefer a genuinely separate profile or a different browser
   if you see cross-tab interference. Sign in as the second user there.
4. In both contexts, open the meeting in Lela and click **Join meeting**.
   Each should independently load the room, prompt for camera/mic
   permission (grant it), and you should see/hear each other - this
   exercises the real Jitsi web UI, Prosody signaling, Jicofo focus, and
   JVB media relay end to end, all on loopback.
5. Try screen-share and muting from each side. Try **Leave meeting** from
   one side (confirm the other side is unaffected) and **End meeting for
   everyone** from the organizer's side (confirm the meeting leaves
   SCHEDULED status for both).

**Testing from a second physical device/browser on your LAN** (optional,
not required for most development):

The device-two origin would be `http://<your-machine's-LAN-IP>:8000`, which
is **not** a browser-trusted secure context by default - `getUserMedia`
will be blocked there even though the exact same setup works fine on
`localhost`. Two ways to actually get this working, pick one:

- **Quick, Chrome/Edge only, that device only:** on the second device, go
  to `chrome://flags/#unsafely-treat-insecure-origin-as-secure`, add
  `http://<host-LAN-IP>:8000`, relaunch the browser. This explicitly tells
  that browser to trust that one origin - a normal, documented workaround
  for exactly this LAN-testing scenario, not a system-wide weakening.
- **More realistic, a bit more setup:** install [mkcert](https://github.com/FiloSottile/mkcert)
  on the host, generate a cert for the host's LAN IP or a hostname you add
  to both devices' `hosts` files, set `DISABLE_HTTPS=0`, mount the mkcert
  cert/key into the `web` container in place of its self-signed one, and
  trust mkcert's local CA on the second device too.

This repository does not set either of these up automatically - they're
genuinely optional and only needed if you want to test with a true second
device rather than two browser contexts on one machine.

## What's actually been verified vs. what you need to test yourself

I (the agent) verified: all 4 containers start and report healthy, and the
web UI responds on `http://localhost:8000`. I have **not** clicked through
an actual camera/microphone prompt or confirmed two-way audio/video myself

- that requires a real browser granting real hardware permissions, which
  only you can do. Follow the "Testing the actual workflow" steps above and
  judge for yourself before considering audio/video confirmed working.

## Known limitations

- Same-origin loopback testing only, out of the box - see above for the
  second-device path.
- No JWT/moderator enforcement yet (see `docs/development/jitsi-integration.md`)
  - anyone who can get a `jitsi-session` from Lela's API can join; Lela's
    own authorization (organizer-or-participant check) is what actually
    gates that, not anything Jitsi-side.
- No recording - intentionally out of scope.
- `stable-11248` was the current release tag when this was set up; check
  https://github.com/jitsi/docker-jitsi-meet/releases for a newer one if
  you're setting this up later.
