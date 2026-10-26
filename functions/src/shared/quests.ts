import type { Match } from "./model";
export interface Quest {
  id: string;
  title: string;
  metric: string;
  target: number;
  rewardPoints: number;
}
const q = (id: string, title: string, metric: string, target = 1): Quest => ({
  id,
  title,
  metric,
  target,
  rewardPoints: 1,
});
export const QUESTS: Quest[] = [
  q("complete1", "경기 1회 완료", "games"),
  q("complete2", "경기 2회 완료", "games", 2),
  q("win", "경기 1회 승리", "wins"),
  q("duel", "1 vs 1 경기 완료", "duel"),
  q("trio", "1 vs 1 vs 1 경기 완료", "trio"),
  q("story", "스토리 모드 완료", "story"),
  q("random", "랜덤 모드 완료", "random"),
  q("island", "무인도 생존 완료", "island"),
  q("medieval", "중세 도시 완료", "medieval"),
  q("space", "우주 탐사 완료", "space"),
  q("mansion", "미스터리 저택 완료", "mansion"),
  q("free3", "무료 행동 3회", "free", 3),
  q("free6", "무료 행동 6회", "free", 6),
  q("paid3", "비용 있는 행동 3회", "paid", 3),
  q("paid5", "비용 있는 행동 5회", "paid", 5),
  q("coins1200", "한 경기에서 1,200코인 달성", "coins1200"),
  q("coins1500", "한 경기에서 1,500코인 달성", "coins1500"),
  q("survive", "탈락하지 않고 경기 완료", "survive"),
  q("early", "10초 이상 남기고 확정", "early"),
  q("early3", "10초 이상 남기고 3회 확정", "early", 3),
  q("safe", "안전형 행동 사용", "safe"),
  q("safe3", "안전형 행동 3회", "safe", 3),
  q("risk", "고위험 행동 사용", "risk"),
  q("risk3", "고위험 행동 3회", "risk", 3),
  q("variety", "세 가지 유형 모두 사용", "variety"),
  q("success3", "행동 3회 성공", "success", 3),
  q("success6", "행동 6회 성공", "success", 6),
  q("recover", "실패 후 다음 선택 성공", "recover"),
  q("manual5", "직접 확정 5회", "manual", 5),
  q("rounds10", "라운드 결과 10회 확인", "rounds", 10),
];
export interface Daily {
  day: string;
  ids: string[];
  progress: Record<string, number>;
  claimed: string[];
}
export function koreaDay(now: number) {
  return new Date(now + 9 * 3600000).toISOString().slice(0, 10);
}
export function assignDaily(day: string, random: () => number): Daily {
  const pool = [...QUESTS];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return {
    day,
    ids: pool.slice(0, 4).map((q) => q.id),
    progress: {},
    claimed: [],
  };
}
export function metrics(m: Match, uid: string): Record<string, number> {
  const p = m.players[uid];
  if (m.stage !== "finished" || p.forfeited) return {};
  const outcomes = m.results
    .map((r) => ({ r, o: r.outcomes[uid] }))
    .filter((x) => x.o);
  const v: Record<string, number> = {
    games: 1,
    wins: m.awards[uid]?.winner ? 1 : 0,
    duel: m.memberIds.length === 2 ? 1 : 0,
    trio: m.memberIds.length === 3 ? 1 : 0,
    [m.mode!]: 1,
    [m.themeId ?? "none"]: 1,
    survive: p.alive ? 1 : 0,
    rounds: outcomes.length,
  };
  let priorFailed = false;
  const roles = new Set<string>();
  let peak = 1000;
  for (const { r, o } of outcomes) {
    const c = SCENARIOS.find((s) => s.id === r.scenarioId)!.choices.find(
      (c) => c.id === o.choiceId,
    )!;
    const inc = (key: string) => (v[key] = (v[key] ?? 0) + 1);
    inc(c.requiredCost === 0 ? "free" : "paid");
    const role =
      c.successProbability === 100
        ? "safe"
        : c.requiredCost > 0
          ? "paid"
          : "risk";
    roles.add(role);
    if (role !== "paid") inc(role);
    if (!o.timedOut) {
      inc("manual");
      if (o.remainingMs >= 10000) inc("early");
    }
    if (o.success) inc("success");
    if (priorFailed && o.success) inc("recover");
    priorFailed = !o.success;
    peak = Math.max(peak, o.coins);
  }
  v.coins1200 = peak >= 1200 ? 1 : 0;
  v.coins1500 = peak >= 1500 ? 1 : 0;
  v.variety = roles.size === 3 ? 1 : 0;
  return v;
}
import { SCENARIOS } from "./model";
export function progressDaily(d: Daily, m: Match, uid: string): Daily {
  const v = metrics(m, uid);
  const progress = { ...d.progress };
  for (const id of d.ids) {
    const q = QUESTS.find((q) => q.id === id)!;
    progress[id] = Math.min(q.target, (progress[id] ?? 0) + (v[q.metric] ?? 0));
  }
  return { ...d, progress };
}
