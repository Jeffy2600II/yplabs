// Path:    src/lib/adminCache.ts
// Purpose: Thin wrapper around dataCore for admin pages.
//          Kept for import compatibility — useAuthData() from dataCore.ts now
//          handles token management natively. This file is a pass-through.
// Used by: admin/duty/page.tsx, admin/page.tsx, admin/requests/page.tsx, admin/zones/page.tsx

export {
  useAuthData as useAdminCache,
  invalidate,
  invalidate as invalidateCache,
} from './dataCore';