import config from "../../game.config.json";
import type { Timestamp } from "firebase/firestore";
export const GAME_CONFIG = config;
export interface PlayChoice {
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
export interface PlayScenario {
  id: string;
  themeId: string;
  round: number;
  title: string;
  description: string;
  choices: [PlayChoice, PlayChoice, PlayChoice];
}
export interface StoryTheme {
  id: string;
  name: string;
  summary: string;
  scenarios: PlayScenario[];
}
export interface Profile {
  nickname: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
export interface Member {
  nickname: string;
  ready: boolean;
}
export interface Room {
  hostId: string;
  maxPlayers: number;
  status: "waiting" | "playing" | "finished";
  matchId?: string;
  memberIds: string[];
  members: Record<string, Member>;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
export interface RoomDirectory {
  playerCount: number;
  maxPlayers: number;
}
export interface PlayerSession {
  roomCode: string | null;
}
export function normalizeCode(value: string) {
  return value.trim().toUpperCase();
}
export function validCode(value: string) {
  return (
    value.length === config.roomCodeLength &&
    [...value].every((c) => config.roomCodeAlphabet.includes(c))
  );
}
export function generateCode() {
  const alphabet = config.roomCodeAlphabet;
  const limit = 256 - (256 % alphabet.length);
  let code = "";
  while (code.length < config.roomCodeLength) {
    for (const n of crypto.getRandomValues(
      new Uint8Array(config.roomCodeLength),
    )) {
      if (n < limit && code.length < config.roomCodeLength)
        code += alphabet[n % alphabet.length];
    }
  }
  return code;
}
export function validNickname(value: string) {
  return /^[가-힣a-zA-Z0-9_]{2,12}$/.test(value);
}
