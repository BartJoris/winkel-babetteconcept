# Odoo ZPL labels automatisch printen naar Zebra

Wanneer je in Odoo via **Inventory → Print Label → Zebra** een label print, downloadt Odoo een tekstbestand met ZPL-code. De **ZPL Folder Watcher** bewaakt je Downloads-map en stuurt deze bestanden automatisch naar de Zebra printer.

## Hoe het werkt

```
Odoo "Print Label"  →  .txt bestand in ~/Downloads  →  Watcher detecteert ZPL  →  lpr naar Zebra  →  Bestand verwijderd
```

De watcher controleert elk nieuw bestand op ZPL-inhoud (`^XA...^XZ`). Alleen bestanden die daadwerkelijk ZPL bevatten worden geprint — gewone downloads worden met rust gelaten.

## Vereisten

- Zebra printer ingesteld in macOS (zie [README-Zebra-printer.md](README-Zebra-printer.md))
- Node.js geïnstalleerd
- De ZPL-bridge hoeft **niet** te draaien — de watcher print rechtstreeks via `lpr`

## Installeren als service (aanbevolen)

De watcher draait als achtergrondservice die automatisch start bij inloggen:

```bash
cd ~/git/winkel
./scripts/install-zpl-folder-watcher-service.sh
```

Dat is alles. De watcher draait nu op de achtergrond en bewaakt `~/Downloads`.

### Andere map bewaken

```bash
WATCH_DIR=~/Desktop ./scripts/install-zpl-folder-watcher-service.sh
```

## Handmatig starten (voor testen)

```bash
node scripts/zpl-folder-watcher.js
```

Of met een andere map:

```bash
WATCH_DIR=~/Desktop node scripts/zpl-folder-watcher.js
```

## Configuratie

Alle instellingen via omgevingsvariabelen:

| Variabele | Standaard | Beschrijving |
|-----------|-----------|-------------|
| `WATCH_DIR` | `~/Downloads` | Map om te bewaken |
| `ZEBRA_PRINTER` | `Zebra_Technologies_ZTC_ZD421_203dpi_ZPL` | CUPS printernaam |
| `DELETE_AFTER_PRINT` | `1` | `0` om bestanden te bewaren na printen |
| `WATCH_EXTENSIONS` | `.txt,.zpl,.raw` | Bestandsextensies om te controleren (komma-gescheiden) |

## Beheer

```bash
# Status controleren
launchctl list | grep com.winkel.zpl-folder

# Log bekijken (live)
tail -f ~/git/winkel/logs/zpl-folder-watcher.log

# Stoppen
launchctl unload ~/Library/LaunchAgents/com.winkel.zpl-folder-watcher.plist

# Herstarten
launchctl unload ~/Library/LaunchAgents/com.winkel.zpl-folder-watcher.plist
launchctl load ~/Library/LaunchAgents/com.winkel.zpl-folder-watcher.plist

# Verwijderen
launchctl unload ~/Library/LaunchAgents/com.winkel.zpl-folder-watcher.plist
rm ~/Library/LaunchAgents/com.winkel.zpl-folder-watcher.plist
```

## Testen

1. Start de watcher (handmatig of als service)
2. Maak een testbestand aan:
   ```bash
   echo '^XA^CI28^FT35,30^A0N,20^FDOdoo test label^FS^XZ' > ~/Downloads/test-odoo.txt
   ```
3. Het label wordt automatisch geprint en het bestand verwijderd
4. Controleer de log: `tail ~/git/winkel/logs/zpl-folder-watcher.log`

## Gebruik vanuit Odoo

1. Ga naar **Inventory** → selecteer producten → **Print** → **Product Label (ZPL)**
2. Kies **Zebra** als printerformaat
3. Klik op **Print** — Odoo downloadt een `.txt` bestand
4. De watcher pakt het bestand op en print het automatisch naar de Zebra

## Naast de ZPL bridge

Deze watcher werkt **onafhankelijk** van de ZPL bridge (`print-zebra-bridge.js`). Je kunt beide tegelijk draaien:

| Service | Doel | Bron |
|---------|------|------|
| `com.winkel.print-zebra-bridge` | Labels vanuit de Winkel-app (via HTTP) | Vercel / lokaal |
| `com.winkel.zpl-folder-watcher` | Labels vanuit Odoo (via Downloads) | Odoo bestandsdownload |
