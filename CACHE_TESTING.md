# Hybrid Cache Testing Guide

## What Was Implemented

### Architecture
- **Primary Storage**: IndexedDB (can handle 100-200+ images, ~50-100MB)
- **Fallback Storage**: localStorage (handles 10-20 images, ~5-10MB)
- **Auto-Expiration**: 24 hours for security
- **Debounced Saves**: 500ms delay to avoid excessive writes

### Security Features
✅ Only stores non-sensitive data (no API keys, tokens)
✅ Auto-expires after 24 hours
✅ Graceful degradation (IndexedDB → localStorage → memory-only)
✅ Works in private browsing mode (falls back to localStorage)

---

## Testing Checklist

### Local Testing (Before Production)

#### Test 1: Basic Cache Functionality
1. **Run dev server**: `cd frontend && npm run dev`
2. **Upload 3-5 images** to create a session
3. **Verify console logs**: Should see `[CACHE:IDB] Saved X images`
4. **Refresh page** (F5 or Ctrl+R)
5. ✅ **Expected**: All images should restore instantly
6. ✅ **Console should show**: `[APP] Restored session from cache`

#### Test 2: IndexedDB Verification
1. Open **Chrome DevTools** → **Application** tab
2. Look for **IndexedDB** → `VisionPulseCache` database
3. ✅ **Expected**: `sessions` object store with `current_session` entry
4. Click on entry to inspect stored data
5. ✅ **Verify**: `sessionId`, `images` array, `savedAt` timestamp

#### Test 3: localStorage Fallback
1. Open **Chrome DevTools** → **Application** tab
2. **Delete IndexedDB** database: Right-click `VisionPulseCache` → Delete
3. Refresh page - images should still load (from localStorage backup)
4. Upload new images
5. ✅ **Console should show**: `[CACHE:LS] Saved X images (fallback)`

#### Test 4: Cache Expiration (Optional)
1. Open **DevTools** → **Application** → **IndexedDB** → `VisionPulseCache`
2. Find `savedAt` field in stored data
3. Change it to 48 hours ago: `"2024-11-16T..."`
4. Refresh page
5. ✅ **Expected**: Cache should clear, landing page shows

#### Test 5: Reset Functionality
1. Upload images to create session
2. Click **Home** button (top right)
3. ✅ **Expected**: All images cleared, landing page shows
4. **DevTools** → Check IndexedDB is empty
5. ✅ **Console should show**: `[APP] Session reset, cache cleared`

---

### Production Testing (Vercel + Fly.io)

#### Test 6: Production Deployment
1. Wait 2-3 minutes for Vercel to deploy
2. Visit: `https://vision-pulse-ag.vercel.app`
3. Upload 5-10 images
4. ✅ **Verify**: Base64 inference works (no CORS errors)
5. ✅ **Console**: Should see `[CACHE:IDB] Saved X images`

#### Test 7: Session Persistence in Production
1. On production site, upload images
2. **Close browser tab completely**
3. Re-open production URL in new tab
4. ✅ **Expected**: All images restore immediately
5. Navigate between images using ← Previous / Next →
6. ✅ **Expected**: Instant switching (no re-inference)

#### Test 8: Multi-Image Batch Upload
1. Upload 20-30 images in one batch
2. Wait for all to process
3. ✅ **Verify**: Gallery shows all 20-30 images
4. Refresh page
5. ✅ **Expected**: All 20-30 images restore
6. ✅ **Console**: `[CACHE:IDB] Loaded X images`

#### Test 9: Mobile Testing (Optional)
1. Open production site on mobile device
2. Upload 3-5 images
3. Close browser app completely (swipe away)
4. Re-open browser and navigate to site
5. ✅ **Expected**: Session should restore on mobile too

#### Test 10: Cross-Browser Testing
Test on different browsers:
- ✅ **Chrome/Edge**: Full IndexedDB support
- ✅ **Firefox**: Full IndexedDB support
- ✅ **Safari**: IndexedDB support (may have smaller quota)
- ✅ **Private/Incognito**: Falls back to localStorage

---

## Monitoring & Debugging

### Check Cache Status
```javascript
// In browser console (DevTools):

// Check IndexedDB size
indexedDB.databases().then(console.log)

// Manually load cache
import { loadSessionCache } from './utils/cache'
loadSessionCache().then(console.log)

// Check localStorage fallback
console.log(localStorage.getItem('visionpulse_session_cache'))
```

### Common Issues

**Issue**: "IndexedDB not available"
- ✅ **Solution**: Falls back to localStorage automatically
- May happen in private browsing or Safari

**Issue**: "QuotaExceededError"
- ✅ **Solution**: Cache auto-prunes to 200 images max
- Keeps only most recent images if quota exceeded

**Issue**: Images not restoring after refresh
- Check console for errors
- Verify IndexedDB exists in DevTools
- Try clearing cache and re-uploading

---

## Performance Expectations

| Scenario | Cache Type | Load Time | Notes |
|----------|-----------|-----------|-------|
| 10 images | IndexedDB | <200ms | Instant |
| 50 images | IndexedDB | <500ms | Very fast |
| 100 images | IndexedDB | <1s | Still good |
| 200 images | IndexedDB | <2s | Max recommended |
| 10 images | localStorage | <100ms | Instant |
| 20+ images | localStorage | May fail | Quota issues |

---

## Security Checklist

✅ No API keys or tokens stored in cache
✅ No backend session cookies stored
✅ Only public image data (base64) and box coordinates
✅ Auto-expires after 24 hours
✅ User can manually clear via "Home" button
✅ Works with CORS policies (no cross-origin data)
✅ Safe for public-facing deployment

---

## Rollback Plan (If Needed)

If cache causes issues in production:

1. **Quick Fix**: Remove cache integration temporarily
   ```bash
   git revert HEAD
   git push origin main
   ```

2. **Disable Cache Only**: Comment out in `App.tsx`
   ```tsx
   // Comment these lines:
   // useEffect(() => { restoreCache() }, [])
   // useEffect(() => { saveSessionCache() }, [sessionId, imageHistory])
   ```

3. **Verify**: App still works without cache (just no persistence)

---

## Success Criteria

✅ Build succeeds with no TypeScript errors
✅ Production deploys successfully to Vercel
✅ Images persist across page refreshes
✅ No CORS errors with Fly.io backend
✅ Cache auto-saves within 500ms of changes
✅ Cache clears on "Home" button click
✅ Works in both Chrome and Firefox
✅ Handles 50+ images without performance issues
✅ Falls back gracefully if IndexedDB unavailable

---

## Next Steps After Testing

1. ✅ Monitor Vercel deployment logs
2. ✅ Test on production URL with real uploads
3. ✅ Verify Fly.io backend logs show base64 inference
4. ✅ Check browser DevTools for cache entries
5. 🚀 Cache is production-ready if all tests pass!

---

## Notes

- **Cache Version**: v1 (includes migration support for future updates)
- **Max Images**: 200 (auto-prunes older images)
- **Expiry**: 24 hours
- **Debounce**: 500ms (prevents excessive saves)
- **Storage**: IndexedDB (primary) → localStorage (fallback) → memory (no persistence)
