import { describe, it, expect } from "vitest";
import {
  newMatch,
  reduce,
  outcome,
  pickVote,
  finish,
} from "../functions/src/engine";
import {
  CONFIG,
  SCENARIOS,
  THEMES,
  type Match,
  type Secret,
} from "../functions/src/shared/model";
import {
  assignDaily,
  koreaDay,
  progressDaily,
  QUESTS,
} from "../functions/src/shared/quests";
const players = {
  a: {
    nickname: "가나",
    avatarId: "sprout",
    coins: 1000,
    alive: true,
    forfeited: false,
  },
  b: {
    nickname: "다라",
    avatarId: "moon",
    coins: 1000,
    alive: true,
    forfeited: false,
  },
};
const fixture = () => newMatch("m", "ABC234", players, 1000);
function story() {
  let x = fixture();
  x = reduce(
    x.match,
    x.secret,
    "a",
    { kind: "vote", value: "story" },
    1100,
    () => 0,
  );
  x = reduce(
    x.match,
    x.secret,
    "b",
    { kind: "vote", value: "story" },
    1200,
    () => 0,
  );
  x = reduce(
    x.match,
    x.secret,
    "a",
    { kind: "vote", value: "island" },
    1300,
    () => 0,
  );
  return reduce(
    x.match,
    x.secret,
    "b",
    { kind: "vote", value: "island" },
    1400,
    () => 0,
  );
}
function chooseBoth(x: { match: Match; secret: Secret }, safe = true) {
  const c = x.match.scenario!.choices.find((c) =>
    safe ? c.isTimeoutDefault : c.requiredCost > 0,
  )!;
  x = reduce(
    x.match,
    x.secret,
    "a",
    { kind: "choose", round: x.match.round, choiceId: c.id },
    1500,
    () => 0,
  );
  return reduce(
    x.match,
    x.secret,
    "b",
    { kind: "choose", round: x.match.round, choiceId: c.id },
    1600,
    () => 0,
  );
}
describe("authored PR3 migration", () => {
  it("contains four ordered twelve-round stories and exactly 144 probability choices", () => {
    expect(THEMES).toHaveLength(4);
    expect(SCENARIOS).toHaveLength(48);
    expect(SCENARIOS.flatMap((s) => s.choices)).toHaveLength(144);
    for (const t of THEMES) {
      expect(t.scenarios.map((s) => s.round)).toEqual(
        Array.from({ length: 12 }, (_, i) => i + 1),
      );
    }
  });
  it("validates costs, complimentary probabilities, free timeouts, net change and bounded EV for every choice", () => {
    const positions = new Set<number>();
    for (const s of SCENARIOS) {
      expect(s.choices).toHaveLength(3);
      expect(new Set(s.choices.map((c) => c.id)).size).toBe(3);
      expect(s.choices.filter((c) => c.isTimeoutDefault)).toHaveLength(1);
      positions.add(s.choices.findIndex((c) => c.isTimeoutDefault));
      for (const c of s.choices) {
        expect(c.requiredCost).toBeGreaterThanOrEqual(0);
        expect(c.successProbability).toBeGreaterThanOrEqual(0);
        expect(c.successProbability).toBeLessThanOrEqual(100);
        expect(c.successProbability + (100 - c.successProbability)).toBe(100);
        expect(c).not.toHaveProperty("effect");
        expect(c.successText.length).toBeGreaterThan(5);
        expect(c.failureText.length).toBeGreaterThan(5);
        const ev =
          (c.successProbability / 100) * c.successNetChange +
          (1 - c.successProbability / 100) * c.failureNetChange;
        expect(ev).toBeGreaterThanOrEqual(20);
        expect(ev).toBeLessThanOrEqual(125);
        if (c.isTimeoutDefault) expect(c.requiredCost).toBe(0);
      }
    }
    expect(positions.size).toBe(3);
  });
});
describe("authoritative round engine", () => {
  it("story vote goes to theme vote and theme vote opens ordered 12 rounds", () => {
    const x = story();
    expect(x.match.stage).toBe("choosing");
    expect(x.match.totalRounds).toBe(12);
    expect(x.secret.deck).toEqual(THEMES[0].scenarios.map((s) => s.id));
    expect(x.match.deadline).toBe(1400 + CONFIG.choiceMs);
  });
  it("random vote creates ten unique scenarios and skips theme vote", () => {
    let x = fixture();
    for (const uid of ["a", "b"])
      x = reduce(
        x.match,
        x.secret,
        uid,
        { kind: "vote", value: "random" },
        2000,
        () => 0.5,
      );
    expect(x.match.stage).toBe("choosing");
    expect(new Set(x.secret.deck).size).toBe(10);
    expect(x.match.totalRounds).toBe(10);
  });
  it("ties draw only from tied candidates; empty votes still resolve server-side", () => {
    expect(pickVote({ a: "x", b: "y" }, ["x", "y", "z"], () => 0)).toBe("x");
    expect(pickVote({ a: "x", b: "y" }, ["x", "y", "z"], () => 0.99)).toBe("y");
    let x = fixture();
    x = reduce(x.match, x.secret, null, { kind: "tick" }, 31000, () => 0);
    expect(x.match.stage).toBe("themeVote");
  });
  it("rejects outsiders, duplicate votes and changed confirmed choices", () => {
    let x = fixture();
    expect(() =>
      reduce(x.match, x.secret, "evil", { kind: "tick" }, 1000, () => 0),
    ).toThrow();
    x = reduce(
      x.match,
      x.secret,
      "a",
      { kind: "vote", value: "story" },
      1100,
      () => 0,
    );
    expect(() =>
      reduce(
        x.match,
        x.secret,
        "a",
        { kind: "vote", value: "random" },
        1200,
        () => 0,
      ),
    ).toThrow();
    x = story();
    const c = x.match.scenario!.choices[0];
    x = reduce(
      x.match,
      x.secret,
      "a",
      { kind: "choose", round: 1, choiceId: c.id },
      1500,
      () => 0,
    );
    expect(() =>
      reduce(
        x.match,
        x.secret,
        "a",
        { kind: "choose", round: 1, choiceId: c.id },
        1600,
        () => 0,
      ),
    ).toThrow();
    expect(x.match).not.toHaveProperty("choices");
    expect(x.match.results).toHaveLength(0);
  });
  it("rejects insufficient coins, stale rounds and expired selection", () => {
    const x = story();
    x.match.players.a.coins = 1;
    const c = x.match.scenario!.choices.find((c) => c.requiredCost > 0)!;
    expect(() =>
      reduce(
        x.match,
        x.secret,
        "a",
        { kind: "choose", round: 1, choiceId: c.id },
        1500,
        () => 0,
      ),
    ).toThrow(/코인/);
    expect(() =>
      reduce(
        x.match,
        x.secret,
        "a",
        { kind: "choose", round: 2, choiceId: c.id },
        1500,
        () => 0,
      ),
    ).toThrow();
    expect(() =>
      reduce(
        x.match,
        x.secret,
        "a",
        { kind: "choose", round: 1, choiceId: c.id },
        x.match.deadline,
        () => 0,
      ),
    ).toThrow();
  });
  it("30 seconds uses free defaults and locks for exactly three seconds", () => {
    let x = story();
    const deadline = x.match.deadline;
    x = reduce(x.match, x.secret, null, { kind: "tick" }, deadline, () => 0);
    expect(x.match.stage).toBe("countdown");
    expect(x.match.deadline).toBe(deadline + 3000);
    expect(Object.values(x.secret.choices).every((c) => c.timedOut)).toBe(true);
    x = reduce(
      x.match,
      x.secret,
      null,
      { kind: "tick" },
      deadline + 2999,
      () => 0,
    );
    expect(x.match.results).toHaveLength(0);
    x = reduce(
      x.match,
      x.secret,
      null,
      { kind: "tick" },
      deadline + 3000,
      () => 0,
    );
    expect(x.match.results).toHaveLength(1);
    expect(Object.keys(x.match.results[0].outcomes)).toEqual(["a", "b"]);
  });
  it("all alive confirmed ends early; costs never deducted twice; repeated tick cannot apply twice", () => {
    let x = chooseBoth(story(), false);
    expect(x.match.stage).toBe("countdown");
    expect(x.match.deadline).toBe(4600);
    const c = x.match.scenario!.choices.find((c) => c.requiredCost > 0)!;
    x = reduce(x.match, x.secret, null, { kind: "tick" }, 4600, () => 0);
    expect(x.match.players.a.coins).toBe(1000 + c.successNetChange);
    const result = structuredClone(x.match);
    x = reduce(x.match, x.secret, null, { kind: "tick" }, 4600, () => 0);
    expect(x.match.players).toEqual(result.players);
    expect(x.match.results).toHaveLength(1);
  });
  it("probability edge cases and clamp expose final and applied change separately", () => {
    const c = {
      ...SCENARIOS[0].choices[0],
      successProbability: 0,
      failureNetChange: -300,
    };
    expect(outcome(c, 100, () => 0)).toMatchObject({
      success: false,
      coins: 0,
      change: -300,
      appliedChange: -100,
    });
    expect(
      outcome({ ...c, successProbability: 100 }, 100, () => 0.99999).success,
    ).toBe(true);
  });
  it("settles both before elimination; all dead is draw", () => {
    let x = chooseBoth(story(), false);
    x.match.players.a.coins = 1;
    x.match.players.b.coins = 1;
    x = reduce(x.match, x.secret, null, { kind: "tick" }, 4600, () => 0.99);
    expect(x.match.stage).toBe("finished");
    expect(
      Object.values(x.match.awards).every((a) => a.points === 0 && !a.winner),
    ).toBe(true);
    expect(
      Object.values(x.match.players).every((p) => !p.alive && p.coins === 0),
    ).toBe(true);
  });
  it("one survivor ends immediately and awards base 10 even below 1000", () => {
    let x = chooseBoth(story(), false);
    x.match.players.a.coins = 1;
    x = reduce(x.match, x.secret, null, { kind: "tick" }, 4600, () => 0.99);
    expect(x.match.stage).toBe("finished");
    expect(x.match.awards.b).toMatchObject({ winner: true, points: 10 });
  });
  it("eliminated players observe and are excluded from confirmation", () => {
    let x = story();
    x.match.players.b.alive = false;
    x.match.players.b.coins = 0;
    const c = x.match.scenario!.choices.find((c) => c.isTimeoutDefault)!;
    expect(() =>
      reduce(
        x.match,
        x.secret,
        "b",
        { kind: "choose", round: 1, choiceId: c.id },
        1500,
        () => 0,
      ),
    ).toThrow();
    x = reduce(
      x.match,
      x.secret,
      "a",
      { kind: "choose", round: 1, choiceId: c.id },
      1500,
      () => 0,
    );
    expect(x.match.stage).toBe("countdown");
  });
  it("last round ties share normal rewards and bonus caps at five", () => {
    const x = story();
    x.match.players.a.coins = 2200;
    x.match.players.b.coins = 2200;
    finish(x.match, 9999);
    expect(
      Object.values(x.match.awards).every(
        (a) => a.rank === 1 && a.points === 15,
      ),
    ).toBe(true);
    for (const [coins, points] of [
      [1000, 10],
      [1199, 10],
      [1200, 11],
      [1400, 12],
      [1600, 13],
      [1800, 14],
      [2000, 15],
    ]) {
      x.match.players.a.coins = coins;
      x.match.players.b.coins = 1;
      finish(x.match, 9999);
      expect(x.match.awards.a.points).toBe(points);
    }
  });
  it("actually completes twelve story rounds and ten random rounds", () => {
    for (const mode of ["story", "random"]) {
      let x = mode === "story" ? story() : fixture();
      if (mode === "random")
        for (const uid of ["a", "b"])
          x = reduce(
            x.match,
            x.secret,
            uid,
            { kind: "vote", value: "random" },
            2000,
            () => 0,
          );
      while (x.match.stage !== "finished")
        x = reduce(
          x.match,
          x.secret,
          null,
          { kind: "tick" },
          x.match.deadline,
          () => 0,
        );
      expect(x.match.results).toHaveLength(mode === "story" ? 12 : 10);
      expect(x.match.awards.a.winner).toBe(true);
    }
  });
  it("forfeit during vote cancels with no awards; refresh/tick does not forfeit", () => {
    let x = fixture();
    x = reduce(x.match, x.secret, null, { kind: "tick" }, 1100, () => 0);
    expect(x.match.players.a.alive).toBe(true);
    x = reduce(x.match, x.secret, "a", { kind: "forfeit" }, 1200, () => 0);
    expect(x.match.stage).toBe("cancelled");
    expect(x.match.awards).toEqual({});
  });
});
describe("daily quest data and derived progress", () => {
  it("contains exactly 30 distinct definitions with low rewards", () => {
    expect(QUESTS).toHaveLength(30);
    expect(new Set(QUESTS.map((q) => q.id)).size).toBe(30);
    expect(QUESTS.every((q) => q.rewardPoints === 1 && q.target > 0)).toBe(
      true,
    );
  });
  it("assigns exactly four unique tasks and uses Korea midnight boundary", () => {
    const day = koreaDay(Date.parse("2026-10-25T14:59:59Z"));
    expect(day).toBe("2026-10-25");
    expect(koreaDay(Date.parse("2026-10-25T15:00:00Z"))).toBe("2026-10-26");
    expect(new Set(assignDaily(day, () => 0.3).ids).size).toBe(4);
  });
  it("calculates progress only from completed non-forfeited records", () => {
    const x = story();
    const daily = {
      day: "2026-10-25",
      ids: ["complete1", "win", "story", "survive"],
      progress: {},
      claimed: [],
    };
    expect(progressDaily(daily, x.match, "a").progress.complete1).toBe(0);
    finish(x.match, 9999);
    expect(progressDaily(daily, x.match, "a").progress).toEqual({
      complete1: 1,
      win: 1,
      story: 1,
      survive: 1,
    });
    x.match.players.a.forfeited = true;
    expect(progressDaily(daily, x.match, "a").progress.complete1).toBe(0);
  });
});
