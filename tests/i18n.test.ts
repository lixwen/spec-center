import { describe, expect, it } from "vitest";
import { getMessages, getStatusLabel, normalizeLocale } from "../apps/web/lib/i18n";

describe("web localization", () => {
  it("normalizes locale values into the supported bilingual set", () => {
    expect(normalizeLocale("zh")).toBe("zh-CN");
    expect(normalizeLocale("zh-CN,zh;q=0.9,en;q=0.8")).toBe("zh-CN");
    expect(normalizeLocale("en-US,en;q=0.9")).toBe("en");
    expect(normalizeLocale(undefined)).toBe("en");
  });

  it("falls back to English copy when a localized string is missing", () => {
    const zh = getMessages("zh-CN");

    expect(zh.common.localeNames.en).toBe("English");
    expect(zh.layout.workflowSteps).toBe("propose → sync → review → approve → archive");
  });

  it("preserves English domain terms where the glossary chooses not to hard-translate", () => {
    const zh = getMessages("zh-CN");

    expect(zh.review.eyebrow).toBe("Review Workspace");
    expect(zh.productSpecs.eyebrow).toBe("Product Spec Browser");
    expect(getStatusLabel("baseline", "zh-CN")).toBe("baseline");
  });

  it("includes project management settings copy in both locales", () => {
    const en = getMessages("en");
    const zh = getMessages("zh-CN");

    expect(en.settings.projectsTitle).toContain("project");
    expect(en.settings.repoBindingsAutoHint).toBeTruthy();
    expect(zh.settings.projectsTitle).toContain("项目");
    expect(zh.settings.openProjectManagement).toContain("项目管理");
  });
});
