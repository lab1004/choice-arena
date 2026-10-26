import {
  CONFIG,
  SCENARIOS,
  THEMES,
  type Match,
  type Secret,
  type ScenarioChoice,
} from "./shared/model";
export class GameError extends Error {}
const assert = (ok: unknown, message: string): void => {
  if (!ok) throw new GameError(message);
};
export function newMatch(
  id: string,
  roomCode: string,
  players: Match["players"],
  now: number,
): { match: Match; secret: Secret } {
  return {
    match: {
      id,
      roomCode,
      memberIds: Object.keys(players),
      players,
      stage: "modeVote",
      mode: null,
      themeId: null,
      round: 0,
      totalRounds: 0,
      scenario: null,
      deadline: now + CONFIG.voteMs,
      confirmedIds: [],
      votedIds: [],
      results: [],
      awards: {},
      createdAt: now,
      updatedAt: now,
      finishedAt: null,
    },
    secret: { votes: {}, choices: {}, deck: [] },
  };
}
export function pickVote(
  votes: Record<string, string>,
  options: string[],
  random: () => number,
): string {
  const counts = options.map(
    (o) => Object.values(votes).filter((v) => v === o).length,
  );
  const top = Math.max(...counts);
  const tied = options.filter((_, i) => counts[i] === top);
  return tied[Math.floor(random() * tied.length)];
}
function startRound(m: Match, s: Secret, now: number) {
  m.round++;
  m.scenario = SCENARIOS.find((x) => x.id === s.deck[m.round - 1])!;
  m.stage = "choosing";
  m.deadline = now + CONFIG.choiceMs;
  m.confirmedIds = [];
  s.choices = {};
}
function startGame(m: Match, s: Secret, now: number, random: () => number) {
  let deck =
    m.mode === "story"
      ? [...THEMES.find((t) => t.id === m.themeId)!.scenarios]
      : [...SCENARIOS];
  if (m.mode === "random")
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
  m.totalRounds = m.mode === "story" ? CONFIG.storyRounds : CONFIG.randomRounds;
  s.deck = deck.slice(0, m.totalRounds).map((x) => x.id);
  startRound(m, s, now);
}
export function finish(m: Match, now: number) {
  m.stage = "finished";
  m.deadline = 0;
  m.finishedAt = now;
  const alive = m.memberIds.filter(
    (id) => m.players[id].alive && !m.players[id].forfeited,
  );
  const best = Math.max(...alive.map((id) => m.players[id].coins));
  for (const id of m.memberIds) {
    const p = m.players[id];
    const winner = alive.includes(id) && p.coins === best;
    const bonus = winner
      ? Math.min(
          5,
          Math.floor(Math.max(0, p.coins - CONFIG.startingCoins) / 200),
        )
      : 0;
    m.awards[id] = {
      rank:
        1 +
        m.memberIds.filter((other) => m.players[other].coins > p.coins).length,
      winner,
      base: winner ? 10 : 0,
      bonus,
      points: winner ? 10 + bonus : 0,
    };
  }
}
export function outcome(
  c: ScenarioChoice,
  coins: number,
  random: () => number,
) {
  const success = random() * 100 < c.successProbability;
  const change = success ? c.successNetChange : c.failureNetChange;
  const next = Math.max(0, coins + change);
  return {
    success,
    change,
    appliedChange: next - coins,
    coins: next,
    text: success ? c.successText : c.failureText,
  };
}
export type Command =
  | { kind: "tick" }
  | { kind: "vote"; value: string }
  | { kind: "choose"; choiceId: string; round: number }
  | { kind: "forfeit" };
export function reduce(
  original: Match,
  privateState: Secret,
  uid: string | null,
  command: Command,
  now: number,
  random: () => number,
): { match: Match; secret: Secret } {
  const m = structuredClone(original),
    s = structuredClone(privateState);
  if (uid !== null)
    assert(m.memberIds.includes(uid), "이 경기의 참가자가 아닙니다.");
  if (m.stage === "finished" || m.stage === "cancelled") {
    assert(
      command.kind === "tick" || command.kind === "forfeit",
      "이미 종료된 경기입니다.",
    );
    return { match: m, secret: s };
  }
  if (command.kind === "forfeit") {
    const p = m.players[uid!];
    p.forfeited = true;
    p.alive = false;
    p.coins = 0;
    if (m.stage === "modeVote" || m.stage === "themeVote") {
      m.stage = "cancelled";
      m.deadline = 0;
      m.finishedAt = now;
    } else if (m.memberIds.filter((id) => m.players[id].alive).length <= 1)
      finish(m, now);
  }
  if (command.kind === "vote") {
    assert(
      m.stage === "modeVote" || m.stage === "themeVote",
      "투표 단계가 아닙니다.",
    );
    assert(now < m.deadline, "투표 시간이 끝났습니다.");
    assert(!s.votes[uid!], "이미 투표했습니다.");
    const options =
      m.stage === "modeVote" ? ["story", "random"] : THEMES.map((t) => t.id);
    assert(
      options.includes(command.value),
      "올바른 투표 항목을 선택해 주세요.",
    );
    s.votes[uid!] = command.value;
    m.votedIds = Object.keys(s.votes);
  }
  if (command.kind === "choose") {
    assert(
      m.stage === "choosing" && m.round === command.round,
      "선택 단계가 변경되었습니다.",
    );
    assert(now < m.deadline, "선택 시간이 끝났습니다.");
    assert(m.players[uid!].alive, "탈락 후에는 관전만 가능합니다.");
    assert(!s.choices[uid!], "확정한 선택은 바꿀 수 없습니다.");
    const c = m.scenario!.choices.find((c) => c.id === command.choiceId);
    assert(c, "선택지를 확인해 주세요.");
    assert(m.players[uid!].coins >= c!.requiredCost, "코인이 부족합니다.");
    s.choices[uid!] = {
      choiceId: c!.id,
      timedOut: false,
      remainingMs: m.deadline - now,
    };
    m.confirmedIds = Object.keys(s.choices);
  }
  if (
    (m.stage === "modeVote" || m.stage === "themeVote") &&
    (m.votedIds.length === m.memberIds.length || now >= m.deadline)
  ) {
    const result = pickVote(
      s.votes,
      m.stage === "modeVote" ? ["story", "random"] : THEMES.map((t) => t.id),
      random,
    );
    s.votes = {};
    m.votedIds = [];
    if (m.stage === "modeVote") {
      m.mode = result as "story" | "random";
      if (m.mode === "story") {
        m.stage = "themeVote";
        m.deadline = now + CONFIG.voteMs;
      } else startGame(m, s, now, random);
    } else {
      m.themeId = result;
      startGame(m, s, now, random);
    }
  } else if (m.stage === "choosing") {
    const alive = m.memberIds.filter((id) => m.players[id].alive);
    if (now >= m.deadline || alive.every((id) => s.choices[id])) {
      for (const id of alive)
        if (!s.choices[id])
          s.choices[id] = {
            choiceId: m.scenario!.choices.find((c) => c.isTimeoutDefault)!.id,
            timedOut: true,
            remainingMs: 0,
          };
      m.confirmedIds = alive;
      m.stage = "countdown";
      m.deadline = now + CONFIG.countdownMs;
    }
  } else if (m.stage === "countdown" && now >= m.deadline) {
    const results: Match["results"][number] = {
      scenarioId: m.scenario!.id,
      round: m.round,
      outcomes: {},
    };
    for (const id of m.memberIds.filter((id) => m.players[id].alive)) {
      const sel = s.choices[id];
      const c = m.scenario!.choices.find((c) => c.id === sel.choiceId)!;
      const r = outcome(c, m.players[id].coins, random);
      results.outcomes[id] = { ...r, ...sel };
      m.players[id].coins = r.coins;
    }
    // Settle every participant before eliminating anyone or deciding a winner.
    for (const id of m.memberIds)
      m.players[id].alive = m.players[id].coins > 0 && !m.players[id].forfeited;
    m.results.push(results);
    s.choices = {};
    if (
      m.memberIds.filter((id) => m.players[id].alive).length <= 1 ||
      m.round === m.totalRounds
    )
      finish(m, now);
    else {
      m.stage = "roundResult";
      m.deadline = now + CONFIG.resultMs;
    }
  } else if (m.stage === "roundResult" && now >= m.deadline)
    startRound(m, s, now);
  m.updatedAt = now;
  return { match: m, secret: s };
}
