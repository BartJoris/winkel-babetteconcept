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
| **Media Tracking** | Non-continuous (Mark sensing) |
| **Media Type**  | Direct Thermal Media |

Klik op **Set Default Options** om op te slaan.

Deze afmeting (50,8 × 25,4 mm) komt overeen met de labels die de app gebruikt voor prijslabels.

## 4. Controleren

- In de app: kies printer **Zebra** en formaat **Normaal**, druk labels af. De bridge moet draaien (`npm run print-zebra` of de launchd-service).
- In de terminal: `lpstat -p` toont de printernaam; die moet overeenkomen met `Zebra_Technologies_ZTC_ZD421_203dpi_ZPL` (of de waarde van `ZEBRA_PRINTER`).

## Samenvatting

| Wat | Waarde |
|-----|--------|
| Printernaam (voor bridge) | `Zebra_Technologies_ZTC_ZD421_203dpi_ZPL` |
| Labelformaat | 50,8 × 25,4 mm (Custom, millimeters) |
| Resolutie | 203 dpi |
| Media tracking | Non-continuous (Mark sensing) |
| Mediatype | Direct Thermal Media |
