# FundRoom.ai Mobile Test Checklist

**Created:** February 16, 2026
**Purpose:** Device-specific test cases for LP-facing mobile flows

## Prerequisites
- Chrome DevTools → Device Toolbar → Select device
- Or use physical device with remote debugging
- Test both portrait and landscape orientations

---

## iPhone Safari (375px width — iPhone SE)

### LP Onboarding Wizard (all 9 steps)
- [ ] Step 1 (Your Info): All inputs render without horizontal scroll, text inputs are 16px+ (no iOS zoom)
- [ ] Step 2 (Entity): InvestorTypeStep entity cards stack vertically, all touch targets >= 44px
- [ ] Step 3 (Address): Grid layout (city/state, zip/country) fits within 375px
- [ ] Step 4 (Accreditation): Accreditation method cards have adequate touch area (min-h-[44px])
- [ ] Step 4 (506c): Source of Funds dropdown and Occupation field use 16px+ font
- [ ] Step 5 (Agreement): NDA text scrollable within container, checkbox label tappable
- [ ] Step 6 (Commitment): Tranche info card fits viewport, units input has numeric keyboard
- [ ] Step 6 (Commitment): All 8 investor representation checkboxes have >= 44px touch area
- [ ] Step 7 (Sign Docs): SequentialSigningFlow document cards render correctly
- [ ] Step 8 (Funding): Wire instructions card fits viewport, copy buttons tappable (44px)
- [ ] Step 8 (Funding): File upload drag-drop zone shows "Tap to upload" text, camera option appears
- [ ] Step 9 (Verify): Completion screen renders centered
- [ ] Step indicator (top): Scrollable horizontally without page scroll, circles 32-36px

### Signature Pad
- [ ] Canvas fills viewport width (no horizontal overflow)
- [ ] Draw mode captures touch input correctly (no page scroll while drawing)
- [ ] Type mode shows cursive preview, input has 16px+ font
- [ ] Upload mode accepts camera capture on mobile
- [ ] Signature capture modal doesn't overflow viewport (max-w-[calc(100vw-2rem)])
- [ ] Tab triggers (Draw/Type/Upload) have 44px touch targets

### Wire Proof Upload
- [ ] Camera capture option appears in file picker (`accept="image/*"`)
- [ ] Upload progress indicator visible
- [ ] Amount/Date/Reference fields use 16px+ font (text-base on mobile)
- [ ] File type/size error messages display correctly

### File Upload (Documents)
- [ ] Drag-drop zone falls back to file picker on tap
- [ ] Document type selector readable at 375px
- [ ] Upload modal fits viewport (max-w-[calc(100vw-2rem)])

### Forms (Global)
- [ ] No iOS zoom on any input focus (all inputs >= 16px / text-base)
- [ ] All text inputs have appropriate `autoComplete` attributes
- [ ] ZIP code input has `inputMode="numeric"` for numeric keyboard
- [ ] Phone input has `inputMode="tel"`
- [ ] Dollar amount inputs have `inputMode="decimal"`

### Buttons (Global)
- [ ] All primary CTAs are >= 44px tap target (min-h-[44px])
- [ ] Back/Next navigation buttons have adequate tap area
- [ ] No buttons overlap or are too close together (min 8px gap)

### Modals (Global)
- [ ] NDA/Accreditation modal doesn't overflow viewport
- [ ] Upload document modal scrollable if content exceeds viewport
- [ ] ESIGN/UETA confirmation modal renders correctly
- [ ] All modals can be dismissed (close button accessible)

### LP Dashboard
- [ ] Summary cards stack in 2-column grid on mobile
- [ ] Quick action buttons stack vertically or in 2-column grid
- [ ] Investment status tracker scrollable horizontally
- [ ] Transaction history list items don't overflow
- [ ] Refresh button accessible in header
- [ ] Nav bar backdrop-blur renders correctly

### Navigation
- [ ] Top nav bar doesn't obscure content (sticky with proper z-index)
- [ ] No hidden elements behind iOS safe area (bottom bar, notch)
- [ ] Sign Out button accessible
- [ ] "Back to Dashboard" links work correctly

---

## Android Chrome (412px width — Pixel 7)

### Same as iPhone Safari above, plus:
- [ ] Back button behavior doesn't break wizard state (popstate handling)
- [ ] File upload works with Android camera intent
- [ ] Signature canvas renders correctly (Pointer Events work on Android)
- [ ] Select/dropdown elements render native Android picker
- [ ] No content hidden behind Android navigation bar

---

## Tablet (768px — iPad Mini)

### Layout
- [ ] LP Dashboard uses 2-column layout for fund cards
- [ ] Onboarding wizard centered with max-w-lg constraint
- [ ] Signature pad has adequate drawing area
- [ ] Tables/grids use responsive breakpoints correctly

---

## Common Patterns to Verify

### iOS Zoom Prevention
All text inputs must use `text-base sm:text-sm` pattern:
- `text-base` = 16px on mobile (prevents iOS zoom)
- `sm:text-sm` = 14px on desktop (compact look)

### Touch Target Compliance
All interactive elements must have `min-h-[44px]`:
- Buttons
- Checkboxes (with label wrapper)
- Select triggers
- File upload zones
- Tab triggers

### Responsive Grid Patterns
- `grid-cols-1 sm:grid-cols-2` for card layouts
- `grid-cols-2 gap-3` for city/state, zip/country pairs
- `flex flex-col sm:flex-row` for button groups

---

## Known Issues & Fixes Applied

| Issue | File | Fix |
|-------|------|-----|
| SelectTrigger missing text-base | upload-document-modal.tsx | Added `text-base sm:text-sm` |
| Input/Textarea missing responsive font | upload-document-modal.tsx | Added `text-base sm:text-sm` |
| TabsTrigger missing font override | enhanced-signature-pad.tsx | Added responsive sizing |
| Font buttons fixed padding | enhanced-signature-pad.tsx | Added responsive padding |

---

## Test Results

| Device | Tester | Date | Pass/Fail | Notes |
|--------|--------|------|-----------|-------|
| iPhone SE (375px) | — | — | — | — |
| Pixel 7 (412px) | — | — | — | — |
| iPad Mini (768px) | — | — | — | — |

*Fill in during on-device testing.*
