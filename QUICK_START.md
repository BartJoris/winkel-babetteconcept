# Babette Winkel - Snelstart Gids

## 🚀 Start de App

```bash
cd /Users/bajoris/git/winkel
npm run dev
```

**Toegang**: http://localhost:3002 (of via jouw domein)

## 🏪 Features

### 1. Voorraad Opzoeken (Main Page)
- Scan barcode or type product name
- See all variants with stock levels
- Product images and attributes
- **Sorted by size**: 3 jaar, 5 jaar, 7 jaar, etc.

### 2. Cadeaubon Aanmaken
- Enter amount (e.g., €50)
- Click "Maak Cadeaubon"
- Get voucher code
- Print Dymo label with barcode

**Label shows**:
```
€50.00 geldig tot: 20/10/2026
[BARCODE]
044d-6795-4507
```

### 3. Webshoporders Beheren
- View last 10 orders
- Confirm orders
- Download invoices
- Download shipping labels

## 🔑 Login

Use your Odoo credentials:
- Username: (from .env.local)
- Password: (your Odoo password)

## 💡 Quick Tips

- **Default voucher**: Anonymous, 1 year expiry
- **Variant sorting**: Numerical (3, 5, 7, 9, 11, 13)
- **Orders**: Shows last 3, load more as needed
- **Environment indicator**: Red bar = Production, Blue = Dev

## 🏃 Workflow Examples

### Create Gift Voucher
1. Go to "Cadeaubon aanmaken"
2. Type: 50
3. Click button
4. Print label
5. Done! ✨

### Check Stock
1. Go to "Voorraad opzoeken"
2. Scan product or type name
3. Click product from results
4. See all variants with stock

### Process Order
1. Go to "Webshoporders"
2. Click order to expand
3. Click "Bevestig Order" if needed
4. Download invoice + shipping label
5. Print and ship

## 🌐 Productie Deployment

Voor productie deployment, gebruik:
- Een aparte server of container
- Eigen DNS (bijv. winkel.babetteconcept.be)
- HTTPS met SSL certificaat
- Zie README.md voor deployment instructies


