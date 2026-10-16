import { describe, expect, it } from "vitest";
import { lineFieldsFrom, normalizeLineAnswers, type CustomFieldDef } from "@/lib/custom-fields";

const def = (id: number, type: string, label: string, extra: Partial<CustomFieldDef> = {}): CustomFieldDef => ({
  id,
  label,
  name: label.toLowerCase(),
  slug: `CUSTOM_ITEM_${label.toUpperCase()}`,
  type,
  placeholder: null,
  options: [],
  defaultAnswer: null,
  isRequired: false,
  order: id,
  placement: "document",
  validation: null,
  ...extra,
});

describe("item custom fields on document lines", () => {
  const fields = [def(1, "Input", "Serial"), def(2, "Number", "Weight", { validation: { min: 0 } }), def(3, "Dropdown", "Grade", { options: ["A", "B"] })];

  it("keeps only line fields, trims text and drops blanks", () => {
    const r = normalizeLineAnswers(fields, { "1": "  SN-0042 ", "2": "2.5", "3": "", "9": "ignored" }, "2026-10-16");
    expect(r).toEqual({ values: { "1": "SN-0042", "2": "2.5" }, error: null });
    expect(normalizeLineAnswers(fields, {}, "2026-10-16")).toEqual({ values: null, error: null });
  });

  it("reports the first invalid answer with its label", () => {
    const r = normalizeLineAnswers(fields, { "2": "heavy", "3": "C" }, "2026-10-16");
    expect(r.error).toBe("Weight: Enter a number.");
  });

  it("only document-placed item fields become line columns", () => {
    expect(lineFieldsFrom([def(1, "Input", "Serial"), def(4, "Input", "Internal", { placement: "internal" })]).map((f) => f.id)).toEqual([1]);
  });
});
