import raw from "./stories.json";
export interface ScenarioChoice {
  id: string;
  title: string;
  requiredCost: number;
  successProbability: number;
  successNetChange: number;
  failureNetChange: number;
  successText: string;
  failureText: string;
  isTimeoutDefault?: boolean;
}
export interface Scenario {
  id: string;
  themeId: string;
  round: number;
  title: string;
  description: string;
  choices: [ScenarioChoice, ScenarioChoice, ScenarioChoice];
}
export interface Theme {
  id: string;
  name: string;
  summary: string;
  scenarios: Scenario[];
}
export const THEMES = raw as Theme[];
export const SCENARIOS = THEMES.flatMap((t) => t.scenarios);
export const CONFIG = {
  startingCoins: 1000,
  choiceMs: 30_000,
  countdownMs: 3_000,
  resultMs: 8_000,
  voteMs: 30_000,
  storyRounds: 12,
  randomRounds: 10,
};
export const AVATARS = [
  "sprout",
  "moon",
  "comet",
  "wave",
  "sun",
  "leaf",
] as const;
export type Stage =
  | "modeVote"
  | "themeVote"
  | "choosing"
  | "countdown"
  | "roundResult"
  | "finished"
  | "cancelled";
export interface Player {
  nickname: string;
  avatarId: string;
  coins: number;
  alive: boolean;
  forfeited: boolean;
}
export interface Outcome {
  choiceId: string;
  success: boolean;
  change: number;
  appliedChange: number;
  text: string;
  coins: number;
  timedOut: boolean;
  remainingMs: number;
}
export interface RoundResult {
  scenarioId: string;
  round: number;
  outcomes: Record<string, Outcome>;
}
export interface Award {
  rank: number;
  winner: boolean;
  base: number;
  bonus: number;
  points: number;
}
export interface Match {
  id: string;
  roomCode: string;
  memberIds: string[];
  players: Record<string, Player>;
  stage: Stage;
  mode: "story" | "random" | null;
  themeId: string | null;
  round: number;
  totalRounds: number;
  scenario: Scenario | null;
  deadline: number;
  confirmedIds: string[];
  votedIds: string[];
  results: RoundResult[];
  awards: Record<string, Award>;
  createdAt: number;
  updatedAt: number;
  finishedAt: number | null;
}
export interface Selection {
  choiceId: string;
  timedOut: boolean;
  remainingMs: number;
}
export interface Secret {
  votes: Record<string, string>;
  choices: Record<string, Selection>;
  deck: string[];
}
export interface Account {
  points: number;
  games: number;
  wins: number;
}
export const EMPTY_ACCOUNT: Account = { points: 0, games: 0, wins: 0 };
export function matchPath(m: Pick<Match, "id" | "stage">) {
  return `/matches/${m.id}/${m.stage === "finished" || m.stage === "cancelled" ? "result" : m.stage === "modeVote" || m.stage === "themeVote" ? "vote" : "game"}`;
}
