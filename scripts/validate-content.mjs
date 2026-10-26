import content from "../game-content.json" with { type: "json" };
const scenarios = content.themes.flatMap((t) => t.scenarios);
if (content.themes.length !== 4 || scenarios.length !== 48)
  throw new Error("4 themes and 48 scenarios are required");
for (const scenario of scenarios) {
  if (scenario.choices.length !== 3)
    throw new Error(`${scenario.id}: exactly 3 choices required`);
  if (
    scenario.choices.filter((c) => c.isTimeoutDefault && c.requiredCost === 0)
      .length !== 1
  )
    throw new Error(`${scenario.id}: one free timeout choice required`);
  for (const c of scenario.choices) {
    if (c.successProbability < 0 || c.successProbability > 100)
      throw new Error(`${scenario.id}/${c.id}: invalid probability`);
    if (c.requiredCost < 0)
      throw new Error(`${scenario.id}/${c.id}: invalid cost`);
  }
}
console.log(
  `validated ${content.themes.length} themes, ${scenarios.length} scenarios, ${scenarios.length * 3} choices`,
);
