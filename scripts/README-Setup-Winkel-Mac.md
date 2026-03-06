# Winkelcomputer volledig klaarzetten (Mac)

Stappen en commando’s om één Mac in de winkel klaar te zetten: Zebra-printer, ZPL-bridge en Cloudflare Tunnel, zodat de app op Vercel naar deze printer kan printen.

**Vereisten**
- Mac in de winkel met internet
- Zebra ZD421 aangesloten (USB of netwerk)
- Cloudflare-account, domein babetteconcept.be in Cloudflare
- Git-repo van het project (bijv. al gekloond of nog te clonen)

---

## 1. Node en project

**Node.js (18+)** – als het nog niet geïnstalleerd is:
```bash
# Homebrew indien nodig: /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
brew install node
node -v
npm -v
```

**Project clonen (als dat nog niet gedaan is):**
```bash
cd ~
git clone <url-van-de-repo> winkel
cd winkel
```

**Dependencies:**
```bash
npm install
```

---

## 2. Environment (.env.local)

Kopieer het voorbeeld en vul minimaal in wat de app nodig heeft (Odoo + sessie). Voor alleen de bridge/tunnel hoef je Odoo niet per se lokaal te hebben; de app draait op Vercel.

```bash
cp env.example .env.local
```

Bewerk `.env.local` en zet in ieder geval:
- `ODOO_URL`, `ODOO_DB`, `ODOO_USERNAME`, `ODOO_API_KEY` (voor inloggen in de app)
- `SESSION_SECRET` (lange willekeurige string, bijv. `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)

---

## 3. Zebra-printer in macOS

1. **Systeeminstellingen** → **Printers en scanners** → **+** → Zebra ZD421 selecteren (USB of netwerk).
2. **Printernaam** aanpassen naar exact:
   ```
   Zebra_Technologies_ZTC_ZD421_203dpi_ZPL
   ```
   (Printer selecteren → Opties en ondersteuning → Printernaam.)
3. **Standaardopties** van de printer:
   - Systeeminstellingen → Zebra → Opties en ondersteuning → Standaardopties  
   - **General:** Media Size = Custom, Width = 50.8, Height = 25.4, Units = Millimeters, Resolution = 203dpi, Media Tracking = Non-continuous (Mark sensing), Media Type = Direct Thermal Media → **Set Default Options**.

**Controleren:**
```bash
lpstat -p
```
Er moet een printer met naam `Zebra_Technologies_ZTC_ZD421_203dpi_ZPL` (of jouw gekozen naam) in de lijst staan.

---

## 4. Geheim voor de bridge (ZPL_BRIDGE_SECRET)

Genereer één geheim en bewaar het; je zet het straks in de bridge-service én op Vercel.

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```

Schrijf de uitvoer op (bijv. in een wachtwoordmanager). Bijvoorbeeld: `a1b2c3d4e5f6...`.

---

## 5. ZPL-bridge als service installeren

In de projectmap (`cd ~/winkel` of waar de repo staat):

```bash
ZPL_BRIDGE_SECRET=<plak_hier_het_geheim_uit_stap_4> ./scripts/install-print-zebra-bridge-service.sh
```

Voorbeeld (vervang door jouw geheim):
```bash
ZPL_BRIDGE_SECRET=a1b2c3d4e5f6789012345678901234567890abcdef ./scripts/install-print-zebra-bridge-service.sh
```

**Controleren:**
```bash
launchctl list | grep com.winkel.print-zebra
curl -s -X POST http://127.0.0.1:9333/print -H "Content-Type: text/plain" -H "X-ZPL-Secret: JOUW_GEHEIM" -d "^XA^XZ"
```
Verwacht: `{"ok":true,"labels":1}`. Er kan een (bijna leeg) testlabel uit de printer komen.

---

## 6. Cloudflare Tunnel (cloudflared)

**cloudflared installeren:**
```bash
brew install cloudflared
cloudflared --version
```

**Tunnel aanmaken (eenmalig, in Cloudflare):**
1. Ga naar [Cloudflare Zero Trust](https://one.dash.cloudflare.com/) → **Networks** → **Tunnels**.
2. **Create a tunnel** → naam bijv. **zebra-bridge** → **Cloudflared** → Next.
3. Kies **Mac** en de juiste **Architecture** (bijv. ARM64). Je krijgt een **token** (lange string). Kopieer die.
4. **Public Hostname** toevoegen:
   - Subdomain: **zebra**, Domain: **babetteconcept.be** → **zebra.babetteconcept.be**
   - Service type: **HTTP**
   - URL: **http://localhost:9333**
   - Opslaan.

**Tunnel als service op de Mac installeren (blijft draaien na herstart):**
```bash
sudo cloudflared service install <plak_hier_het_tunnel_token>
```

**Controleren:**
```bash
sudo launchctl list | grep cloudflared
```

---

## 7. Vercel: environment variables

In het Vercel-dashboard van het winkelproject → **Settings** → **Environment Variables** toevoegen:

| Name | Value |
|------|--------|
| `ZPL_BRIDGE_URL` | `https://zebra.babetteconcept.be/print` |
| `ZPL_BRIDGE_SECRET` | Hetzelfde geheim als in stap 4 |

Daarna **Redeploy** van de app (Deployments → … bij laatste deploy → Redeploy).

---

## 8. (Optioneel) Next.js app lokaal als service

Alleen nodig als je de app op deze Mac wilt openen via **http://localhost:3001** in plaats van via de Vercel-URL. Anders: in de browser gewoon de Vercel-URL van de app openen.

**Build en service installeren:**
```bash
cd ~/winkel
npm run build
./scripts/install-nextjs-service.sh
```

App: **http://localhost:3001**. Log: `tail -f logs/nextjs.log`.

---

## 9. Alles testen

**Lokaal (op de Mac):**
```bash
curl -s -X POST http://127.0.0.1:9333/print \
  -H "Content-Type: text/plain" -H "X-ZPL-Secret: JOUW_GEHEIM" \
  -d "^XA^FO50,50^ADN,20,10^FDTest^FS^XZ"
```
Verwacht: `{"ok":true,"labels":1}` en een testlabel.

**Via tunnel (vanaf telefoon of andere pc):**
```bash
curl -s -X POST https://zebra.babetteconcept.be/print \
  -H "Content-Type: text/plain" -H "X-ZPL-Secret: JOUW_GEHEIM" \
  -d "^XA^FO50,50^ADN,20,10^FDTest^FS^XZ"
```
Zelfde antwoord als de tunnel goed staat.

**In de app (Vercel):** inloggen → **Labels** of **Label test** → “Print naar Zebra”. Er moet een label uit de printer komen.

---

## 10. Handige commando’s (naslag)

**ZPL-bridge**
- Status: `launchctl list | grep com.winkel.print-zebra`
- Log: `tail -f ~/winkel/logs/print-zebra-bridge.log`
- Stoppen: `launchctl unload ~/Library/LaunchAgents/com.winkel.print-zebra-bridge.plist`
- Starten: `launchctl load ~/Library/LaunchAgents/com.winkel.print-zebra-bridge.plist`

**Cloudflare Tunnel**
- Status: `sudo launchctl list | grep cloudflared`
- Log: `sudo tail -f /Library/Logs/com.cloudflare.cloudflared.err.log`
- Stoppen: `sudo launchctl unload /Library/LaunchDaemons/com.cloudflare.cloudflared.plist`
- Starten: `sudo launchctl load /Library/LaunchDaemons/com.cloudflare.cloudflared.plist`

**Next.js (als je die lokaal draait)**
- Status: `launchctl list | grep com.winkel.nextjs`
- Log: `tail -f ~/winkel/logs/nextjs.log`
- Stoppen: `launchctl unload ~/Library/LaunchAgents/com.winkel.nextjs.plist`
- Starten: `launchctl load ~/Library/LaunchAgents/com.winkel.nextjs.plist`

**Printer**
- Lijst: `lpstat -p`
- Testpagina: `lp -d Zebra_Technologies_ZTC_ZD421_203dpi_ZPL -o raw < een-bestand-met-zpl.txt`

---

## Korte checklist

- [ ] Node 18+ geïnstalleerd
- [ ] Project gekloond, `npm install` gedaan
- [ ] `.env.local` aangemaakt (Odoo + SESSION_SECRET voor app)
- [ ] Zebra toegevoegd in Systeeminstellingen, printernaam en standaardopties gezet
- [ ] Geheim gegenereerd en opgeschreven
- [ ] ZPL-bridge service geïnstalleerd met `ZPL_BRIDGE_SECRET=... ./scripts/install-print-zebra-bridge-service.sh`
- [ ] cloudflared geïnstalleerd, tunnel in Cloudflare aangemaakt, hostname zebra.babetteconcept.be → localhost:9333
- [ ] `sudo cloudflared service install <token>` uitgevoerd
- [ ] Op Vercel: ZPL_BRIDGE_URL en ZPL_BRIDGE_SECRET gezet, redeploy
- [ ] Test: curl lokaal en via https://zebra.babetteconcept.be/print, daarna printen vanuit de app
