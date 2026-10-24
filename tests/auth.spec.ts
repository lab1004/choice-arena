import { test, expect } from "@playwright/test";
test("Firebase Auth Emulator: Google-provider session persists on reload and logout clears it", async ({
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
