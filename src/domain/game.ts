import config from "../../game.config.json";
import type { Timestamp } from "firebase/firestore";
export const GAME_CONFIG = config;
export type ScenarioCategory =
  | "daily"
  | "survival"
  | "exploration"
  | "fantasy"
  | "sci-fi"
  | "economy"
  | "mystery"
  | "disaster";
// Future authoritative match engine: never persist rewards through profile edits.
export interface ChoiceEffect {
  coins: number;
  addItems: string[];
  addStatuses: string[];
}
export interface Scenario {
  id: string;
  category: ScenarioCategory;
  title: string;
  description: string;
  choices: [ScenarioChoice, ScenarioChoice, ScenarioChoice];
}
export interface ScenarioChoice {
  id: string;
  label: string;
  effect: ChoiceEffect;
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
  status: "waiting";
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
