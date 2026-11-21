import { readFileSync, writeFileSync } from "node:fs";
const config = JSON.parse(
  readFileSync(new URL("../game.config.json", import.meta.url), "utf8"),
);
const template = readFileSync(
  new URL("../firestore.rules.template", import.meta.url),
  "utf8",
);
const output =
  "// GENERATED from firestore.rules.template and game.config.json. Run npm run rules:generate.\n" +
  template.replaceAll("__MAX_PLAYERS__", String(config.maxPlayers));
const target = new URL("../firestore.rules", import.meta.url);
if (process.argv.includes("--check")) {
  if (readFileSync(target, "utf8") !== output)
    throw new Error("보안 규칙을 npm run rules:generate 명령으로 갱신하세요.");
} else writeFileSync(target, output);

const serverConfig = new URL(
  "../functions/src/shared/config.json",
  import.meta.url,
);
const serverOutput = JSON.stringify(config, null, 2) + "\n";
if (process.argv.includes("--check")) {
  if (readFileSync(serverConfig, "utf8") !== serverOutput)
    throw new Error("서버 설정을 npm run rules:generate 명령으로 갱신하세요.");
} else writeFileSync(serverConfig, serverOutput);
