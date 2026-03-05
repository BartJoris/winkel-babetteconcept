# Babette Winkel - Winkelbeheer Systeem

Een Next.js applicatie voor het beheren van winkeloperaties bij Babette, inclusief voorraadcontrole, cadeaubonnen en webshop orders.

## 🏪 Functies

Deze winkelapplicatie biedt:

- **🔍 Voorraad Opzoeken**: Scan producten om voorraad van varianten te controleren
- **🎁 Cadeaubon Aanmaken**: Maak cadeaubonnen aan met printbare Dymo labels
- **📦 Webshoporders Beheren**: Bevestig orders en download verzend documenten

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ installed
- Access to Odoo instance with API credentials
- npm package manager

### Installation

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Configure environment variables**

   The `.env.local` file should already be copied. If not, create it:
   ```bash
   cp env.example .env.local
   ```

   Edit `.env.local` and configure:
   ```env
   ODOO_URL=https://your-odoo-instance.com/jsonrpc
   ODOO_DB=your_database_name
   ODOO_USERNAME=your_odoo_username
   ODOO_API_KEY=your_odoo_api_key
   SESSION_SECRET=your_generated_secret_here
   ```

3. **Run the development server**
   ```bash
   npm run dev
   ```

   The app runs on **port 3000**: [http://localhost:3000](http://localhost:3000)

4. **Login**

   Navigate to [http://localhost:3000](http://localhost:3000) and log in with your Odoo credentials.

## 📋 Pages

### Voorraad Opzoeken
- Scan barcodes or search by product name
- View all variants with stock levels
- See product images and attributes (size, color)
- Filter by stock and sort results

### Cadeaubon Aanmaken
- Quick gift voucher creation
- Auto-set expiry to 1 year
- Print Dymo-compatible labels with barcode
- Anonymous vouchers by default

### Webshoporders Beheren  
- View last 10 e-commerce orders
- Confirm pending orders
- Download invoices and shipping labels
- Load more orders on demand

## 🔧 Configuration

### Port Configuration

To change the port, edit `package.json`:
```json
"scripts": {
  "dev": "next dev -p 3000",
  "start": "next start -p 3000"
}
```

## 🔒 Security

- Session-based authentication using iron-session
- Protected API routes
- Secure session management
- Odoo credentials encrypted in session cookie

## 🖨️ Dymo Printer Setup

Gift voucher labels are formatted for Dymo printers (62mm x 29mm).

Label includes:
- Amount and expiry date
- Scannable barcode (Code 128)
- Voucher code

### Zebra ZD421 printer instellen (Mac)

Zie **[scripts/README-Zebra-printer.md](scripts/README-Zebra-printer.md)** voor het aanmaken van de printer met de juiste naam (`Zebra_Technologies_ZTC_ZD421_203dpi_ZPL`) en instellingen (50,8×25,4 mm, 203 dpi, Mark sensing, Direct Thermal).

### Zebra print-bridge altijd draaien (Mac in de winkel)

Voor direct printen naar de Zebra ZD421 (prijslabels) moet de ZPL-bridge op poort 9333 draaien. Om die **automatisch bij inloggen te starten** en bij crash te herstarten:

1. **Eenmalig installeren** (uitvoeren in de projectmap):
   ```bash
   ./scripts/install-print-zebra-bridge-service.sh
   ```
   Dit zet een launchd-service in `~/Library/LaunchAgents/` en start de bridge.

2. **Handige commando's**
   - Status: `launchctl list | grep com.winkel.print-zebra`
   - Log bekijken: `tail -f logs/print-zebra-bridge.log`
   - Stoppen: `launchctl unload ~/Library/LaunchAgents/com.winkel.print-zebra-bridge.plist`
   - Opnieuw starten: `launchctl load ~/Library/LaunchAgents/com.winkel.print-zebra-bridge.plist`

Na een herstart of nieuwe login draait de bridge weer vanzelf.

## 📦 Project Structure

```
winkel/
├── components/
│   └── Navigation.tsx
├── lib/
│   ├── hooks/
│   ├── middleware/
│   └── validation/
├── pages/
│   ├── api/
│   ├── voorraad-opzoeken.tsx
│   ├── cadeaubon-aanmaken.tsx
│   └── webshoporders-beheren.tsx
├── styles/
└── public/
```

## 🌐 Deployment

Deploy to your preferred platform:
- Vercel
- Any Node.js hosting platform

The application is containerized and can be deployed using the included Dockerfile.

## 💡 Gebruik Tips

- Houd de app open tijdens winkeluren
- Ideaal voor snelle voorraadcontroles bij klanten
- Maak direct cadeaubonnen aan met printbare labels
- Verwerk webshop orders efficiënt

## 📝 License

Private - All rights reserved
