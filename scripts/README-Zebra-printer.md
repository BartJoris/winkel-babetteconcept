# Zebra ZD421 printer instellen (Mac)

Deze handleiding beschrijft hoe je de Zebra ZD421 aanmaakt op je Mac met de juiste naam en instellingen voor prijslabels via de ZPL-bridge.

## 1. Printer toevoegen

1. **Systeeminstellingen** → **Printers en scanners** (of **Printers & Scanners**).
2. Klik op **+** om een printer toe te voegen.
3. Kies de Zebra ZD421 (USB of netwerk, afhankelijk van hoe hij aangesloten is).
4. **Belangrijk:** noteer of wijzig de **printernaam** (zie stap 2).

## 2. Juiste printernaam

De ZPL-bridge stuurt naar een printer met een vaste naam. Gebruik **exact** deze naam:

```
Zebra_Technologies_ZTC_ZD421_203dpi_ZPL
```

- macOS kan bij toevoegen een iets andere naam tonen (bijv. “Zebra ZD421”).  
- Klik op de printer → **Opties en ondersteuning** → **Printernaam** en zet de naam op bovenstaande, **of** gebruik in de bridge de omgevingsvariabele (zie onder).

Als je een andere naam wilt gebruiken, start de bridge met:

```bash
ZEBRA_PRINTER="JouwPrinterNaam" node scripts/print-zebra-bridge.js
```

Bij de launchd-service: in de plist in `~/Library/LaunchAgents/` kun je een `<key>EnvironmentVariables</key>` toevoegen met `ZEBRA_PRINTER`.

### Optioneel: ZPL_BRIDGE_SECRET (bij tunnel of extern bereik)

Als je de bridge bereikbaar maakt via een tunnel (bijv. Cloudflare → zebra.babetteconcept.be), stel dan een gedeeld geheim in zodat niet iedereen kan printen:

- **Op de Mac (bridge):** start de bridge met `ZPL_BRIDGE_SECRET=jouw_geheime_string` of zet die in de launchd-plist onder EnvironmentVariables.
- **In de app (Vercel of .env):** zet dezelfde waarde in `ZPL_BRIDGE_SECRET`. De API stuurt die mee als header `X-ZPL-Secret`; de bridge accepteert alleen verzoeken met de juiste waarde.

Zonder `ZPL_BRIDGE_SECRET` accepteert de bridge alle POST-verzoeken (geschikt voor alleen lokaal gebruik).

## 3. Standaardopties instellen

Ga naar **Systeeminstellingen** → **Printers en scanners** → selecteer de Zebra → **Opties en ondersteuning** → **Standaardopties** (of “Open printerwachtrij” en daar **Printer → Stel standaardopties in**).

Stel het tabblad **General** als volgt in:

| Instelling      | Waarde |
|-----------------|--------|
| **Media Size**  | Custom |
| **Width**       | 50.8   |
| **Height**      | 25.4   |
| **Units**       | Millimeters |
| **Resolution**  | 203dpi |
| **Media Tracking** | Non-continuous (Web sensing) |
| **Media Type**  | Direct Thermal Media |

Klik op **Set Default Options** om op te slaan.

Deze afmeting (50,8 × 25,4 mm) komt overeen met de labels die de app gebruikt voor prijslabels.

## 4. Uitlijning na herstart of nieuwe labels

Na het vervangen van de labelrol of na een printer-herstart kunnen labels scheef of verkeerd uitgelijnd uitkomen. **Calibreer vanuit de app:**

### Standaard calibratie (⚙️ Calibreer)

Klik op **"Calibreer"** in de app (Labels afdrukken of Label debug). Dit stuurt:

1. Labelformaat (51×25 mm, 203 dpi)
2. Media tracking: web/gap sensing (voor die-cut labels met gaten)
3. Mediatype: direct thermal
4. Instellingen opslaan in EEPROM
5. Sensor calibratie (`~JC`)

De Zebra kan een paar labels doorvoeren en zet daarna de uitlijning goed.

### Diepe calibratie (🔧 Diep calibreer)

Als de standaard calibratie niet helpt, klik op **"Diep calibreer"**. Dit doet hetzelfde als hierboven maar stelt ook de print-darkness (10/30) en print-snelheid (4 ips) opnieuw in.

### Troubleshooting

Als calibreren niet lukt of labels slecht uitkomen:

1. **Labels opnieuw laden**: open de klep, haal de rol eruit, leg hem terug en zorg dat het label precies over de sensor loopt (het gat tussen twee labels moet door de sensor heen gaan).
2. **Web sensing vs. Mark sensing**: standaard die-cut labels (met gaten/gaps ertussen) gebruiken **Web sensing**. Labels met een zwarte streep op de achterkant gebruiken **Mark sensing**. Controleer in macOS printerinstellingen of dit juist staat.
3. **Handmatig via terminal** – als de app-knop niet werkt, stuur ZPL direct:
   ```bash
   echo '^XA^PW406^LL200^MNY^MTD^JUS^XZ' | lpr -P Zebra_Technologies_ZTC_ZD421_203dpi_ZPL -o raw
   echo '~JC' | lpr -P Zebra_Technologies_ZTC_ZD421_203dpi_ZPL -o raw
   ```
4. **Darkness aanpassen**: als tekst te licht of te donker is, pas `^MD` aan (0 = licht, 30 = donker). De diepe calibratie zet 10.
5. **Printer-wachtrij leegmaken**: als de printer vastloopt:
   ```bash
   cancel -a Zebra_Technologies_ZTC_ZD421_203dpi_ZPL
   ```

## 5. Controleren

- In de app: kies printer **Zebra** en formaat **Normaal**, druk labels af. De bridge moet draaien (`npm run print-zebra` of de launchd-service).
- In de terminal: `lpstat -p` toont de printernaam; die moet overeenkomen met `Zebra_Technologies_ZTC_ZD421_203dpi_ZPL` (of de waarde van `ZEBRA_PRINTER`).

## Samenvatting (instellingen)

| Wat | Waarde |
|-----|--------|
| Printernaam (voor bridge) | `Zebra_Technologies_ZTC_ZD421_203dpi_ZPL` |
| Labelformaat | 50,8 × 25,4 mm (Custom, millimeters) |
| Resolutie | 203 dpi |
| Media tracking | Non-continuous (Web sensing) |
| Mediatype | Direct Thermal Media |
