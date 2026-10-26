import { test, expect, type Browser, type Page } from "@playwright/test";
async function login(browser: Browser, width: number, name: string) {
  const context = await browser.newContext({
    viewport: { width, height: 850 },
  });
  const page = await context.newPage();
  await page.goto("/home");
  await expect(page).toHaveURL(/\/login$/);
  await page.evaluate(async () => {
    const path = "/tests/fixtures/emulator-auth.ts";
    await (await import(/* @vite-ignore */ path)).signInForAuthTest();
  });
  await expect(page).toHaveURL(/\/onboarding$/);
  await page.getByLabel("게임 닉네임", { exact: true }).fill(name);
  await page.getByRole("button", { name: "다음: 프로필 사진" }).click();
  await page.getByRole("button", { name: "가입 완료", exact: true }).click();
  await expect(page).toHaveURL(/\/home$/);
  return { context, page };
}
async function create(page: Page, n: number) {
  await page.getByRole("link", { name: /게임 시작/ }).click();
  await page
    .getByRole("button", {
      name: n === 2 ? "1 vs 1" : "1 vs 1 vs 1",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "새로운 방 만들기" }).click();
  await expect(page).toHaveURL(/\/rooms\//);
  return new URL(page.url()).pathname.split("/").at(-1)!;
}
async function join(page: Page, code: string) {
  await page.getByRole("link", { name: /게임 시작/ }).click();
  // A mobile guest needs an actionable explanation instead of a silent
  // failure if an invalid invitation code is submitted.
  await page.getByLabel("6자리 방 코드").fill("ABCO12");
  await page.getByRole("button", { name: "참가", exact: true }).click();
  await expect(page.locator(".join-panel [role=alert]")).toContainText(
    "6자리 초대 코드",
  );
  await page.getByLabel("6자리 방 코드").fill(code);
  await page.getByRole("button", { name: "참가", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/rooms/${code}import { test, expect, type Browser, type Page } from "@playwright/test";
async function login(browser: Browser, width: number, name: string) {
  const context = await browser.newContext({
    viewport: { width, height: 850 },
  });
  const page = await context.newPage();
  await page.goto("/home");
  await expect(page).toHaveURL(/\/login$/);
  await page.evaluate(async () => {
    const path = "/tests/fixtures/emulator-auth.ts";
    await (await import(/* @vite-ignore */ path)).signInForAuthTest();
  });
  await expect(page).toHaveURL(/\/onboarding$/);
  await page.getByLabel("게임 닉네임", { exact: true }).fill(name);
  await page.getByRole("button", { name: "다음: 프로필 사진" }).click();
  await page.getByRole("button", { name: "가입 완료", exact: true }).click();
  await expect(page).toHaveURL(/\/home$/);
  return { context, page };
}
async function create(page: Page, n: number) {
  await page.getByRole("link", { name: /게임 시작/ }).click();
  await page
    .getByRole("button", {
      name: n === 2 ? "1 vs 1" : "1 vs 1 vs 1",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "새로운 방 만들기" }).click();
  await expect(page).toHaveURL(/\/rooms\//);
  return new URL(page.url()).pathname.split("/").at(-1)!;
}
));
  await expect(
    page.getByRole("button", { name: "준비 완료", exact: true }),
  ).toBeEnabled();
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}
async function safeSelect(page: Page) {
  await page
    .locator(".choice-card")
    .filter({ hasText: "시간 초과 시 이 행동" })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "선택 확정", exact: true }).click();
}
test("two browsers: login → profiles → duel → random vote → ten real rounds → points/history/quests", async ({
  browser,
}) => {
  const a = await login(browser, 360, "모바일하나"),
    b = await login(browser, 390, "모바일둘");
  try {
    const code = await create(a.page, 2);
    await join(b.page, code);
    await expect(
      a.page.getByRole("button", { name: "경기 시작", exact: true }),
    ).toBeDisabled();
    for (const p of [a.page, b.page])
      await p.getByRole("button", { name: "준비 완료", exact: true }).click();
    await a.page
      .getByRole("button", { name: "경기 시작", exact: true })
      .click();
    for (const p of [a.page, b.page]) {
      await expect(p).toHaveURL(/\/vote$/);
      await p.getByRole("button", { name: /^랜덤 모드/ }).click();
    }
    for (const p of [a.page, b.page]) await expect(p).toHaveURL(/\/game$/);
    const gameUrl = a.page.url();
    await a.page.goto(gameUrl.replace("/game", "/result"));
    await expect(a.page).toHaveURL(gameUrl);
    for (let round = 1; round <= 10; round++) {
      for (const p of [a.page, b.page]) {
        await expect(
          p.getByRole("heading", { name: `${round} / 10 라운드`, exact: true }),
        ).toBeVisible();
        await expect(
          p.locator(".choice-card").filter({ hasText: "시간 초과 시 이 행동" }),
        ).toBeEnabled();
        await noOverflow(p);
      }
      if (round === 1) {
        await a.page.screenshot({
          path: "test-results/game-360.png",
          fullPage: true,
        });
        await b.page.screenshot({
          path: "test-results/game-390.png",
          fullPage: true,
        });
        await b.page.reload();
        await expect(
          b.page
            .locator(".choice-card")
            .filter({ hasText: "시간 초과 시 이 행동" }),
        ).toBeEnabled();
      }
      await safeSelect(a.page);
      await expect(a.page.getByText(/선택 확정 · 공개될 때까지/)).toBeVisible();
      await safeSelect(b.page);
      if (round < 10) {
        await expect(
          a.page.getByRole("heading", {
            name: `${round}라운드 결과`,
            exact: true,
          }),
        ).toBeVisible();
      }
    }
    for (const p of [a.page, b.page]) {
      await expect(p).toHaveURL(/\/result$/);
      await expect(p.getByRole("heading", { name: /공동 우승/ })).toBeVisible();
      await noOverflow(p);
    }
    await a.page.screenshot({
      path: "test-results/result-360.png",
      fullPage: true,
    });
    await a.page.reload();
    await expect(
      a.page.getByRole("heading", { name: /공동 우승/ }),
    ).toBeVisible();
    await a.page.getByRole("link", { name: "메인 메뉴", exact: true }).click();
    await expect(a.page.locator(".profile-stats dd")).toHaveText(/1[0-5] P/);
    await a.page.getByRole("link", { name: /내 기록/ }).click();
    await expect(a.page.locator("summary")).toHaveCount(1);
    await a.page.locator("summary").click();
    await expect(a.page.getByRole("heading", { name: /10R/ })).toBeVisible();
    await a.page.reload();
    await expect(a.page.locator("summary")).toHaveCount(1);
    await a.page.goto("/quests");
    await expect(a.page.locator(".quest")).toHaveCount(4);
    await a.page.goto("/ranking");
    await expect(
      a.page.getByText("모바일하나 (나)", { exact: true }),
    ).toBeVisible();
  } finally {
    await a.context.close();
    await b.context.close();
  }
});
test("three browsers: story/theme vote, spectator forfeit, mobile/tablet/desktop layouts and route restore", async ({
  browser,
}) => {
  const users = await Promise.all([
    login(browser, 375, "스토리하나"),
    login(browser, 768, "스토리둘"),
    login(browser, 1440, "스토리셋"),
  ]);
  try {
    const [a, b, c] = users;
    const code = await create(a.page, 3);
    await join(b.page, code);
    await join(c.page, code);
    for (const { page } of users)
      await page
        .getByRole("button", { name: "준비 완료", exact: true })
        .click();
    await a.page
      .getByRole("button", { name: "경기 시작", exact: true })
      .click();
    for (const { page } of users) {
      await expect(page).toHaveURL(/\/vote$/);
      await page.getByRole("button", { name: /^스토리 모드/ }).click();
    }
    for (const { page } of users) {
      await page.getByRole("button", { name: /^미스터리 저택/ }).click();
    }
    for (const { page } of users) {
      await expect(page).toHaveURL(/\/game$/);
      await expect(
        page.getByRole("heading", { name: "1 / 12 라운드" }),
      ).toBeVisible();
      await noOverflow(page);
    }
    await a.page.reload();
    await expect(
      a.page.getByRole("heading", { name: "1 / 12 라운드" }),
    ).toBeVisible();
    await a.page.screenshot({
      path: "test-results/story-375.png",
      fullPage: true,
    });
    await b.page.screenshot({
      path: "test-results/story-768.png",
      fullPage: true,
    });
    await c.page.screenshot({
      path: "test-results/story-1440.png",
      fullPage: true,
    });
    const url = a.page.url();
    await a.page.getByRole("button", { name: "경기 중도 포기" }).click();
    await a.page.getByRole("button", { name: "확인하고 나가기" }).click();
    await expect(a.page).toHaveURL(/\/home$/);
    await a.page.goto(url);
    await expect(a.page.getByText(/관전 중입니다/)).toBeVisible();
    await expect(a.page.locator(".choice-card").first()).toBeDisabled();
    await b.page.getByRole("button", { name: "경기 중도 포기" }).click();
    await b.page.getByRole("button", { name: "확인하고 나가기" }).click();
    await expect(c.page).toHaveURL(/\/result$/);
    await expect(
      c.page.getByRole("heading", { name: "스토리셋 우승" }),
    ).toBeVisible();
  } finally {
    await Promise.all(users.map((u) => u.context.close()));
  }
});
