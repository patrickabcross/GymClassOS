// Spike result (D2-01 Task 2, 2026-05-19):
//
// CHOSEN: @gorhom/bottom-sheet 5.2.14 + Reanimated 4.3.1 + gesture-handler 2.31.2
//
// Why gorhom over RN Modal fallback:
//   - All peer deps satisfied via `npx expo install` (SDK 55-blessed versions).
//   - Pitfall #4 mitigation is in place: babel.config.js declares
//     "react-native-worklets/plugin" — the Reanimated 4 worklets split that broke
//     bottom-sheet in older configs is the *exact* issue this plugin fixes.
//   - D2-06 agent surface gets swipe-down-to-dismiss + buttery animation without
//     extra work (one of the "feels native" wow moments for the demo).
//
// File extension note: this file is `.ts` (per plan artifact spec). React
// elements are built with `React.createElement` calls rather than JSX so the
// TypeScript compiler accepts it under `jsx: "react-native"` (JSX is only
// parsable in `.tsx`). Importers use `from "../lib/bottom-sheet-impl"`
// (extension-omitted).
//
// If D2-06 hits a worklet runtime error in Expo Go, swap to the RN Modal fallback
// by replacing this file's body with the Option B implementation documented in
// the plan (D2-01 Task 2, Option B). Both options export the same
// AgentSheetContainer + GestureRoot shape, so D2-06 needs no code changes.
import React from "react";
import BottomSheet, { BottomSheetView } from "@gorhom/bottom-sheet";
import { GestureHandlerRootView } from "react-native-gesture-handler";

export function GestureRoot({ children }: { children: React.ReactNode }) {
  return React.createElement(GestureHandlerRootView, {
    style: { flex: 1 },
    children,
  });
}

export type AgentSheetContainerProps = {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
};

export function AgentSheetContainer({
  open,
  onClose,
  children,
}: AgentSheetContainerProps) {
  const ref = React.useRef<BottomSheet>(null);
  React.useEffect(() => {
    if (open) ref.current?.expand();
    else ref.current?.close();
  }, [open]);
  return React.createElement(BottomSheet, {
    ref,
    index: open ? 0 : -1,
    snapPoints: ["90%"],
    enablePanDownToClose: true,
    onClose,
    // Keyboard coordination: interactive tracks the keyboard so the composer
    // stays visible; restore returns to the snap point on blur;
    // adjustResize prevents Android from squishing the sheet behind the IME.
    keyboardBehavior: "interactive",
    keyboardBlurBehavior: "restore",
    android_keyboardInputMode: "adjustResize",
    backgroundStyle: { backgroundColor: "#1a1a1a" },
    handleIndicatorStyle: { backgroundColor: "#333" },
    children: React.createElement(BottomSheetView, {
      style: { flex: 1 },
      children,
    }),
  });
}

export const BOTTOM_SHEET_IMPL: "gorhom" | "rn-modal" = "gorhom";
