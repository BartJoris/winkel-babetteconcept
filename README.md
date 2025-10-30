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
