import { expect, test } from "@playwright/test";

test("complete retained-evidence journey", async ({ page }) => {
  await page.goto("/");

  const sample = "  Command fail.\n";
  await page.getByLabel("Writing Sample").fill(sample);
  await page.getByRole("button", { name: "Evaluate writing" }).click();

  const writingLens = page.getByRole("complementary", {
    name: "Feedback",
  });
  await expect(writingLens.getByText("85", { exact: true })).toBeVisible();
  await expect(writingLens).toContainText("fail → fails");
  await writingLens.getByRole("link", { name: "Open evaluation" }).click();

  await expect(
    page.getByRole("heading", { name: "One local agreement error." })
  ).toBeVisible();
  await expect(
    page.getByRole("region", { exact: true, name: "Original" })
  ).toContainText("Command fail.");
  await expect(
    page.getByRole("region", { exact: true, name: "Corrected" })
  ).toContainText("Command fails.");

  await page.getByRole("link", { name: "Progress" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Progress" })
  ).toBeVisible();
  await expect(page.getByText("50 per 100 words")).toBeVisible();
  await page
    .getByRole("link", { name: /Verb form\/tense/u })
    .first()
    .click();
  await expect(
    page.getByRole("complementary", { name: "Progress evidence" })
  ).toContainText("A singular subject needs a singular verb.");

  await page.getByRole("link", { exact: true, name: "History" }).click();
  await page.getByRole("link", { name: "One local agreement error." }).click();
  await page.getByRole("button", { name: "Delete evaluation" }).click();
  await page.getByRole("button", { name: "Delete permanently" }).click();
  await expect(page.getByText("No evaluations yet.")).toBeVisible();

  await page.getByRole("link", { name: "Progress" }).click();
  await expect(page.getByText("No evaluations in this period.")).toBeVisible();
});
