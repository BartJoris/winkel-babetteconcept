# Quick Reference: Product Availability Checking

## What Changed?

When you click **"✅ Bevestig Order"** on a webshop order, you now see:

```
┌─────────────────────────────────────────────────────────────────┐
│ 📦 Controleer Productbeschikbaarheid                            │
│    Order S02147                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ ✅ Alle producten zijn beschikbaar                              │
│                                                                 │
│ ┌──────────────────────────────────────────────────────────────┐│
│ │ Product         │ Benodigd │ Voorraad │ Status               ││
│ ├──────────────────┼──────────┼──────────┼─────────────────────┤│
│ │ Hvid balaclava  │    1     │    1     │ ✅ OK               ││
│ │ Atelier Lou     │    5     │    2     │ ❌ Te weinig (-3)    ││
│ └──────────────────┴──────────┴──────────┴─────────────────────┘│
│                                                                 │
│ ⚠️ Let op                                                       │
│ Sommige producten hebben onvoldoende voorraad. U kunt nog      │
│ steeds de order bevestigen, maar de verzending zal vertraagd   │
│ kunnen worden totdat alle producten beschikbaar zijn.          │
│                                                                 │
│         [✕ Annuleren]  [⚠️ Bevestig Toch]                     │
└─────────────────────────────────────────────────────────────────┘
```

## New Workflow Steps

### 1. View Orders
Open Webshoporders page and see all pending orders

### 2. Click "Bevestig Order"
Click the green confirmation button on any order

### 3. Check Availability
Dialog shows real-time inventory status:
- ✅ **OK**: Product available (green)
- ❌ **Te weinig**: Product out of stock (red) with shortage amount

### 4. Make Decision
- **Cancel** (✕): Return to order list without confirming
- **Confirm** (✅ or ⚠️): Proceed with order confirmation

### 5. Automatic Label Creation
After confirming:
- ✅ Order confirmed in Odoo
- ✅ Sendcloud automatically creates shipping label
- ✅ You can now download the label

## Key Information

| Aspect | Details |
|--------|---------|
| **When does it appear?** | Every time you click "Bevestig Order" |
| **What does it show?** | Products in order + current stock levels |
| **Is it real-time?** | Yes, fetched fresh from Odoo when opened |
| **Can I proceed with missing stock?** | Yes, click "⚠️ Bevestig Toch" |
| **Does it break anything?** | No, fully backward compatible |
| **Can I cancel?** | Yes, anytime - order won't be confirmed |

## Scenarios

### Scenario 1: All Products in Stock ✅
```
User sees green status "Alle producten zijn beschikbaar"
→ Clicks "✅ Bevestig Order"
→ Order confirmed
→ Label created automatically
→ Can download label
```

### Scenario 2: Some Products Out of Stock ⚠️
```
User sees yellow warning "Sommige producten hebben onvoldoende voorraad"
→ Clicks "⚠️ Bevestig Toch" to proceed anyway
→ Order confirmed
→ Label created automatically
→ Warehouse can manage partial shipment
```

### Scenario 3: Cancel the Confirmation ✕
```
User sees products are out of stock
→ Clicks "✕ Annuleren"
→ Dialog closes
→ Order remains unconfirmed
→ Can try again later
```

## API Endpoints

### New Endpoint
```
POST /api/check-product-availability
├─ Input: { orderId: number }
└─ Output: { 
    success: boolean,
    products: [{
      name: string,
      product_uom_qty: number (needed),
      qty_available: number (in stock),
      isAvailable: boolean,
      shortage: number
    }],
    allAvailable: boolean
  }
```

### Still Working (No Changes)
```
POST /api/confirm-order
POST /api/download-shipping-label
POST /api/download-order-invoice
```

## Component Usage

### ProductAvailabilityDialog
**Location:** `components/ProductAvailabilityDialog.tsx`

**Props:**
- `isOpen`: Show/hide dialog
- `isLoading`: Show loading spinner
- `orderName`: Display order name
- `products`: Array of products with availability
- `allAvailable`: All in stock? (controls button colors)
- `error`: Error message if any
- `onConfirm`: Callback when user confirms
- `onCancel`: Callback when user cancels

**Example:**
```tsx
<ProductAvailabilityDialog
  isOpen={true}
  isLoading={false}
  orderName="S02147"
  products={[
    {
      name: "Product 1",
      product_uom_qty: 2,
      qty_available: 2,
      isAvailable: true,
      shortage: 0
    }
  ]}
  allAvailable={true}
  onConfirm={() => confirmOrder()}
  onCancel={() => closeDialog()}
/>
```

## Troubleshooting

### Problem: "Fout bij controleren beschikbaarheid" (Error checking availability)
**Solution:** Check network connection, try again

### Problem: "Kon niet downloaden" when downloading label
**Solution:** Wait a moment for Sendcloud to process, refresh page, try again

### Problem: Dialog shows wrong quantities
**Solution:** Refresh order list with 🔄 button before confirming

### Problem: Can't download label after confirming
**Solution:** Check that order state is "Bevestigd" (confirmed), wait a moment for label to generate

## Files Changed

| File | Type | Change |
|------|------|--------|
| `pages/api/check-product-availability.ts` | New | Checks inventory in Odoo |
| `components/ProductAvailabilityDialog.tsx` | New | Shows availability dialog |
| `pages/webshoporders-beheren.tsx` | Modified | Integrates dialog into confirmation flow |

## Benefits Overview

✅ **Faster** - Check availability without leaving the website
✅ **Smarter** - See issues before confirming
✅ **Flexible** - Can proceed with partial stock if needed
✅ **Better UX** - Beautiful dialog interface
✅ **Safe** - No breaking changes to existing features

## Next Steps

1. **Test** the feature with real orders
2. **Try canceling** to verify no unexpected behavior
3. **Try confirming** with partial stock
4. **Download label** to verify complete workflow
5. **Provide feedback** if you find any issues

## Support

For issues or questions:
1. Check browser console for error messages (F12)
2. Review `WEBSHOP_ORDER_WORKFLOW.md` for detailed docs
3. Review `IMPLEMENTATION_SUMMARY.md` for technical details

---

**Version:** 1.0  
**Date Implemented:** October 2025  
**Status:** ✅ Ready for production
