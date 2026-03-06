# Babette Winkel – Winkelbeheer

Next.js-app voor winkeloperaties bij Babette: voorraad, prijslabels, cadeaubonnen, webshoporders en afvalregistratie.

## Functies

- **Voorraad opzoeken** – Scan barcodes of zoek op naam; bekijk voorraad per variant (maat, kleur, afbeeldingen).
- **Labels afdrukken** – Prijslabels voor producten: Zebra ZD421 (51×25 mm, ZPL) of Dymo (62×29 mm). Scan of zoek producten, stel overrides in, print direct naar Zebra (via ZPL-bridge) of via browser.
- **Label test (Zebra-label debug)** – Ontwerp en test Zebra-labels: bewerk inhoud en typografie (lettergrootte, regelafstand, marge boven/links) zoals in Word, live preview, ZPL-bestand laden, direct printen naar Zebra. Werkt vanaf elk apparaat via `/api/print-zpl`.
- **Webshoporders beheren** – Orders bekijken, bevestigen, verzenddocumenten en facturen downloaden.
- **Cadeaubon aanmaken** – Cadeaubonnen aanmaken met printbare labels (Zebra of Dymo).
- **Afval** – Afvalregistratie.

## Getting started

### Vereisten

- Node.js 18+
- Toegang tot Odoo (API-credentials)
- npm

### Installatie

1. **Dependencies installeren**
   ```bash
   npm install
   ```

2. **Environment**
   ```bash
   cp env.example .env.local
   ```
   Vul in `.env.local` o.a. in:
   - `ODOO_URL`, `ODOO_DB`, `ODOO_USERNAME`, `ODOO_API_KEY`
   - `SESSION_SECRET` (willekeurige string)

3. **Dev-server starten**
   ```bash
   npm run dev
   ```
   App draait op **poort 3001**: [http://localhost:3001](http://localhost:3001)

4. **Inloggen** – Ga naar de app en log in met je Odoo-gegevens.

## Pagina’s

| Pagina | Pad | Beschrijving |
|--------|-----|--------------|
| Voorraad opzoeken | `/voorraad-opzoeken` | Barcode scannen of zoeken, voorraad en varianten bekijken |
| Labels | `/labels-afdrukken` | Productlabels printen (Zebra of Dymo), scan/zoek, overrides |
| Label test | `/labels-debug` | Zebra-label ontwerpen: inhoud, typografie, ZPL laden, preview, printen |
| Webshoporders | `/webshoporders-beheren` | Orders bevestigen, facturen en verzendlabels downloaden |
| Cadeaubon | `/cadeaubon-aanmaken` | Cadeaubonnen aanmaken en label printen |
| Afval | `/afval` | Afval registreren |

## Zebra ZD421 (prijslabels)

Labels zijn 51×25 mm (2×1 inch, 203 dpi). ZPL wordt gegenereerd in `lib/zpl-labels.ts`; typografie (marges, lettergroottes, regelafstand) is instelbaar via **Label test** en standaard in `DEFAULT_LABEL_OPTIONS`.

### Printer instellen (Mac)

Zie **[scripts/README-Zebra-printer.md](scripts/README-Zebra-printer.md)** voor:
- Juiste printernaam (`Zebra_Technologies_ZTC_ZD421_203dpi_ZPL` of `ZEBRA_PRINTER` in de bridge)
- Formaat 50,8×25,4 mm, 203 dpi, Mark sensing, Direct Thermal

### ZPL-bridge (direct printen)

Voor **direct** printen naar de Zebra moet de ZPL-bridge draaien op de **server** (de machine waar Next.js draait). De app stuurt ZPL via `/api/print-zpl`; de server stuurt die door naar `http://127.0.0.1:9333/print` (of `ZPL_BRIDGE_URL` in `.env`).

1. **Handmatig** (in de projectmap):
   ```bash
   npm run print-zebra
   ```

2. **Altijd aan** (Mac, na login):
   ```bash
   ./scripts/install-print-zebra-bridge-service.sh
   ```
   - Status: `launchctl list | grep com.winkel.print-zebra`
   - Log: `tail -f logs/print-zebra-bridge.log`
   - Stoppen: `launchctl unload ~/Library/LaunchAgents/com.winkel.print-zebra-bridge.plist`
   - Starten: `launchctl load ~/Library/LaunchAgents/com.winkel.print-zebra-bridge.plist`

Als de bridge op de server draait, kun je vanaf **elk apparaat** (tablet, telefoon) labels printen via **Labels** of **Label test** → “Print naar Zebra”.

**Bridge bereikbaar voor Vercel:** zie [scripts/README-Cloudflare-Tunnel-Zebra.md](scripts/README-Cloudflare-Tunnel-Zebra.md) voor zebra.babetteconcept.be via Cloudflare Tunnel.

### Next.js app automatisch starten (Mac)

Om de winkel-app op je Mac bij inloggen te starten (zodat je niet handmatig `npm run dev` of `npm start` hoeft te doen):

1. **Eenmalig**: build en service installeren (uitvoeren in de projectmap):
   ```bash
   npm run build
   ./scripts/install-nextjs-service.sh
   ```
   De app draait daarna op [http://localhost:3001](http://localhost:3001) en herstart na een crash of reboot.

2. **Na codewijziging of git pull**:
   ```bash
   npm run build
   launchctl unload ~/Library/LaunchAgents/com.winkel.nextjs.plist
   launchctl load ~/Library/LaunchAgents/com.winkel.nextjs.plist
   ```

3. **Handige commando's**
   - Status: `launchctl list | grep com.winkel.nextjs`
   - Log: `tail -f logs/nextjs.log`
   - Stoppen: `launchctl unload ~/Library/LaunchAgents/com.winkel.nextjs.plist`
   - Starten: `launchctl load ~/Library/LaunchAgents/com.winkel.nextjs.plist`

De service gebruikt **production** (`next start`), niet de dev-server. Voor development kun je nog steeds `npm run dev` in een terminal gebruiken.

### Label test (labels-debug)

- **Label bewerken**: velden voor productnaam, attributen, maat, prijs, barcode + typografie (marge boven, marge links, lettergroottes, regelafstand). Preview werkt direct.
- **ZPL bewerken**: ruwe ZPL aanpassen.
- **ZPL-bestand laden**: een `.zpl`-bestand inladen en printen.
- **Print naar Zebra**: stuurt de huidige ZPL naar de server (`/api/print-zpl`), die doorverbindt met de bridge.

## Configuratie

### Poort

In `package.json`:
```json
"dev": "next dev -p 3001",
"start": "next start -p 3001"
```
Voor een andere poort: `-p 3001` aanpassen of `PORT=3002 npm run dev`.

### Optioneel: ZPL-bridge-URL

Als de bridge op een andere host/poort draait, in `.env.local`:
```env
ZPL_BRIDGE_URL=http://127.0.0.1:9333/print
```

## Beveiliging

- Sessie-auth met iron-session
- Beveiligde API-routes
- Odoo-credentials in versleutelde sessiecookie

## Projectstructuur

```
winkel/
├── components/
│   └── Navigation.tsx
├── lib/
│   ├── zpl-labels.ts      # ZPL-generatie, DEFAULT_LABEL_OPTIONS
│   ├── hooks/
│   └── ...
├── pages/
│   ├── api/
│   │   ├── print-product-labels.ts   # HTML of ZPL voor labels
│   │   ├── print-zpl.ts              # Doorsturen ZPL naar bridge (labels-debug)
│   │   ├── test-label-zpl.ts         # Test-ZPL voor labels-debug
│   │   └── ...
│   ├── voorraad-opzoeken.tsx
│   ├── labels-afdrukken.tsx
│   ├── labels-debug.tsx
│   ├── webshoporders-beheren.tsx
│   ├── cadeaubon-aanmaken.tsx
│   ├── afval.tsx
│   └── ...
├── scripts/
│   ├── print-zebra-bridge.js
│   ├── install-print-zebra-bridge-service.sh
│   └── README-Zebra-printer.md
└── ...
```

## Deployment

- Vercel of andere Node.js-hosting.
- Voor direct Zebra-printen moet de ZPL-bridge op de **zelfde server** als de app draaien (of `ZPL_BRIDGE_URL` wijzen naar de machine waar de bridge draait).

## Dymo (cadeaubonnen)

Cadeaubonlabels zijn geschikt voor Dymo (62×29 mm). Kies in de app de Dymo-printer en print via het browser-printvenster.

---

**License** – Private, all rights reserved
