import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useRef } from "react";
import { GripVertical, ImagePlus, X } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { GlobalShortcutSection } from "@/components/global-shortcut-section";
import { DebugLoggingSection } from "@/components/debug-logging-section";
import { getBarFillLayout, getTrayIconSizePx } from "@/lib/tray-bars-icon";
import {
  AUTO_UPDATE_OPTIONS,
  DISPLAY_MODE_OPTIONS,
  MENUBAR_ICON_STYLE_OPTIONS,
  RESET_TIMER_DISPLAY_OPTIONS,
  THEME_OPTIONS,
  type AutoUpdateIntervalMinutes,
  type DisplayMode,
  type GlobalShortcut,
  type LeaderboardHandle,
  type LeaderboardToken,
  type LeaderboardWorkerUrl,
  type MenubarIconStyle,
  type ResetTimerDisplayMode,
  type ThemeMode,
} from "@/lib/settings";
import type {
  CloudflareAIDisplayMode,
  CloudflareAIWindow,
} from "@/hooks/use-cloudflare-ai-settings";
import type { TraySettingsPreview } from "@/hooks/app/use-tray-icon";
import { cn } from "@/lib/utils";

interface PluginConfig {
  id: string;
  name: string;
  enabled: boolean;
  supportsAvatar?: boolean;
  avatarUrl?: string;
}

// The leaderboard plugin aggregates and displays standings — it is not a usage
// source, so it must never list itself among the providers shared to the board.
const LEADERBOARD_PLUGIN_ID = "leaderboard";

const TRAY_PREVIEW_SIZE_PX = getTrayIconSizePx(1);

const PREVIEW_BAR_TRACK_PX = 20;

function getPreviewBarLayout(fraction: number): { fillPercent: number; remainderPercent: number } {
  const { fillW, remainderDrawW } = getBarFillLayout(PREVIEW_BAR_TRACK_PX, fraction);
  return {
    fillPercent: (fillW / PREVIEW_BAR_TRACK_PX) * 100,
    remainderPercent: (remainderDrawW / PREVIEW_BAR_TRACK_PX) * 100,
  };
}

function ProviderIconMask({
  iconUrl,
  isActive,
  sizePx,
}: {
  iconUrl?: string;
  isActive: boolean;
  sizePx: number;
}) {
  const colorClass = isActive ? "bg-primary-foreground" : "bg-foreground";
  if (iconUrl) {
    return (
      <div
        aria-hidden
        className={cn("shrink-0", colorClass)}
        style={{
          width: `${sizePx}px`,
          height: `${sizePx}px`,
          WebkitMaskImage: `url(${iconUrl})`,
          WebkitMaskSize: "contain",
          WebkitMaskRepeat: "no-repeat",
          WebkitMaskPosition: "center",
          maskImage: `url(${iconUrl})`,
          maskSize: "contain",
          maskRepeat: "no-repeat",
          maskPosition: "center",
        }}
      />
    );
  }
  const textClass = isActive ? "text-primary-foreground" : "text-foreground";
  return (
    <svg
      aria-hidden
      viewBox="0 0 26 26"
      className={cn("shrink-0", textClass)}
      style={{ width: `${sizePx}px`, height: `${sizePx}px` }}
    >
      <circle
        cx="13"
        cy="13"
        r="9"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.5"
        opacity={0.3}
      />
    </svg>
  );
}

function MenubarIconStylePreview({
  style,
  isActive,
  traySettingsPreview,
}: {
  style: MenubarIconStyle;
  isActive: boolean;
  traySettingsPreview: TraySettingsPreview;
}) {
  const textClass = isActive ? "text-primary-foreground" : "text-foreground";

  if (style === "provider") {
    return (
      <div className="inline-flex items-center gap-0.5">
        <ProviderIconMask
          iconUrl={traySettingsPreview.providerIconUrl}
          isActive={isActive}
          sizePx={TRAY_PREVIEW_SIZE_PX}
        />
        <span className={cn("text-[12px] font-semibold tabular-nums leading-none", textClass)}>
          {traySettingsPreview.providerPercentText}
        </span>
      </div>
    );
  }

  if (style === "bars") {
    const trackClass = isActive ? "bg-primary-foreground/15" : "bg-foreground/15";
    const remainderClass = isActive ? "bg-primary-foreground/20" : "bg-foreground/15";
    const fillClass = isActive ? "bg-primary-foreground" : "bg-foreground";
    const fractions =
      traySettingsPreview.bars.length > 0
        ? traySettingsPreview.bars.map((b) => b.fraction ?? 0)
        : [0.83, 0.7, 0.56];

    return (
      <div className="flex items-center">
        <div className="flex flex-col gap-0.5 w-5">
          {fractions.map((fraction, i) => {
            const { fillPercent, remainderPercent } = getPreviewBarLayout(fraction);
            return (
              <div key={i} className={cn("relative h-1 rounded-sm", trackClass)}>
                {remainderPercent > 0 && (
                  <span
                    aria-hidden
                    className={remainderClass}
                    style={{
                      position: "absolute",
                      right: 0,
                      top: 0,
                      bottom: 0,
                      width: `${remainderPercent}%`,
                      borderRadius: "1px 2px 2px 1px",
                    }}
                  />
                )}
                <div
                  className={cn("h-1", fillClass)}
                  style={{ width: `${fillPercent}%`, borderRadius: "2px 1px 1px 2px" }}
                />
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (style === "donut") {
    const fraction = traySettingsPreview.providerBars[0]?.fraction ?? 0;
    const clamped = Math.max(0, Math.min(1, fraction));
    return (
      <div className="inline-flex items-center gap-1">
        <ProviderIconMask
          iconUrl={traySettingsPreview.providerIconUrl}
          isActive={isActive}
          sizePx={TRAY_PREVIEW_SIZE_PX}
        />
        <svg
          aria-hidden
          viewBox="0 0 26 26"
          className={cn("shrink-0", textClass)}
          style={{ width: `${TRAY_PREVIEW_SIZE_PX}px`, height: `${TRAY_PREVIEW_SIZE_PX}px` }}
        >
          <circle
            cx="13"
            cy="13"
            r="9"
            fill="none"
            stroke="currentColor"
            strokeWidth="4"
            opacity={isActive ? 0.2 : 0.15}
          />
          {clamped > 0 && (
            <circle
              cx="13"
              cy="13"
              r="9"
              fill="none"
              stroke="currentColor"
              strokeWidth="4"
              strokeLinecap="butt"
              pathLength="100"
              strokeDasharray={`${Math.round(clamped * 100)} 100`}
              transform="rotate(-90 13 13)"
            />
          )}
        </svg>
      </div>
    );
  }

  return null;
}

function SortablePluginItem({
  plugin,
  onToggle,
  onAvatarChange,
}: {
  plugin: PluginConfig;
  onToggle: (id: string) => void;
  onAvatarChange?: (id: string, dataUrl: string | null) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: plugin.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      onAvatarChange?.(plugin.id, reader.result as string);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={() => onToggle(plugin.id)}
      className={cn(
        "flex items-center gap-3 px-3 py-2 rounded-md bg-card cursor-pointer",
        "border border-transparent",
        isDragging && "opacity-50 border-border",
      )}
    >
      <button
        type="button"
        onClick={(e) => e.stopPropagation()}
        className="touch-none cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground transition-colors"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <span className={cn("flex-1 text-sm", !plugin.enabled && "text-muted-foreground")}>
        {plugin.name}
      </span>

      {plugin.supportsAvatar && (
        <span className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg"
            className="sr-only"
            tabIndex={-1}
            onChange={handleFileChange}
          />
          <button
            type="button"
            title={plugin.avatarUrl ? "Change avatar" : "Set avatar"}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "size-6 rounded overflow-hidden flex items-center justify-center",
              "border border-border hover:border-foreground/40 transition-colors",
              !plugin.avatarUrl && "bg-muted",
            )}
          >
            {plugin.avatarUrl ? (
              <img src={plugin.avatarUrl} alt="" className="size-full object-cover" />
            ) : (
              <ImagePlus className="size-3.5 text-muted-foreground" />
            )}
          </button>
          {plugin.avatarUrl && (
            <button
              type="button"
              title="Remove avatar"
              onClick={() => onAvatarChange?.(plugin.id, null)}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="size-3" />
            </button>
          )}
        </span>
      )}

      {/* Wrap to stop Base UI's internal input.click() from bubbling to the row div */}
      <span onClick={(e) => e.stopPropagation()}>
        <Checkbox
          key={`${plugin.id}-${plugin.enabled}`}
          checked={plugin.enabled}
          onCheckedChange={() => onToggle(plugin.id)}
        />
      </span>
    </div>
  );
}

interface SettingsPageProps {
  plugins: PluginConfig[];
  onReorder: (orderedIds: string[]) => void;
  onToggle: (id: string) => void;
  onAvatarChange: (pluginId: string, dataUrl: string | null) => void;
  autoUpdateInterval: AutoUpdateIntervalMinutes;
  onAutoUpdateIntervalChange: (value: AutoUpdateIntervalMinutes) => void;
  themeMode: ThemeMode;
  onThemeModeChange: (value: ThemeMode) => void;
  displayMode: DisplayMode;
  onDisplayModeChange: (value: DisplayMode) => void;
  resetTimerDisplayMode: ResetTimerDisplayMode;
  onResetTimerDisplayModeChange: (value: ResetTimerDisplayMode) => void;
  menubarIconStyle: MenubarIconStyle;
  onMenubarIconStyleChange: (value: MenubarIconStyle) => void;
  traySettingsPreview: TraySettingsPreview;
  globalShortcut: GlobalShortcut;
  onGlobalShortcutChange: (value: GlobalShortcut) => void;
  startOnLogin: boolean;
  onStartOnLoginChange: (value: boolean) => void;
  telemetryOptIn: boolean;
  onTelemetryOptInChange: (value: boolean) => void;
  // Leaderboard
  leaderboardHandle: LeaderboardHandle;
  leaderboardToken: LeaderboardToken;
  leaderboardWorkerUrl: LeaderboardWorkerUrl;
  leaderboardOptIn: boolean;
  leaderboardShareList: string[];
  onLeaderboardHandleChange: (value: LeaderboardHandle) => void;
  onLeaderboardTokenChange: (value: LeaderboardToken) => void;
  onLeaderboardWorkerUrlChange: (value: LeaderboardWorkerUrl) => void;
  onLeaderboardOptInChange: (value: boolean) => void;
  onLeaderboardShareListChange: (value: string[]) => void;
  // Cloudflare AI
  cloudflareAIDisplay: CloudflareAIDisplayMode;
  cloudflareAIShowLimit: boolean;
  cloudflareAICapOverride: number | null;
  cloudflareAIGatewayUrl: string | null;
  cloudflareAIRouterKey: string | null;
  cloudflareAIWindow: CloudflareAIWindow;
  onCloudflareAIDisplayChange: (value: CloudflareAIDisplayMode) => void;
  onCloudflareAIShowLimitChange: (value: boolean) => void;
  onCloudflareAICapOverrideChange: (value: number | null) => void;
  onCloudflareAIGatewayUrlChange: (value: string | null) => void;
  onCloudflareAIRouterKeyChange: (value: string | null) => void;
  onCloudflareAIWindowChange: (value: CloudflareAIWindow) => void;
}

export function SettingsPage({
  plugins,
  onReorder,
  onToggle,
  onAvatarChange,
  autoUpdateInterval,
  onAutoUpdateIntervalChange,
  themeMode,
  onThemeModeChange,
  displayMode,
  onDisplayModeChange,
  resetTimerDisplayMode,
  onResetTimerDisplayModeChange,
  menubarIconStyle,
  onMenubarIconStyleChange,
  traySettingsPreview,
  globalShortcut,
  onGlobalShortcutChange,
  startOnLogin,
  onStartOnLoginChange,
  telemetryOptIn,
  onTelemetryOptInChange,
  leaderboardHandle,
  leaderboardToken,
  leaderboardWorkerUrl,
  leaderboardOptIn,
  leaderboardShareList,
  onLeaderboardHandleChange,
  onLeaderboardTokenChange,
  onLeaderboardWorkerUrlChange,
  onLeaderboardOptInChange,
  onLeaderboardShareListChange,
  // Cloudflare AI
  cloudflareAIDisplay,
  cloudflareAIShowLimit,
  cloudflareAICapOverride,
  cloudflareAIGatewayUrl,
  cloudflareAIRouterKey,
  cloudflareAIWindow,
  onCloudflareAIDisplayChange,
  onCloudflareAIShowLimitChange,
  onCloudflareAICapOverrideChange,
  onCloudflareAIGatewayUrlChange,
  onCloudflareAIRouterKeyChange,
  onCloudflareAIWindowChange,
}: SettingsPageProps) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // The leaderboard plugin is the board itself, not a usage source — exclude it
  // from the "Providers to Share" list (it stays in the draggable lineup below).
  const shareableProviders = plugins.filter((plugin) => plugin.id !== LEADERBOARD_PLUGIN_ID);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = plugins.findIndex((item) => item.id === active.id);
      const newIndex = plugins.findIndex((item) => item.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;
      const next = arrayMove(plugins, oldIndex, newIndex);
      onReorder(next.map((item) => item.id));
    }
  };

  return (
    <div className="py-3 space-y-4">
      <section>
        <h3 className="text-lg font-semibold mb-0">Auto Refresh</h3>
        <p className="text-sm text-muted-foreground mb-2">How obsessive are you</p>
        <div className="bg-muted/50 rounded-lg p-1">
          <div className="flex gap-1" role="radiogroup" aria-label="Auto-update interval">
            {AUTO_UPDATE_OPTIONS.map((option) => {
              const isActive = option.value === autoUpdateInterval;
              return (
                <Button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={isActive}
                  variant={isActive ? "default" : "outline"}
                  size="sm"
                  className="flex-1"
                  onClick={() => onAutoUpdateIntervalChange(option.value)}
                >
                  {option.label}
                </Button>
              );
            })}
          </div>
        </div>
      </section>
      <section>
        <h3 className="text-lg font-semibold mb-0">Usage Mode</h3>
        <p className="text-sm text-muted-foreground mb-2">Glass half full or half empty</p>
        <div className="bg-muted/50 rounded-lg p-1">
          <div className="flex gap-1" role="radiogroup" aria-label="Usage display mode">
            {DISPLAY_MODE_OPTIONS.map((option) => {
              const isActive = option.value === displayMode;
              return (
                <Button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={isActive}
                  variant={isActive ? "default" : "outline"}
                  size="sm"
                  className="flex-1"
                  onClick={() => onDisplayModeChange(option.value)}
                >
                  {option.label}
                </Button>
              );
            })}
          </div>
        </div>
      </section>
      <section>
        <h3 className="text-lg font-semibold mb-0">Reset Timers</h3>
        <p className="text-sm text-muted-foreground mb-2">Countdown or clock time</p>
        <div className="bg-muted/50 rounded-lg p-1">
          <div className="flex gap-1" role="radiogroup" aria-label="Reset timer display mode">
            {RESET_TIMER_DISPLAY_OPTIONS.map((option) => {
              const isActive = option.value === resetTimerDisplayMode;
              const absoluteTimeExample = new Intl.DateTimeFormat(undefined, {
                hour: "numeric",
                minute: "2-digit",
              }).format(new Date(2026, 1, 2, 11, 4));
              const example =
                option.value === "relative" ? "5h 12m" : `today at ${absoluteTimeExample}`;
              return (
                <Button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={isActive}
                  variant={isActive ? "default" : "outline"}
                  size="sm"
                  className="flex-1 flex flex-col items-center gap-0 py-2 h-auto"
                  onClick={() => onResetTimerDisplayModeChange(option.value)}
                >
                  <span>{option.label}</span>
                  <span
                    className={cn(
                      "text-xs font-normal",
                      isActive ? "text-primary-foreground/80" : "text-muted-foreground",
                    )}
                  >
                    {example}
                  </span>
                </Button>
              );
            })}
          </div>
        </div>
      </section>
      <section>
        <h3 className="text-lg font-semibold mb-0">Menubar Icon</h3>
        <p className="text-sm text-muted-foreground mb-2">What shows in the menu bar</p>
        <div className="bg-muted/50 rounded-lg p-1">
          <div className="flex gap-1" role="radiogroup" aria-label="Menubar icon style">
            {MENUBAR_ICON_STYLE_OPTIONS.map((option) => {
              const isActive = option.value === menubarIconStyle;
              return (
                <Button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-label={option.label}
                  aria-checked={isActive}
                  variant={isActive ? "default" : "outline"}
                  size="sm"
                  className="flex-1 h-9 flex items-center justify-center"
                  onClick={() => onMenubarIconStyleChange(option.value)}
                >
                  <MenubarIconStylePreview
                    style={option.value}
                    isActive={isActive}
                    traySettingsPreview={traySettingsPreview}
                  />
                </Button>
              );
            })}
          </div>
        </div>
      </section>
      <section>
        <h3 className="text-lg font-semibold mb-0">App Theme</h3>
        <p className="text-sm text-muted-foreground mb-2">How it looks around here</p>
        <div className="bg-muted/50 rounded-lg p-1">
          <div className="flex gap-1" role="radiogroup" aria-label="Theme mode">
            {THEME_OPTIONS.map((option) => {
              const isActive = option.value === themeMode;
              return (
                <Button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={isActive}
                  variant={isActive ? "default" : "outline"}
                  size="sm"
                  className="flex-1"
                  onClick={() => onThemeModeChange(option.value)}
                >
                  {option.label}
                </Button>
              );
            })}
          </div>
        </div>
      </section>
      <GlobalShortcutSection
        globalShortcut={globalShortcut}
        onGlobalShortcutChange={onGlobalShortcutChange}
      />
      <section>
        <h3 className="text-lg font-semibold mb-0">Start on Login</h3>
        <p className="text-sm text-muted-foreground mb-2">PaceBar starts when you sign in</p>
        <label className="flex items-center gap-2 text-sm select-none text-foreground">
          <Checkbox
            key={`start-on-login-${startOnLogin}`}
            checked={startOnLogin}
            onCheckedChange={(checked) => onStartOnLoginChange(checked === true)}
          />
          Start on login
        </label>
      </section>
      <section>
        <h3 className="text-lg font-semibold mb-0">Anonymous Usage</h3>
        <p className="text-sm text-muted-foreground mb-2">
          Off by default. When on, PaceBar shares a random anonymous id plus your app version and OS
          — once a day — so we can see which versions are in use. No account, no personal data.
          Turning it off stops sharing immediately.
        </p>
        <label className="flex items-center gap-2 text-sm select-none text-foreground">
          <Checkbox
            key={`telemetry-opt-in-${telemetryOptIn}`}
            checked={telemetryOptIn}
            onCheckedChange={(checked) => onTelemetryOptInChange(checked === true)}
          />
          Share anonymous usage stats
        </label>
      </section>
      <section>
        <h3 className="text-lg font-semibold mb-0">Leaderboard</h3>
        <p className="text-sm text-muted-foreground mb-2">
          Hack Night standings powered by your usage
        </p>
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Display Name
            </label>
            <input
              type="text"
              value={leaderboardHandle ?? ""}
              onChange={(e) => onLeaderboardHandleChange(e.target.value || null)}
              placeholder="alie"
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Worker URL
            </label>
            <input
              type="text"
              value={leaderboardWorkerUrl ?? ""}
              onChange={(e) => onLeaderboardWorkerUrlChange(e.target.value || null)}
              placeholder="https://leaderboard.your-subdomain.workers.dev"
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Invite Token
            </label>
            <input
              type="password"
              value={leaderboardToken ?? ""}
              onChange={(e) => onLeaderboardTokenChange(e.target.value || null)}
              placeholder="Paste token from organizer"
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <label className="flex items-center gap-2 text-sm select-none text-foreground">
            <Checkbox
              key={`leaderboard-opt-in-${leaderboardOptIn}`}
              checked={leaderboardOptIn}
              onCheckedChange={(checked) => onLeaderboardOptInChange(checked === true)}
            />
            Share my usage during hack nights
          </label>
          {shareableProviders.length > 0 && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Providers to Share
              </label>
              <div className="space-y-1">
                {shareableProviders.map((plugin) => {
                  const isShared = leaderboardShareList.includes(plugin.id);
                  return (
                    <label
                      key={plugin.id}
                      className="flex items-center gap-2 text-sm select-none text-foreground"
                    >
                      <Checkbox
                        checked={isShared}
                        onCheckedChange={(checked) => {
                          if (checked === true) {
                            onLeaderboardShareListChange([...leaderboardShareList, plugin.id]);
                          } else {
                            onLeaderboardShareListChange(
                              leaderboardShareList.filter((id) => id !== plugin.id),
                            );
                          }
                        }}
                      />
                      {plugin.name}
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </section>
      <section>
        <h3 className="text-lg font-semibold mb-0">Cloudflare AI (Gateway)</h3>
        <p className="text-sm text-muted-foreground mb-2">Connect your self-hosted AI gateway</p>
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Gateway URL
            </label>
            <input
              type="text"
              value={cloudflareAIGatewayUrl ?? ""}
              onChange={(e) => onCloudflareAIGatewayUrlChange(e.target.value || null)}
              placeholder="https://your-gateway.workers.dev"
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Router Key
            </label>
            <input
              type="password"
              value={cloudflareAIRouterKey ?? ""}
              onChange={(e) => onCloudflareAIRouterKeyChange(e.target.value || null)}
              placeholder="Your gateway secret key"
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Token Window (menu bar)
            </label>
            <div className="bg-muted/50 rounded-lg p-1">
              <div className="flex gap-1" role="radiogroup" aria-label="Cloudflare AI token window">
                {[
                  { value: "1h" as CloudflareAIWindow, label: "Last hour" },
                  { value: "24h" as CloudflareAIWindow, label: "Last 24h" },
                  { value: "7d" as CloudflareAIWindow, label: "Last 7d" },
                ].map((option) => {
                  const isActive = option.value === cloudflareAIWindow;
                  return (
                    <Button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={isActive}
                      variant={isActive ? "default" : "outline"}
                      size="sm"
                      className="flex-1"
                      onClick={() => onCloudflareAIWindowChange(option.value)}
                    >
                      {option.label}
                    </Button>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Display
            </label>
            <div className="bg-muted/50 rounded-lg p-1">
              <div className="flex gap-1" role="radiogroup" aria-label="Cloudflare AI display mode">
                {[
                  { value: "spent" as CloudflareAIDisplayMode, label: "Spent" },
                  { value: "remaining" as CloudflareAIDisplayMode, label: "Remaining" },
                  { value: "burn" as CloudflareAIDisplayMode, label: "Daily burn" },
                  { value: "percent" as CloudflareAIDisplayMode, label: "Percent" },
                ].map((option) => {
                  const isActive = option.value === cloudflareAIDisplay;
                  return (
                    <Button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={isActive}
                      variant={isActive ? "default" : "outline"}
                      size="sm"
                      className="flex-1"
                      onClick={() => onCloudflareAIDisplayChange(option.value)}
                    >
                      {option.label}
                    </Button>
                  );
                })}
              </div>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm select-none text-foreground">
            <Checkbox
              checked={cloudflareAIShowLimit}
              onCheckedChange={(checked) => onCloudflareAIShowLimitChange(checked === true)}
            />
            Show limit (e.g. "$31 of $50,000")
          </label>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Custom cap / limit (USD)
            </label>
            <input
              type="number"
              value={cloudflareAICapOverride ?? ""}
              onChange={(e) => {
                const val = e.target.value;
                onCloudflareAICapOverrideChange(val ? Number(val) : null);
              }}
              placeholder="Leave empty to use gateway's cap"
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        </div>
      </section>
      <DebugLoggingSection />
      <section>
        <h3 className="text-lg font-semibold mb-0">Plugins</h3>
        <p className="text-sm text-muted-foreground mb-2">Your AI coding lineup</p>
        <div className="bg-muted/50 rounded-lg p-1 space-y-1">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={plugins.map((p) => p.id)}
              strategy={verticalListSortingStrategy}
            >
              {plugins.map((plugin) => (
                <SortablePluginItem
                  key={plugin.id}
                  plugin={plugin}
                  onToggle={onToggle}
                  onAvatarChange={onAvatarChange}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>
      </section>
    </div>
  );
}
