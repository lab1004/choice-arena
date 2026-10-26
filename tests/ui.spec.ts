import { expect, test } from "@playwright/test";
for (const width of [320, 390, 768, 1440]) {
  test(`${width}px: login and no horizontal overflow`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await expect(
      page.getByRole("button", { name: "Google로 시작하기" }),
    ).toBeEnabled();
    await expect(page.getByText("선택이 전략이 되는 곳")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    const button = await page
      .getByRole("button", { name: "Google로 시작하기" })
      .boundingBox();
    expect(button!.height).toBeGreaterThanOrEqual(44);
    await page.screenshot({
      path: `test-results/home-${width}.png`,
      fullPage: true,
    });
    expect(errors).toEqual([]);
  });
}
test("offline state explains recovery and prevents new login", async ({
  page,
  context,
}) => {
  await page.goto("/");
  const login = page.getByRole("button", { name: "Google로 시작하기" });
  await expect(login).toBeEnabled();
  await context.setOffline(true);
  await expect(page.getByText("인터넷 연결이 끊겼습니다.")).toBeVisible();
  await expect(login).toBeDisabled();
  await context.setOffline(false);
  await expect(login).toBeEnabled();
});
