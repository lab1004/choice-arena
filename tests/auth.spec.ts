import { test, expect } from "@playwright/test";
test("Firebase Auth Emulator: onboarding, settings, quests, room restore and logout", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Google로 시작하기" }),
  ).toBeEnabled();
  await page.evaluate(async () => {
    const fixturePath = "/tests/fixtures/emulator-auth.ts";
    const { signInForAuthTest } = await import(/* @vite-ignore */ fixturePath);
    await signInForAuthTest();
  });
  await expect(page.getByRole("button", { name: "로그아웃" })).toBeVisible();
  await page.getByLabel("닉네임", { exact: true }).fill("테스트유저");
  await page.getByRole("button", { name: "건너뛰기" }).click();
  await page.getByRole("button", { name: "완료", exact: true }).click();
  await expect(page.getByText("보유 포인트", { exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/auth-home.png", fullPage: true });
  await page.goto("/quests");
  await expect(
    page.getByRole("heading", { name: "오늘의 퀘스트" }),
  ).toBeVisible();
  await expect(page.locator(".quest-list .quest")).toHaveCount(4);
  await page.goto("/settings");
  await page.getByLabel("닉네임", { exact: true }).fill("새닉네임");
  await page.getByLabel("랭킹에서 익명으로 표시").check();
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.getByText("저장했습니다.")).toBeVisible();
  await page.goto("/play");
  await page.getByRole("button", { name: "1 vs 1", exact: true }).click();
  await page.getByRole("button", { name: "방 만들기", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "선택의 시작점" }),
  ).toBeVisible();
  await expect(page.getByText("새닉네임", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "준비 완료", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "경기 시작", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "준비 취소", exact: true }),
  ).toBeVisible();
  const roomUrl = page.url();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "준비 취소", exact: true }),
  ).toBeVisible();
  expect(page.url()).toBe(roomUrl);
  await page.screenshot({
    path: "test-results/auth-lobby.png",
    fullPage: true,
  });
  await page.reload();
  await expect(page.getByRole("button", { name: "로그아웃" })).toBeVisible();
  await page.getByRole("button", { name: "로그아웃" }).click();
  await expect(
    page.getByRole("button", { name: "Google로 시작하기" }),
  ).toBeEnabled();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Google로 시작하기" }),
  ).toBeEnabled();
});
