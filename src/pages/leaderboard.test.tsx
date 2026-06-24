import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LeaderboardPage } from "./leaderboard";
import { useAppPreferencesStore } from "@/stores/app-preferences-store";
import {
  fetchCurrentHacknight,
  fetchLeaderboard,
  fetchModelLeaderboard,
} from "@/lib/leaderboard-api";

vi.mock("@/hooks/use-now-ticker", () => ({
  useNowTicker: () => 0,
}));

vi.mock("@/lib/leaderboard-api", () => ({
  fetchCurrentHacknight: vi.fn(),
  fetchLeaderboard: vi.fn(),
  fetchModelLeaderboard: vi.fn(),
  fetchHacknightWinners: vi.fn(),
}));

const mockedFetchCurrentHacknight = vi.mocked(fetchCurrentHacknight);
const mockedFetchLeaderboard = vi.mocked(fetchLeaderboard);
const mockedFetchModelLeaderboard = vi.mocked(fetchModelLeaderboard);

function setStore(overrides: {
  leaderboardWorkerUrl?: string | null;
  leaderboardOptIn?: boolean;
  leaderboardHandle?: string | null;
  leaderboardToken?: string | null;
}) {
  useAppPreferencesStore.setState(overrides);
}

describe("LeaderboardPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppPreferencesStore.getState().resetState();
    mockedFetchCurrentHacknight.mockResolvedValue({
      active: false,
      upcoming: [],
    });
    mockedFetchLeaderboard.mockResolvedValue({
      window: "hacknight",
      windowKey: "hn-0",
      metric: "tokens",
      groupBy: "users",
      entries: [],
      fetchedAt: new Date().toISOString(),
    });
    mockedFetchModelLeaderboard.mockResolvedValue({
      window: "hacknight",
      windowKey: "hn-0",
      metric: "tokens",
      groupBy: "model",
      entries: [],
      fetchedAt: new Date().toISOString(),
    });
  });

  it("shows setup prompt when worker URL is missing", () => {
    render(<LeaderboardPage />);
    expect(screen.getByText("Not configured")).toBeInTheDocument();
  });

  it("shows opt-in prompt when participation is off", () => {
    setStore({ leaderboardWorkerUrl: "https://worker.test", leaderboardOptIn: false });
    render(<LeaderboardPage />);
    expect(screen.getByText("Participation off")).toBeInTheDocument();
  });

  it("renders the people leaderboard by default", async () => {
    setStore({
      leaderboardWorkerUrl: "https://worker.test",
      leaderboardOptIn: true,
      leaderboardHandle: "alice",
      leaderboardToken: "tok",
    });

    mockedFetchCurrentHacknight.mockResolvedValue({
      active: true,
      hacknight: {
        number: 7,
        title: "Hack Night #7",
        is_special: false,
        starts_at: new Date().toISOString(),
        ends_at: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
      },
    });

    mockedFetchLeaderboard.mockResolvedValue({
      window: "hacknight",
      windowKey: "hn-7",
      metric: "tokens",
      groupBy: "users",
      entries: [
        {
          rank: 1,
          handle: "bob",
          tokens_used: 50000,
          dollars_spent: 5,
          providers_active: 2,
          score: 10,
        },
      ],
      fetchedAt: new Date().toISOString(),
    });

    render(<LeaderboardPage />);

    await waitFor(() => {
      expect(screen.getByText("bob")).toBeInTheDocument();
    });
    expect(screen.getByText("bob")).toBeInTheDocument();
  });

  it("switches to model leaderboard when Models tab is selected", async () => {
    const user = userEvent.setup();

    setStore({
      leaderboardWorkerUrl: "https://worker.test",
      leaderboardOptIn: true,
      leaderboardHandle: "alice",
      leaderboardToken: "tok",
    });

    mockedFetchModelLeaderboard.mockResolvedValue({
      window: "hacknight",
      windowKey: "hn-7",
      metric: "tokens",
      groupBy: "model",
      entries: [
        {
          rank: 1,
          model_key: "claude:sonnet",
          provider_id: "claude",
          model_id: "sonnet",
          model_name: "Sonnet",
          tokens_used: 25000,
          dollars_spent: 2.5,
          users: 2,
          top_handle: "bob",
          top_tokens: 25000,
        },
      ],
      fetchedAt: new Date().toISOString(),
    });

    render(<LeaderboardPage />);

    const modelsButton = await screen.findByRole("radio", { name: /Models/i });
    await user.click(modelsButton);

    await waitFor(() => {
      expect(mockedFetchModelLeaderboard).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(screen.getByText("Sonnet")).toBeInTheDocument();
    });
  });
});
