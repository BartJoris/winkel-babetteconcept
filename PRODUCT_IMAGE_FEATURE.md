# Product Image Feature - Click to Enlarge

## Overview
Implement a performance-optimized product image display system that loads small thumbnails initially and shows enlarged images in a modal when clicked.

## Feature Requirements

### 1. **On-Demand Image Loading**
- Images are loaded **only when needed** (when an order/item is expanded)
- Batch fetch all product images for an order in a **single API call**
- Cache images locally to prevent redundant API requests
- **Zero impact** on initial page load time

### 2. **Small Thumbnail Display**
- Display **12x12px** product thumbnails in a table
- Show **placeholder icon** (📦) if image is unavailable
- Thumbnails are **clickable** with visual hover effects
- Add cursor pointer and scale animation on hover

### 3. **Click-to-Enlarge Modal**
- Clicking thumbnail opens a **beautiful modal overlay**
- Display **full-size product image** (up to 700px)
- Show **product name** in modal footer
- Add **close button** (✕) in top-right corner
- Allow closing by clicking the ✕ button or clicking outside the modal
- Smooth animations and transitions

## Implementation Architecture

### Backend API Endpoint: `/api/product-images`

**Method:** POST

**Request Body:**
```json
{
  "productIds": [1, 2, 3, 4]
}
```

**Response:**
```json
{
  "images": {
    "1": "base64_encoded_image_string",
    "2": "base64_encoded_image_string",
    "3": null,
    "4": "base64_encoded_image_string"
  }
}
```

**Implementation Details:**
- Accept array of product IDs
- Use database query or API to fetch `image_1920` field for all products
- Return images as base64-encoded strings (or null if unavailable)
- Implement error handling and session validation

### Frontend Components

#### 1. **ImageModal Component**
```typescript
interface ImageModalProps {
  image: string;              // base64 encoded image
  productName: string;
  onClose: () => void;
}

// Features:
// - Fixed overlay with semi-transparent background
// - Centered modal with rounded corners and shadow
// - Display base64 image
// - Product name in footer
// - Close button (✕)
// - Click outside to close
```

#### 2. **Product Table Row**
- Image cell contains clickable thumbnail
- Add hover effects: `cursor-pointer hover:shadow-md hover:scale-110`
- onClick handler calls `onImageClick(image, productName)`
- Shows placeholder if image unavailable

#### 3. **Parent Component State**
```typescript
// State management:
const [productImages, setProductImages] = useState<
  Record<number, Record<number, string | null>>
>({});  // {orderId: {productId: base64Image}}

const [selectedImage, setSelectedImage] = useState<
  { image: string; productName: string } | null
>(null);

// When expanding an order:
// 1. Check if images are already cached
// 2. If not cached, fetch from API
// 3. Store in productImages state
// 4. Display cached images in table
```

## Performance Optimizations

### 1. **Lazy Loading**
- ❌ Don't fetch images on page load
- ✅ Fetch images only when user expands an item
- ✅ Cache fetched images to avoid redundant requests

### 2. **Batch Fetching**
- ❌ Don't make individual API calls per product
- ✅ Collect all product IDs and fetch in one batch request
- ✅ Significant reduction in API calls

### 3. **Image Optimization**
- ✅ Use base64-encoded images (already compressed in database)
- ✅ Set reasonable size limits (12x12px for thumbnail, max 700px for modal)
- ✅ Use CSS transforms for scale effects (hardware accelerated)

### 4. **Caching Strategy**
- ✅ Store fetched images in component state keyed by item ID
- ✅ Check cache before making new API calls
- ✅ Never fetch the same item's images twice

## Code Example Structure

### API Route
```typescript
// /api/product-images
export default async function handler(req, res) {
  // 1. Validate session/auth
  // 2. Extract productIds from body
  // 3. Query database: SELECT id, image_1920 WHERE id IN (productIds)
  // 4. Build response map {productId: base64Image}
  // 5. Return JSON response
}
```

### Frontend Component
```typescript
// Component state
const [productImages, setProductImages] = useState({});
const [selectedImage, setSelectedImage] = useState(null);

// When expanding item:
const handleToggleExpand = async (itemId) => {
  setExpanded(prev => ({...prev, [itemId]: !prev[itemId]}));
  
  if (!expanded[itemId] && !productImages[itemId]) {
    // Item is being expanded and images not cached
    const productIds = item.products.map(p => p.id);
    const res = await fetch('/api/product-images', {
      method: 'POST',
      body: JSON.stringify({ productIds })
    });
    const { images } = await res.json();
    setProductImages(prev => ({
      ...prev,
      [itemId]: images
    }));
  }
}

// On image click
const handleImageClick = (image, productName) => {
  setSelectedImage({ image, productName });
}

// Render
return (
  <>
    {/* Table with clickable images */}
    <img 
      onClick={() => handleImageClick(image, name)}
      className="cursor-pointer hover:scale-110"
    />
    
    {/* Modal */}
    {selectedImage && (
      <ImageModal
        image={selectedImage.image}
        productName={selectedImage.productName}
        onClose={() => setSelectedImage(null)}
      />
    )}
  </>
);
```

## Benefits Summary

| Aspect | Benefit |
|--------|---------|
| **Performance** | Fast initial load, images load on-demand only |
| **UX** | Intuitive - click to see larger view |
| **Bandwidth** | Minimal API calls via batch fetching |
| **Caching** | Zero redundant requests per session |
| **Visual** | Smooth animations, responsive design |
| **Scalability** | Works with hundreds of products |

## Key Takeaways

1. **Never fetch images upfront** - wait for user interaction
2. **Always batch fetch** - collect IDs and send one request
3. **Cache locally** - store in component/app state
4. **Provide visual feedback** - hover effects, smooth animations
5. **Handle edge cases** - missing images, slow connections, errors

## Testing Checklist

- [ ] Initial page load has no image requests
- [ ] Expanding item triggers only ONE batch API request
- [ ] Expanding same item again uses cached images (no new request)
- [ ] Clicking image opens modal with full-size image
- [ ] Modal closes on ✕ click or outside click
- [ ] Product name displays in modal
- [ ] Works on mobile (responsive)
- [ ] Placeholder shows for missing images
- [ ] Hover effects work smoothly
