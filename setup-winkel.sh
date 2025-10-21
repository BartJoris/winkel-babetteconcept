#!/bin/bash
# Setup script for Winkel project
# This copies necessary files from pos-sessies

set -e

echo "🏪 Setting up Winkel project..."

SOURCE_DIR="/Users/bajoris/git/pos-sessies"
TARGET_DIR="/Users/bajoris/git/winkel"

cd "$TARGET_DIR"

# Create directory structure
echo "📁 Creating directories..."
mkdir -p components
mkdir -p lib/hooks lib/middleware lib/validation
mkdir -p pages/api
mkdir -p styles
mkdir -p public

# Copy shared library files
echo "📚 Copying library files..."
cp "$SOURCE_DIR/lib/session.ts" lib/
cp "$SOURCE_DIR/lib/odooClient.ts" lib/
cp "$SOURCE_DIR/lib/hooks/useAuth.ts" lib/hooks/
cp "$SOURCE_DIR/lib/middleware/withAuth.ts" lib/middleware/
cp "$SOURCE_DIR/lib/validation/auth.ts" lib/validation/

# Copy API routes needed for winkel
echo "🔌 Copying API routes..."
cp "$SOURCE_DIR/pages/api/odoo-login.ts" pages/api/
cp "$SOURCE_DIR/pages/api/logout.ts" pages/api/
cp -r "$SOURCE_DIR/pages/api/auth" pages/api/
cp "$SOURCE_DIR/pages/api/env-info.ts" pages/api/
cp "$SOURCE_DIR/pages/api/scan-product.ts" pages/api/
cp "$SOURCE_DIR/pages/api/create-gift-voucher.ts" pages/api/
cp "$SOURCE_DIR/pages/api/print-voucher-label.ts" pages/api/
cp "$SOURCE_DIR/pages/api/pending-orders.ts" pages/api/
cp "$SOURCE_DIR/pages/api/confirm-order.ts" pages/api/
cp "$SOURCE_DIR/pages/api/download-order-invoice.ts" pages/api/
cp "$SOURCE_DIR/pages/api/download-shipping-label.ts" pages/api/
cp "$SOURCE_DIR/pages/api/search-customers.ts" pages/api/
cp "$SOURCE_DIR/pages/api/download-order-attachments.ts" pages/api/ 2>/dev/null || true

# Copy winkel-specific pages
echo "📄 Copying pages..."
cp "$SOURCE_DIR/pages/_app.tsx" pages/
cp "$SOURCE_DIR/pages/_document.tsx" pages/
cp "$SOURCE_DIR/pages/index.tsx" pages/
cp "$SOURCE_DIR/pages/voorraad-opzoeken.tsx" pages/
cp "$SOURCE_DIR/pages/cadeaubon-aanmaken.tsx" pages/
cp "$SOURCE_DIR/pages/webshoporders-beheren.tsx" pages/

# Copy styles
echo "🎨 Copying styles..."
cp "$SOURCE_DIR/styles/globals.css" styles/

# Copy public assets
echo "🖼️ Copying public assets..."
cp "$SOURCE_DIR/public/"* public/ 2>/dev/null || true

# Copy config files
echo "⚙️ Copying config files..."
cp "$SOURCE_DIR/next.config.ts" .
cp "$SOURCE_DIR/tsconfig.json" .
cp "$SOURCE_DIR/postcss.config.mjs" .
cp "$SOURCE_DIR/tailwind.config.js" . 2>/dev/null || echo "module.exports = { content: ['./pages/**/*.{js,ts,jsx,tsx}', './components/**/*.{js,ts,jsx,tsx}'], theme: { extend: {} }, plugins: [] }" > tailwind.config.js
cp "$SOURCE_DIR/eslint.config.mjs" . 2>/dev/null || true
cp "$SOURCE_DIR/.gitignore" . 2>/dev/null || true
cp "$SOURCE_DIR/env.example" .

echo "✅ Files copied successfully!"
echo ""
echo "📦 Next steps:"
echo "1. Install dependencies: npm install"
echo "2. Copy .env.local from pos-sessies or create new one"
echo "3. Run development server: npm run dev (runs on port 3002)"
echo ""

