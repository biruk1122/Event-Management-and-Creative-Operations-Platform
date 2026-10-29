# Self-hosted Jitsi Meet - production deployment

A self-hosted [Jitsi Meet](https://jitsi.org/) deployment for Lela's in-app
video conferencing, on a VPS you control. This vendors the actual official
[`jitsi/docker-jitsi-meet`](https://github.com/jitsi/docker-jitsi-meet)
project (its own Compose file, env vars, and `gen-passwords.sh` script)
rather than reimplementing it by hand - that project is large and
env-var-heavy, and hand-duplicating it would drift from upstream. See
`../local/README.md` for the local-development counterpart of this same
setup; Lela's own `JITSI_*` env vars and the `jitsi-session` API endpoint
(`docs/development/jitsi-integration.md`) are identical either way - only
which deployment they point at changes.

This is an **independent Compose project** - never merged into the root
`compose.yaml`, never a dependency of the Lela application's own
containers.

## Setup

```bash
cd docker/jitsi/production
git clone --depth 1 https://github.com/jitsi/docker-jitsi-meet.git
cd docker-jitsi-meet
cp env.example .env
chmod +x gen-passwords.sh
./gen-passwords.sh          # the official script - fills in real random secrets
```

Comment out the `CONFIG=~/.jitsi-meet-cfg` line near the top of the
generated `.env`, append `../lela-production-overrides.env`'s contents to
the bottom (after filling in its placeholders - real domain, real VPS IP),
create the config directories (same list as `../local/README.md`'s setup
step), then:

```bash
cp ../../custom-interface_config.js .jitsi-meet-cfg/web/custom-interface_config.js
docker compose up -d
docker compose ps        # all 4 services should be Up
```

The shared `custom-interface_config.js` hides the clickable Jitsi logo; this
branding option must be configured on the server. After updating it, copy it
again and run `docker compose restart web` to apply it to newly opened rooms.

`docker-jitsi-meet/` and `.jitsi-meet-cfg/` are both gitignored (vendored
upstream code and generated secrets/state respectively) - nothing here
gets committed except this README and `../lela-production-overrides.env`.

## Running behind the shared reverse proxy

This stack is meant to run **behind** the shared reverse proxy in
`docker/reverse-proxy/` - see that directory's own README. This stack's
`web` container never binds host port 80/443 itself
(`DISABLE_HTTPS=1`); the reverse proxy terminates TLS for the Jitsi domain
and forwards to it over the shared `lela-edge` Docker network. Join that
network from the cloned repo's `docker-compose.yml` (add `edge:` alongside
its own `meet.jitsi:` network on the `web` service, and `name: lela-edge`

- `external: true` to a new top-level `edge:` network entry) and give that
  service an explicit `container_name: jitsi-web` so it resolves
  unambiguously on the shared network (two different Compose projects both
  naming a service plain `web` would otherwise register two conflicting
  aliases on it).

## Why Lela's API needs no server-to-server call to this stack

The Lela API only computes a room name (`lela-{meetingId}`) and a display
name locally - it never calls out to this Jitsi deployment. The browser
talks to Jitsi directly, over `JITSI_DOMAIN`, once the API has returned
that room-join information. No shared database, no shared secret, and no
network path between the Lela API container and this stack is required for
the MVP (anonymous-mode) configuration. This only changes if the optional
JWT/moderator scheme (see below) is enabled later, which needs the API and
this stack to agree on `JWT_APP_ID`/`JWT_APP_SECRET`.

## Ports and firewall

| Port               | Protocol | Bound by                                       | Purpose                                                                                                                                             |
| ------------------ | -------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 10000 (`JVB_PORT`) | UDP      | `jvb` (direct host mapping)                    | **Mandatory** - media relay. Most restrictive firewalls/NAT setups need an explicit allow rule for this; some cloud providers block UDP by default. |
| 80, 443            | TCP      | the shared reverse proxy only (not this stack) | TLS termination and routing to this stack's internal `web` container.                                                                               |

`JICOFO_REST_PORT` (8888) and `JVB_COLIBRI_PORT` (8080) are bound by the
upstream Compose file to `127.0.0.1` only, by design - never exposed
beyond the host itself. `prosody` and `jicofo` otherwise stay on the
internal `meet.jitsi` network only.

## DNS and TLS

The Jitsi domain needs its own DNS A/AAAA record pointed at the VPS,
distinct from Lela's own application domain. TLS for it is terminated by
the shared reverse proxy, not by this stack - that is why `DISABLE_HTTPS=1`
is set in `lela-production-overrides.env`.

## Resource usage

Video meetings compete with Lela's own containers for CPU and RAM on a
shared VPS - `jvb` in particular, since its cost scales with concurrent
participants and video usage. Start with `docker stats` for basic ad hoc
monitoring once this is running; a heavier observability stack
(cAdvisor/Prometheus/Grafana) is an optional future addition, not something
this deployment sets up. Size the VPS for the ~5-10 concurrent participants
per meeting this integration targets initially, and re-check real usage
before raising that target.

## JWT / moderator authentication (not enabled yet)

This repository's Jitsi integration ships without JWT-based authentication:
the Lela API's own join-info endpoint (`GET /meetings/:id/jitsi-session`)
is the real authorization boundary - it only returns room-join information
to a meeting's organizer or an invited participant, regardless of how
guessable the room name is. JWT would add a true Jitsi-side moderator role
and defense-in-depth, but requires a live Jitsi server to test against, so
it is documented as a reserved, disabled-by-default follow-on rather than
shipped unverified. See `docs/development/jitsi-integration.md` for the
full rationale.

## Not included

Recording (Jibri) is intentionally not part of this deployment - the task
this was built for explicitly scoped it out while keeping the architecture
extensible enough to add later.
