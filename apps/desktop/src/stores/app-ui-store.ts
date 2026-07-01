import { create } from "zustand";
import type { ActiveView } from "@/components/side-nav";

type AppUiStore = {
  activeView: ActiveView;
  showAbout: boolean;
  // One-time post-upgrade surfaces. `showWhatsNew` renders this version's
  // release notes after an update; `showTelemetryNotice` renders the opt-in
  // telemetry disclosure until the user acknowledges it. Both are evaluated at
  // startup by use-settings-bootstrap.
  showWhatsNew: boolean;
  showTelemetryNotice: boolean;
  setActiveView: (view: ActiveView) => void;
  setShowAbout: (value: boolean) => void;
  setShowWhatsNew: (value: boolean) => void;
  setShowTelemetryNotice: (value: boolean) => void;
  resetState: () => void;
};

const initialState = {
  activeView: "home" as ActiveView,
  showAbout: false,
  showWhatsNew: false,
  showTelemetryNotice: false,
};

export const useAppUiStore = create<AppUiStore>((set) => ({
  ...initialState,
  setActiveView: (view) => set({ activeView: view }),
  setShowAbout: (value) => set({ showAbout: value }),
  setShowWhatsNew: (value) => set({ showWhatsNew: value }),
  setShowTelemetryNotice: (value) => set({ showTelemetryNotice: value }),
  resetState: () => set(initialState),
}));
