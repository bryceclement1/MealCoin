# QR Code Redemption Flow — Spec

## Overview

Add QR code support to the existing `/redeem` page so dining workers can scan a student's wallet address instead of typing it manually. No new pages or routes are needed — both changes live entirely inside `frontend/app/redeem/page.tsx`.

---

## How It Works

The QR code encodes the student's wallet address as a plain string (e.g. `0xeC42BcA5AFc709846bbBe47b23728529FC22e939`). When the dining worker scans it, the decoded string is written into the existing `studentAddr` input field. The rest of the redeem flow (balance check, `redeemSwipe()` call, confirmation screen) is unchanged.

---

## Current State

The redeem page already has two views determined by the `approvedDining` contract check:

- **`StudentView`** — shown to non-approved wallets. Currently displays the raw wallet address as monospace text and tells the student to show it to the cashier.
- **`DiningTerminal`** — shown to approved dining wallets. Has a text input for the student's address and a Redeem button.

Both views are in `frontend/app/redeem/page.tsx`.

---

## Changes Required

### 1. Student Side — `StudentView` component

Replace the plain wallet address text block with a QR code image. Add a "Copy Address" button below it as a fallback.

**Before (current):**
```
┌─────────────────────────────┐
│  6                          │
│  swipes available this week │
└─────────────────────────────┘

┌─────────────────────────────┐
│ Your wallet address         │
│ 0xeC42...e939               │
└─────────────────────────────┘

Show this page to the dining hall cashier to redeem a swipe.
```

**After:**
```
┌─────────────────────────────┐
│  6                          │
│  swipes available this week │
└─────────────────────────────┘

┌─────────────────────────────┐
│                             │
│    [QR CODE IMAGE]          │
│                             │
│ Your wallet address         │
│ 0xeC42BcA5...e939           │
│  [Copy Address]             │
└─────────────────────────────┘

Show this QR code to the dining hall cashier to redeem a swipe.
```

**Implementation:**
- Install `react-qr-code`
- Render `<QRCode value={studentAddress} size={200} />` inside the existing border card
- Keep the full "Your wallet address" label and monospace address text below the QR code (same as current, just moved below the image)
- "Copy Address" button calls `navigator.clipboard.writeText(studentAddress)` and briefly shows "Copied!"

---

### 2. Dining Terminal Side — `DiningTerminal` component

Add a "Scan QR" button next to the wallet address input. Tapping it opens the device camera. On a successful scan, the decoded wallet address is written into `studentAddr` state (same state the input field uses). The dining worker can then press Redeem as normal.

**Before (current):**
```
Student wallet address
[ 0x...                    ]
[ Redeem Swipe             ]
```

**After:**
```
Student wallet address
[ 0x...                    ]
[ Scan QR ] [ Redeem Swipe ]
```

When "Scan QR" is tapped:
- A camera preview appears below the input (or in a modal)
- Once a valid wallet address QR is detected, the camera closes and `studentAddr` is set
- If the scanned value is not a valid address (`isAddress()` returns false), show error: "Invalid QR code — not a wallet address"
- Scanning can be cancelled with an "X" button

**Implementation:**
- Install `html5-qrcode`
- Use `Html5Qrcode` class to start/stop the camera scanner
- On `onScanSuccess`, call `isAddress(decodedText)` to validate before setting state
- Stop the scanner immediately after a successful scan

---

## Libraries

| Library | Purpose | Install |
|---------|---------|---------|
| `react-qr-code` | Render QR code SVG from a string | `npm install react-qr-code` |
| `html5-qrcode` | Camera-based QR scanner | `npm install html5-qrcode` |

---

## Files to Modify

| File | Change |
|------|--------|
| `frontend/app/redeem/page.tsx` | Add QR display to `StudentView`, add scanner to `DiningTerminal` |
| `frontend/package.json` | Add two new dependencies |

No backend, no new API routes, no contract changes.

---

## Edge Cases

| Case | Handling |
|------|----------|
| Student has 0 swipes | QR still displays — dining terminal shows "0 swipes" balance preview and blocks redeem |
| Scanned QR is not a wallet address | Show inline error, keep scanner open |
| Camera permission denied | Show message: "Camera access denied. Enter address manually." |
| Student uses Copy Address fallback | Dining worker pastes into the input field manually — existing flow unchanged |

---

## Acceptance Criteria

- Student on `/redeem` (non-approved wallet) sees a scannable QR code encoding their wallet address
- "Copy Address" button copies the full address to clipboard
- Dining worker on `/redeem` (approved wallet) can tap "Scan QR" to open the camera
- Scanning the student's QR auto-fills the wallet address input
- Invalid QR codes show an error without crashing
- Existing manual entry flow continues to work unchanged
- All UI is functional at 375px viewport
