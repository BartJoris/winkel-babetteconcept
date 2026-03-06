# Zebra-bridge bereikbaar maken via Cloudflare Tunnel (Mac)

Met een Cloudflare Tunnel maak je de ZPL-bridge op je Mac bereikbaar als **https://zebra.babetteconcept.be**. De app op Vercel kan dan via die URL naar je printer printen. Geen open poorten of port forwarding nodig.

**Vereisten**
- Cloudflare-account
- Domein **babetteconcept.be** (of een subdomein) in Cloudflare (DNS beheerd door Cloudflare)
- Mac met de Zebra aangesloten, ZPL-bridge en (later) cloudflared

---

## Stap 1: ZPL-bridge draaien met secret

Op de Mac waar de printer aan hangt:

1. **Geheim kiezen** (lange willekeurige string, bijv. 32+ tekens):
   ```bash
   node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
   ```
   Bewaar deze waarde; je zet hem straks ook op Vercel.

2. **Bridge starten met secret** (in de projectmap):
   ```bash
   ZPL_BRIDGE_SECRET=<jouw_geheim> npm run print-zebra
   ```
   **Als de bridge al als launchd-service draait**, kun je op twee manieren het secret aan de service geven:

   **Optie A – Service opnieuw installeren met secret** (in de projectmap):
   ```bash
   ZPL_BRIDGE_SECRET=jouw_geheim_hier ./scripts/install-print-zebra-bridge-service.sh
   ```
   De install-script schrijft het secret in de plist en herlaadt de service.

   **Optie B – Plist handmatig bewerken**
   - Open `~/Library/LaunchAgents/com.winkel.print-zebra-bridge.plist` in een teksteditor.
   - Voeg vóór `<key>RunAtLoad</key>` het volgende blok toe (pas `jouw_geheim_hier` aan):
   ```xml
   <key>EnvironmentVariables</key>
   <dict>
     <key>ZPL_BRIDGE_SECRET</key>
     <string>jouw_geheim_hier</string>
   </dict>
   ```
   - Service herladen:
   ```bash
   launchctl unload ~/Library/LaunchAgents/com.winkel.print-zebra-bridge.plist
   launchctl load ~/Library/LaunchAgents/com.winkel.print-zebra-bridge.plist
   ```

3. Controleren: in een andere terminal:
   ```bash
   curl -X POST http://127.0.0.1:9333/print -H "Content-Type: text/plain" -d "^XA^FO50,50^ADN,20,10^FDtest^FS^XZ"
   ```
   Zonder secret: 401. Met header:
   ```bash
   curl -X POST http://127.0.0.1:9333/print -H "Content-Type: text/plain" -H "X-ZPL-Secret: jouw_geheim" -d "^XA^FO50,50^ADN,20,10^FDtest^FS^XZ"
   ```
   Je zou 200 en `{"ok":true,"labels":1}` moeten zien (en mogelijk een testlabel uit de printer).

---

## Stap 2: cloudflared installeren op de Mac

```bash
brew install cloudflared
```

Of: [Cloudflare – Install cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/) en het macOS-pakket downloaden.

Controle:
```bash
cloudflared --version
```

---

## Stap 3: Tunnel aanmaken in Cloudflare

1. Ga naar [Cloudflare Zero Trust](https://one.dash.cloudflare.com/) (of **Zero Trust** in het Cloudflare-dashboard).
2. **Networks** → **Tunnels** (of **Access** → **Tunnels**).
3. Klik **Create a tunnel**.
4. Kies **Cloudflared** en geef een naam, bijv. **zebra-bridge**. Next.
5. Kies **OS** = Mac, **Architecture** = volgens je Mac (meestal ARM64 voor Apple Silicon). Je krijgt een **installatiecommando** en een **token** (lange string). Kopieer het volledige commando of het token; je gebruikt het in stap 4.

---

## Stap 4: Public hostname (URL) koppelen

In hetzelfde tunnel-wizardscherm (of na aanmaken: tunnel aanklikken → **Public Hostname**):

1. Klik **Add a public hostname** (of **Add hostname**).
2. **Subdomain:** `zebra` (of leeg als je een apart domein wilt).
3. **Domain:** kies je domein, bijv. **babetteconcept.be**.
   - Resultaat: **zebra.babetteconcept.be**.
4. **Service type:** kies **HTTP** (niet TCP – de bridge is een HTTP-server).
5. **URL:** `http://localhost:9333` (of alleen `localhost:9333`).
6. Opslaan.

Daarmee wordt alle verkeer naar **https://zebra.babetteconcept.be** doorgestuurd naar `http://localhost:9333` op de Mac waar cloudflared draait.

---

## Stap 5: Tunnel starten op de Mac

Je hebt het **token** uit stap 3 nodig.

**Eenmalig (handmatig):**
```bash
cloudflared tunnel run --token <jouw_token>
```
Laat dit venster open; zodra je stopt, is de tunnel weg.

**Permanent (aanbevolen):** tunnel als service installeren zodat hij bij elke login start.

```bash
sudo cloudflared service install <jouw_token>
```

Status controleren:
```bash
sudo launchctl list | grep cloudflared
```

Logs (bij service-install):
```bash
sudo cat /Library/Logs/com.cloudflare.cloudflared.err.log
```

---

## Stap 6: Testen vanaf internet

Vanaf een andere machine of je telefoon (niet de Mac):

```bash
curl -X POST https://zebra.babetteconcept.be/print \
  -H "Content-Type: text/plain" \
  -H "X-ZPL-Secret: jouw_geheim" \
  -d "^XA^FO50,50^ADN,20,10^FDtest^FS^XZ"
```

Verwacht: `{"ok":true,"labels":1}`. Zonder juiste `X-ZPL-Secret`: 401.

---

## Stap 7: Vercel (of productie-app) configureren

In het Vercel-dashboard van je project → **Settings** → **Environment Variables**:

| Name | Value |
|------|--------|
| `ZPL_BRIDGE_URL` | `https://zebra.babetteconcept.be/print` |
| `ZPL_BRIDGE_SECRET` | Hetzelfde geheim als in stap 1 |

Redeploy de app. Daarna zou “Print naar Zebra” en “Labels afdrukken” (Zebra, direct) moeten werken vanaf de Vercel-site, zolang de Mac met bridge en tunnel aanstaat.

---

## Overzicht

| Onderdeel | Waar | Wat |
|-----------|------|-----|
| ZPL-bridge | Mac (localhost:9333) | Ontvangt ZPL, stuurt naar `lpr`. Optioneel: `ZPL_BRIDGE_SECRET`. |
| cloudflared | Mac | Maakt tunnel naar Cloudflare; verkeer voor zebra.babetteconcept.be → localhost:9333. |
| DNS | Cloudflare | zebra.babetteconcept.be wijst naar de tunnel (vaak automatisch door Cloudflare ingesteld). |
| App (Vercel) | Cloudflare | Roept `ZPL_BRIDGE_URL` aan met header `X-ZPL-Secret`; request komt via tunnel bij de bridge. |

**Handige commando’s**
- Tunnel (service) stoppen: `sudo launchctl unload /Library/LaunchDaemons/com.cloudflare.cloudflared.plist`
- Tunnel starten: `sudo launchctl load /Library/LaunchDaemons/com.cloudflare.cloudflared.plist`
- Bridge lokaal testen: `curl -X POST http://127.0.0.1:9333/print -H "X-ZPL-Secret: geheim" -H "Content-Type: text/plain" -d "^XA^XZ"`
