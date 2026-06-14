# Mobile Capture Checklist — UI Baseline

## Real device required

**Capture on a physical iOS or Android device, NOT a simulator.**

Simulator styling differs subtly from real-device rendering (Pitfall 6 from R1-RESEARCH.md). The baseline must reflect exactly what members see on a real phone so post-redesign after-state captures are a valid comparison.

---

## How to capture

1. Install **Expo Go** from the App Store or Google Play on your physical phone.
2. Open Expo Go and scan the QR code for the GymClassOS member app (pointed at the live API at `https://gym-class-os.vercel.app`).
3. Log in via the **member picker** screen — select the demo member account.
4. Navigate to each screen listed in the checklist table below.
5. Take a screenshot on the phone using the native screenshot gesture:
   - iOS: Side button + Volume Up (or AssistiveTouch)
   - Android: Power + Volume Down (or use the quick-settings screenshot tile)
6. Transfer the screenshots to this machine:
   - iOS: AirDrop to Mac, or USB → Finder/Photos
   - Android: USB → Windows Explorer, or Google Photos → download
7. Rename each file to the **exact filename** shown in the table (lowercase, hyphens, `.png` extension).
8. Drop all 8 files into `.planning/ui-reviews/baseline/mobile/` in the repo.

---

## Checklist

| # | Screen | How to reach it | Target filename | Captured? |
|---|--------|----------------|-----------------|-----------|
| 1 | Home tab | Open app — default landing tab | `tab-home.png` | [ ] |
| 2 | Schedule tab (class browser) | Tap the **Schedule** tab in the bottom nav | `tab-schedule.png` | [ ] |
| 3 | Food tab (calorie log) | Tap the **Food** tab in the bottom nav | `tab-food.png` | [ ] |
| 4 | Profile tab | Tap the **Profile** tab in the bottom nav | `tab-profile.png` | [ ] |
| 5 | Member picker | Tap your avatar or go to Profile → Switch Member (or the first-launch picker screen) | `pick-member.png` | [ ] |
| 6 | Food search screen | On the Food tab, tap the **+** button to add food | `food-add.png` | [ ] |
| 7 | Barcode scanner screen | Inside the food-add screen, tap the barcode/camera icon | `food-barcode.png` | [ ] |
| 8 | Agent chat sheet | Tap the **floating action button (FAB)** on any tab to open the agent chat sheet | `agent-sheet.png` | [ ] |

---

## Confirmation

Once all 8 PNGs are in `.planning/ui-reviews/baseline/mobile/`, type **"mobile captured"** to resume the plan (or describe which screens you could not capture and why — any gap will be recorded in INDEX.md as a known intentional absence rather than a silent omission).

---

## Filename reference

```
.planning/ui-reviews/baseline/mobile/
├── tab-home.png
├── tab-schedule.png
├── tab-food.png
├── tab-profile.png
├── pick-member.png
├── food-add.png
├── food-barcode.png
└── agent-sheet.png
```
