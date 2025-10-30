# Webshop Order Workflow - Product Availability Checking

## Overview

The webshop order management system has been enhanced with a new **Product Availability Dialog** that allows you to confirm product availability directly from the Winkel website before confirming orders. This eliminates the need to manually visit Odoo to check inventory.

## New Workflow

### Previous Workflow
1. Customer creates an order in webshop
2. Must visit Odoo → eCommerce Orders
3. Navigate to order details → Delivery tab
4. Manually check if products are available in physical inventory
5. Confirm order
6. Odoo triggers Sendcloud to create shipping label automatically
7. Go back to Winkel to download shipping label

### New Workflow (Improved)
1. Customer creates an order in webshop
2. In Winkel website, click "✅ Bevestig Order" button
3. **[NEW] Product Availability Dialog appears:**
   - Shows all products in the order
   - Displays quantity needed vs. quantity available in stock
   - Shows availability status for each product
   - Shows warning if any products have insufficient stock
4. Confirm the order from the dialog (even if some products are out of stock)
5. Order is confirmed and Sendcloud automatically creates shipping label
6. Download shipping label directly from Winkel website via "📦 Download Verzendlabel" button

## New Components and Endpoints

### 1. API Endpoint: `/api/check-product-availability`

**Purpose:** Fetch current inventory levels for all products in an order

**Method:** POST

**Request Body:**
```json
{
  "orderId": 12345
}
```

**Response:**
```json
{
  "success": true,
  "orderId": 12345,
  "orderName": "S02147",
  "allAvailable": false,
  "message": "Some products have insufficient inventory",
  "products": [
    {
      "id": 1,
      "name": "Hvid balaclava Eddy (1-3Y, Red)",
      "product_id": [42, "Hvid balaclava Eddy (1-3Y, Red)"],
      "product_uom_qty": 1,
      "qty_available": 1,
      "isAvailable": true,
      "shortage": 0,
      "price_unit": 42.95,
      "price_total": 42.95
    },
    {
      "id": 2,
      "name": "Atelier Lou - Wenskaart Ruimte",
      "product_id": [43, "Atelier Lou - Wenskaart Ruimte"],
      "product_uom_qty": 5,
      "qty_available": 2,
      "isAvailable": false,
      "shortage": 3,
      "price_unit": 3.95,
      "price_total": 19.75
    }
  ]
}
```

**Key Fields:**
- `allAvailable`: boolean indicating if all products are in stock
- `shortage`: quantity missing if product is not available
- `isAvailable`: per-product availability status

### 2. Component: `ProductAvailabilityDialog`

**Location:** `/components/ProductAvailabilityDialog.tsx`

**Features:**
- Modal dialog showing product availability details
- Loading spinner while checking inventory
- Color-coded status (green for available, red for insufficient)
- Warning messages for partial availability
- Cancel and Confirm buttons
- Professional UI with Dutch translations

**Props:**
```typescript
interface ProductAvailabilityDialogProps {
  isOpen: boolean;
  isLoading: boolean;
  orderName: string;
  products: Product[];
  allAvailable: boolean;
  error?: string;
  onConfirm: () => void;
  onCancel: () => void;
}
```

### 3. Updated Page: `pages/webshoporders-beheren.tsx`

**Changes:**
- Added state management for availability dialog
- New function `handleConfirmOrder`: Opens availability dialog and checks inventory
- New function `handleConfirmOrderAfterAvailabilityCheck`: Confirms order after availability check
- New function `handleCancelAvailabilityDialog`: Closes dialog without confirming
- Dialog displays inline with product details

## User Experience Flow

### Step 1: Click "Bevestig Order" Button
User clicks the green "✅ Bevestig Order" button on an order card.

### Step 2: Loading State
Dialog appears with loading spinner while checking inventory from Odoo.

### Step 3: Availability Review
Dialog shows:
- **Order name** (e.g., "S02147")
- **Product table** with columns:
  - Product name
  - Quantity needed
  - Quantity available
  - Status badge (✅ OK or ❌ Too little)
- **Summary** at top:
  - Green if all available: "✅ Alle producten zijn beschikbaar"
  - Yellow if partial: "⚠️ Sommige producten hebben onvoldoende voorraad"

### Step 4: Confirm (or Cancel)
- **Cancel**: Closes dialog, order remains unconfirmed
- **Confirm**: 
  - If all available: Shows "✅ Bevestig Order"
  - If partial: Shows "⚠️ Bevestig Toch" (Confirm Anyway)
  - Order is confirmed in Odoo
  - Sendcloud automatically creates shipping label
  - User sees success message

### Step 5: Download Shipping Label
After confirmation, user can download the shipping label using the "📦 Download Verzendlabel" button.

## Technical Details

### Data Flow

```
User clicks "Bevestig Order"
  ↓
handleConfirmOrder() opens dialog
  ↓
/api/check-product-availability fetches from Odoo:
  - Sale order details
  - Order line items
  - Product inventory levels
  ↓
ProductAvailabilityDialog displays results
  ↓
User clicks "Bevestig Order" or "Bevestig Toch"
  ↓
handleConfirmOrderAfterAvailabilityCheck() calls /api/confirm-order
  ↓
Order confirmed in Odoo
  ↓
Sendcloud receives webhook, creates shipping label
  ↓
User can download label with "📦 Download Verzendlabel"
```

### Inventory Information

- Product availability is checked using the `qty_available` field from Odoo's `product.product` model
- This represents actual physical inventory available
- Real-time data pulled directly from Odoo at confirmation time
- Shortages are calculated: `shortage = qty_needed - qty_available`

## Error Handling

- If API call fails: Error message displayed with option to cancel/retry
- If product not found: Shows as "Unknown" in dialog
- Network errors: Clear error message with graceful fallback
- All errors logged to console for debugging

## Benefits

✅ **Faster workflow** - No need to switch to Odoo
✅ **Better UX** - Clear visibility of inventory issues upfront
✅ **Flexible** - Can proceed even with partial stock
✅ **Real-time data** - Always shows current inventory
✅ **Professional** - Beautiful, intuitive interface
✅ **Dutch friendly** - All text in Dutch (nl-BE)

## Migration Notes

- No changes required to existing `/api/confirm-order` endpoint
- No changes required to shipping label download flow
- All existing functionality preserved
- Fully backward compatible

## Future Enhancements

Possible improvements:
- Auto-refresh inventory data while dialog is open
- Ability to adjust quantities for out-of-stock items
- Email notification to customer about stock issues
- Integration with supplier/warehouse system for restocking info
- Analytics on products with frequent stock issues
