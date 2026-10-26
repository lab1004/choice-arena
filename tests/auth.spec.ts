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
for (const width of [360, 375, 390, 768, 1440]) {
  test(`${width}px authenticated pages preserve room membership and deny match shortcuts`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 850 });
    await page.goto("/home");
    await expect(page).toHaveURL(/\/login$/);
    await page.evaluate(async () => {
      const path = "/tests/fixtures/emulator-auth.ts";
      await (await import(/* @vite-ignore */ path)).signInForAuthTest();
    });
    await expect(page).toHaveURL(/\/onboarding$/);
    await page.goto("/ranking");
    await expect(page).toHaveURL(/\/onboarding$/);
    await page.getByLabel("게임 닉네임", { exact: true }).fill("선택테스터");
    await page.getByRole("button", { name: "다음: 프로필 사진" }).click();
    await page.getByRole("button", { name: "사진 선택 건너뛰고 가입" }).click();
    await expect(page).toHaveURL(/\/home$/);
    await expect(page.getByText("보유 포인트", { exact: true })).toBeVisible();
    await expect(page.getByText("티어", { exact: true })).toHaveCount(0);
    await expect(
      page.getByRole("navigation", { name: "공통 메뉴" }),
    ).toHaveCount(0);
    await expect(page.getByRole("link", { name: /꾸미기/ })).toHaveCount(0);
    await page.getByRole("link", { name: /게임 시작/ }).click();
    await expect(page).toHaveURL(/\/play$/);
    await expect(page.getByRole("heading", { name: "혼자 연습" })).toHaveCount(
      0,
    );
    await expect(page.getByLabel("6자리 방 코드")).not.toHaveAttribute(
      "placeholder",
      /.+/,
    );

    await page.getByRole("button", { name: "새로운 방 만들기" }).click();
    await expect(page).toHaveURL(/\/rooms\/[A-Z2-9]{6}$/);
    const roomUrl = page.url();
    await expect(
      page.getByRole("button", { name: "준비 완료", exact: true }),
    ).toBeEnabled();
    await page.reload();
    await expect(
      page.getByRole("button", { name: "준비 완료", exact: true }),
    ).toBeEnabled();
    await page.getByRole("link", { name: /메인 메뉴 \(참가 유지\)/ }).click();
    await expect(
      page.getByRole("link", { name: "참가 중인 대기실로 돌아가기" }),
    ).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(roomUrl);
    for (const path of [
      "/quests",
      "/ranking",
      "/history",
      "/customize",
      "/settings",
      "/matches/no-access/vote",
      "/matches/no-access",
      "/matches/no-access/result",
    ]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    await expect(
      page.getByRole("heading", { name: "경기에 접근할 수 없어요" }),
    ).toBeVisible();
    await page.goto("/rooms/ZZZ999");
    await expect(
      page.getByRole("heading", { name: "참가 권한을 확인해 주세요" }),
    ).toBeVisible();
    await page.goto(roomUrl);
    await page.getByRole("button", { name: "준비 완료", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "준비 취소하기" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "방 나가기", exact: true }).click();
    await page.getByRole("button", { name: "방 나가기", exact: true }).click();
    await page.goto("/home");
    await expect(
      page.getByRole("link", { name: "참가 중인 대기실로 돌아가기" }),
    ).toHaveCount(0);
  });
}
