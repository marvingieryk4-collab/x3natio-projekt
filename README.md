# X3 Nation — G3 Flash Tool

> Community-exclusive OTA firmware flasher for the Segway Ninebot G3.
> Access requires a verified Discord role (Level 5 Pilot, Tester, Donator, or Owner).

---

## Features

- **Discord OAuth2 Gate** — Role-based access control via Discord Implicit Grant flow
- **Mandatory Disclaimer** — Full-screen Haftungsausschluss gate on first visit (15-second read timer)
- **BLE OTA Flashing** — Web Bluetooth pipeline (flasher.js / NBC + Auth protocol)
- **Circular Flash Gauge** — Live progress ring with scooter graphic
- **Admin Watchdog** — Owner-only panel: login audit, security events, tester code management
- **Tester Code Gate** — Invite-only access via admin-generated codes
- **Collapsible Protocol Log** — Raw OTA session output, collapsed by default
- **Apple Liquid Glass UI** — Blurred glass surfaces, smooth tab transitions, clean sans-serif

## Access Tiers

| Tier | Access | UI |
|---|---|---|
| Owner | Full admin panel | Purple badge |
| Donator | Cockpit | Cyan badge |
| Tester | Cockpit | Emerald badge |
| Level 5 Pilot | Cockpit | Indigo badge |

## Deployment (GitHub Pages)

1. Push all files from this folder to a GitHub repository
2. Enable GitHub Pages → Source: main branch / root
3. Set the OAuth2 Redirect URI in your Discord application to `https://<user>.github.io/<repo>/`
4. No server required — all auth runs client-side via Implicit Grant

## Credits

OTA flash profiles and NBC session crypto by **N-SAK**.
BLE session implementation adapted from `cfw.kasai.rip`.
