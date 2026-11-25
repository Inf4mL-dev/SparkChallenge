# Rescue Renewals

**Scan, identify and renew.**

A demo web app for renewing a motor insurance policy from a QR code. A client scans a QR code, confirms their Ghana Card and phone number, corrects one record discrepancy, pays, and downloads a new sticker, certificate and brown card certificate. Everything behind the screens (identity check, policy lookup, payment, SMS, WhatsApp, email) is **simulated**: no real services are called and all data is demo data.

It is a static website: plain HTML, CSS and JavaScript modules. No build step, no framework, no backend.

## Run it

**Locally**

```bash
python3 -m http.server 8000
```

Open <http://localhost:8000/?demo=1>. The `?demo=1` flag adds the demo panel and the presenter controls.

**On GitHub Pages**

1. Put the contents of this folder at the root of a repository (so `index.html` is at the top level).
2. In the repository go to Settings, Pages, and choose "Deploy from a branch", branch `main`, folder `/ (root)`.
3. Open `https://<user>.github.io/<repo>/?demo=1`.

All paths are relative, so it works under a repository sub-path. Pages serves over HTTPS, which phones need for camera scanning.

**Internet needed.** `index.html` loads two libraries from cdnjs (jsPDF 2.5.1 and qrcode-generator 1.4.4). If the venue connection is unreliable, download both files into `js/vendor/` and change the two `<script>` tags in `index.html` to point at them.

## Demo clients

| Client | Ghana Card | Phone | What it shows |
| --- | --- | --- | --- |
| Kwame Mensah | `GHA-123456789-0` | `0240000001` | Main demo. Four policies; the Corolla is highlighted. Colour discrepancy (White on policy, Silver in registry). Total GH₵1,279.00 |
| Yaw Boateng | `GHA-456123789-3` | `0550000003` | Vehicle use discrepancy that changes the premium from GH₵1,079.00 to GH₵1,579.00 |
| Abena Owusu | `GHA-987654321-5` | `0200000002` | Failed identity verification |

All demo data lives in `data/seed.json`. Policy expiry dates are stored as days from today, so the demo stays valid on any date. Edit names, plates, card numbers and premiums there.

## The journey

| # | Step | Route |
| --- | --- | --- |
| 1 | Scan QR, enter Ghana Card and phone number | `#/` |
| 2 to 3 | Identity check and policy lookup run together | `#/verifying` |
| 4 to 5 | Policy list, most likely renewal highlighted | `#/policies` |
| 6 | Review the policy and correct the discrepancy | `#/review` |
| 7 to 8 | Renewal summary and simulated mobile money payment | `#/pay` |
| 9 | Processing countdown, 2 to 3 minutes (random per renewal) | `#/processing` |
| 10 to 11 | Download sticker, certificate, brown card; SMS; share by WhatsApp or email | `#/documents` |

Other pages: `#/doc/<token>` (public document verification), `#/admin` (back office), `#/qr` (QR code generator), `#/messages` (simulated SMS, WhatsApp and email viewer).

## Presenter controls

Open any page with `?demo=1` and tap **Demo panel** (bottom right):

- **Reset demo** clears all renewals, messages and audit events and returns to the start.
- **Skip countdown** jumps the countdown to 10 seconds. A "Skip countdown" button also appears on the processing screen in demo mode.
- **Fail next payment** makes the next payment fail once, to show the retry path.
- **Fill demo client** types Kwame's details into the landing form.
- Shortcuts to the back office, message viewer and QR generator.

## Project structure

```
index.html              App shell, loads CSS and the two CDN libraries
js/theme.js           Dark mode toggle (saved in this browser; follows the device until chosen)
favicon.svg, 404.html   Tab icon and a branded not-found page (GitHub Pages serves it with a real 404)
css/
  base.css              Design tokens, shared components, header, demo panel
  flow-a.css            Landing, verifying, policies, review screens
  flow-b.css            Payment, processing, documents screens
  extras.css            Verification page, back office, QR generator, messages, print rules
data/
  seed.json             All demo data and settings (clients, vehicles, policies, delays, rates)
js/
  main.js               Boot, app header, demo panel
  router.js             Hash router, route guards, error screen
  state.js              Persistent state store and storage helpers
  config.js             Loads seed.json
  services.js           All simulated back end: verification, lookup, ranking, premium, payment, issuing, tokens, audit
  ui.js                 DOM helper, formatters, icons, status lines, toasts
  documents.js          PDF generation: sticker, certificate, brown card
  screens/
    landing.js verifying.js policies.js review.js        steps 1 to 6
    pay.js processing.js documents.js                    steps 7 to 11
    verify-doc.js admin.js qr-generator.js messages.js   supporting pages
.nojekyll               Stops GitHub Pages from running Jekyll
```

## How it works

- **Routing.** Hash routes (`#/policies`). Each screen module exports `render(root, ctx)`. The router blocks a screen if its earlier steps are not done and sends the client back to `#/`.
- **State.** Journey progress is saved in `localStorage` so a refresh does not lose it. The countdown is calculated from timestamps, so refreshing never restarts it.
- **Most likely renewal.** Policies expiring within 30 days, or lapsed within 90 days, rank first (nearest to today first). Cancelled policies are greyed out and cannot be selected.
- **Premium.** Base premium, times the vehicle-use multiplier when the use is corrected, plus the flat GH₵79 sticker fee. Settings are in `data/seed.json`.
- **Verification QR.** Each document QR carries a signed token that contains the policy details, so `#/doc/<token>` verifies on any device with no server. Tokens are signed with a demo secret in `services.js`; this is for demonstration, not real security.
- **Back office.** Reads the same browser storage as the client flow, so it updates live when open in a second tab of the **same browser**. It does not sync between different devices.

## Printing QR codes for the sticker and flyer

Open `#/qr`, choose the source (sticker, flyer, agent card, poster), optionally an agent ID, and set the Base URL to the address the phone will open (your GitHub Pages address, or the laptop's network address if running locally, for example `http://192.168.1.20:8000/`). Use **Print sheet** for a page of codes or **Download PNG**.

## Replacing the generated documents with the real templates

The three PDFs are drawn in code in `js/documents.js` (`sticker`, `certificate`, `brownCard`). To use the real documents, supply the blank templates and `js/documents.js` is changed to place the live values (policy number, plate, dates, QR code and so on) onto them. The public API (`generateDocument`, `generateAll`, `downloadDocument`) stays the same, so no other file changes.

## Known limits

- No real payment, SMS, WhatsApp, email, identity or registry integration.
- PDF layouts were verified for wiring only in a test browser; check the three PDFs and the QR scanning on a real phone before the demo.
- Data is per browser. Use **Reset demo** between runs.

## Design system (rules applied)

- **Tokens.** `css/base.css` holds light and dark theme tokens (`--bg`, `--surface`, `--line`, `--text-1/2/3`, `--accent`, semantic `--ok/--err/--warn`, spacing `--sp-*`, radius `--r-*`, motion `--dur-*`). The older `--c-*` variables are kept unchanged but no longer used. The theme follows the device setting.
- **Colour.** Three text tiers and one accent. The accent marks actions, the price and the focus ring only.
- **Spacing and radius.** 8pt grid. Radii 24 / 16 / 8.
- **Shared components.** `ui.js`: validated fields (check on blur, live after an error, success tick), native `<dialog>` and confirm dialog, button loading state, toast with icon, page title, progress stepper.
- **Commission.** `js/commission.js` follows the EIC agent rules (motor: Third Party 7.5%, Comprehensive 12.5% after the GH₵79 sticker fee, less 10% commission tax), in integer pesewas, rounded only for display. It uses the total premium paid, which already includes the sticker fee, so the fee is deducted exactly once.
- **Not applied** (no matching feature in this app): search box, notification count badges, carousels, PHP security patching, Get support dialog (needs the support email and WhatsApp details).

## Demo data notes

- All policy expiry dates are 3 to 6 months in the past (stored as negative `expiryOffsetDays`), so every policy shows as lapsed. `ranking.lapsedWithinDays` is 180 so the nearest lapsed policy is still highlighted as the likely renewal.
- Record differences vary by vehicle: colour (Corolla), chassis number (CR-V), year of manufacture (Elantra), vehicle use (Kia Rio, changes the premium).
- Font: Kawak. See `fonts/README.md` for where the files go.
