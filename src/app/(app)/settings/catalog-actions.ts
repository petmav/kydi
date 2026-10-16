"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { failure, guard, parseForm, success, zCheckbox, zOptionalString, type ActionState } from "@/lib/action";
import { requireAbility, requireOwner, ForbiddenError } from "@/lib/auth/context";
import { toMinor } from "@/lib/money";
import { withDependencies } from "@/lib/abilities";
import { CF_MODELS, CF_TYPES, customFieldSlug } from "@/lib/custom-fields";

const zId = z.coerce.number().int().positive();
const zName = z.string().trim().min(1, "Enter a name.").max(255);

function done(path: string, message: string) {
  revalidatePath(path);
  return success(message);
}

// ---- Tax types ------------------------------------------------------------------
const taxSchema = z
  .object({
    id: zId.optional(),
    name: zName,
    transactionType: z.enum(["SALES", "PURCHASES"]),
    calculationType: z.enum(["PERCENTAGE", "FIXED"]),
    percent: z.string().optional(),
    fixedAmount: z.string().optional(),
    description: z.string().trim().max(255).optional(),
    compound: zCheckbox,
  })
  .transform((d, c) => {
    let percent: number | null = null;
    let fixedAmount: number | null = null;
    if (d.calculationType === "PERCENTAGE") {
      percent = Number(d.percent);
      if (d.percent === undefined || d.percent === "" || !Number.isFinite(percent) || percent < 0 || percent > 100) {
        c.addIssue({ code: z.ZodIssueCode.custom, path: ["percent"], message: "Enter a percentage between 0 and 100." });
        return z.NEVER;
      }
      percent = Math.round(percent * 100) / 100;
    } else {
      fixedAmount = toMinor(d.fixedAmount);
      if (!Number.isFinite(fixedAmount) || fixedAmount < 0) {
        c.addIssue({ code: z.ZodIssueCode.custom, path: ["fixedAmount"], message: "Enter a valid amount." });
        return z.NEVER;
      }
    }
    return { ...d, percent, fixedAmount, description: d.description || null };
  });

export async function saveTaxTypeAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return guard(async () => {
    const parsed = parseForm(taxSchema, formData);
    if (!parsed.success) return parsed.state;
    const { id, ...data } = parsed.data;
    const ctx = await requireAbility(id ? "edit-tax-type" : "create-tax-type");
    const dup = await db.taxType.findFirst({ where: { companyId: ctx.companyId, name: data.name, NOT: id ? { id } : undefined } });
    if (dup) return failure("A tax type with this name already exists.", { name: ["Name already in use."] });
    if (id) {
      const res = await db.taxType.updateMany({ where: { id, companyId: ctx.companyId }, data });
      if (!res.count) return failure("Tax type not found.");
    } else {
      await db.taxType.create({ data: { ...data, companyId: ctx.companyId } });
    }
    return done("/settings/tax-types", id ? "Tax type updated." : "Tax type created.");
  });
}

export async function deleteTaxTypeAction(id: number): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireAbility("delete-tax-type");
    const t = await db.taxType.findFirst({
      where: { id, companyId: ctx.companyId },
      include: { _count: { select: { appliedTaxes: true, itemTaxes: true, expenseTaxes: true } } },
    });
    if (!t) return failure("Tax type not found.");
    if (t._count.appliedTaxes + t._count.itemTaxes + t._count.expenseTaxes > 0) {
      return failure("This tax type is attached to documents, items or expenses and cannot be deleted.");
    }
    await db.taxType.delete({ where: { id } });
    return done("/settings/tax-types", "Tax type deleted.");
  });
}

// ---- Payment modes ----------------------------------------------------------------
const nameSchema = z.object({ id: zId.optional(), name: zName });

export async function savePaymentMethodAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return guard(async () => {
    const parsed = parseForm(nameSchema, formData);
    if (!parsed.success) return parsed.state;
    const { id, name } = parsed.data;
    const ctx = await requireAbility(id ? "edit-payment" : "create-payment");
    if (await db.paymentMethod.findFirst({ where: { companyId: ctx.companyId, name, NOT: id ? { id } : undefined } })) {
      return failure("A payment mode with this name already exists.", { name: ["Name already in use."] });
    }
    if (id) await db.paymentMethod.updateMany({ where: { id, companyId: ctx.companyId }, data: { name } });
    else await db.paymentMethod.create({ data: { companyId: ctx.companyId, name } });
    return done("/settings/payment-modes", id ? "Payment mode updated." : "Payment mode created.");
  });
}

export async function deletePaymentMethodAction(id: number): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireAbility("delete-payment");
    const m = await db.paymentMethod.findFirst({
      where: { id, companyId: ctx.companyId },
      include: { _count: { select: { payments: true, expenses: true } } },
    });
    if (!m) return failure("Payment mode not found.");
    if (m._count.payments + m._count.expenses > 0) return failure("This payment mode is used by payments or expenses and cannot be deleted.");
    await db.paymentMethod.delete({ where: { id } });
    return done("/settings/payment-modes", "Payment mode deleted.");
  });
}

// ---- Expense categories -------------------------------------------------------------
const categorySchema = z.object({ id: zId.optional(), name: zName, description: zOptionalString });

export async function saveExpenseCategoryAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return guard(async () => {
    const parsed = parseForm(categorySchema, formData);
    if (!parsed.success) return parsed.state;
    const { id, ...data } = parsed.data;
    const ctx = await requireAbility(id ? "edit-expense" : "create-expense");
    if (id) await db.expenseCategory.updateMany({ where: { id, companyId: ctx.companyId }, data });
    else await db.expenseCategory.create({ data: { ...data, companyId: ctx.companyId } });
    revalidatePath("/expenses", "layout");
    return done("/settings/expense-categories", id ? "Category updated." : "Category created.");
  });
}

export async function deleteExpenseCategoryAction(id: number): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireAbility("delete-expense");
    const c = await db.expenseCategory.findFirst({ where: { id, companyId: ctx.companyId }, include: { _count: { select: { expenses: true } } } });
    if (!c) return failure("Category not found.");
    if (c._count.expenses > 0) return failure("This category has expenses attached and cannot be deleted.");
    await db.expenseCategory.delete({ where: { id } });
    return done("/settings/expense-categories", "Category deleted.");
  });
}

// ---- Units ------------------------------------------------------------------------------
export async function saveUnitAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return guard(async () => {
    const parsed = parseForm(nameSchema, formData);
    if (!parsed.success) return parsed.state;
    const { id, name } = parsed.data;
    const ctx = await requireAbility(id ? "edit-item" : "create-item");
    if (await db.unit.findFirst({ where: { companyId: ctx.companyId, name, NOT: id ? { id } : undefined } })) {
      return failure("A unit with this name already exists.", { name: ["Name already in use."] });
    }
    const unit = id
      ? (await db.unit.updateMany({ where: { id, companyId: ctx.companyId }, data: { name } }), { id })
      : await db.unit.create({ data: { companyId: ctx.companyId, name } });
    revalidatePath("/items", "layout");
    revalidatePath("/settings/customization");
    return success(id ? "Unit updated." : "Unit created.", { id: unit.id, name });
  });
}

export async function deleteUnitAction(id: number): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireAbility("delete-item");
    const u = await db.unit.findFirst({ where: { id, companyId: ctx.companyId }, include: { _count: { select: { items: true } } } });
    if (!u) return failure("Unit not found.");
    if (u._count.items > 0) return failure("Unit in use: items reference this unit.");
    await db.unit.delete({ where: { id } });
    return done("/settings/customization", "Unit deleted.");
  });
}

// ---- Notes --------------------------------------------------------------------------------
const noteSchema = z.object({
  id: zId.optional(),
  name: zName,
  type: z.enum(["Invoice", "Estimate", "Payment"]),
  notes: z.string().trim().min(1, "Enter the note text.").max(65000),
  isDefault: zCheckbox,
});

export async function saveNoteAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireAbility("manage-all-notes");
    const parsed = parseForm(noteSchema, formData);
    if (!parsed.success) return parsed.state;
    const { id, ...data } = parsed.data;
    if (await db.note.findFirst({ where: { companyId: ctx.companyId, type: data.type, name: data.name, NOT: id ? { id } : undefined } })) {
      return failure("A note with this name already exists for this type.", { name: ["Name already in use."] });
    }
    await db.$transaction(async (tx) => {
      if (data.isDefault) await tx.note.updateMany({ where: { companyId: ctx.companyId, type: data.type }, data: { isDefault: false } });
      if (id) await tx.note.updateMany({ where: { id, companyId: ctx.companyId }, data });
      else await tx.note.create({ data: { ...data, companyId: ctx.companyId } });
    });
    return done("/settings/notes", id ? "Note updated." : "Note created.");
  });
}

export async function deleteNoteAction(id: number): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireAbility("manage-all-notes");
    await db.note.deleteMany({ where: { id, companyId: ctx.companyId } });
    return done("/settings/notes", "Note deleted.");
  });
}

// ---- Custom fields --------------------------------------------------------------------------
const optNum = z
  .string()
  .optional()
  .transform((v) => (v === undefined || v.trim() === "" ? null : Number(v)))
  .refine((v) => v === null || Number.isFinite(v), "Enter a number.");

const cfSchema = z
  .object({
    id: zId.optional(),
    modelType: z.enum(CF_MODELS),
    name: z.string().trim().min(1, "Enter a name.").max(100),
    label: z.string().trim().min(1, "Enter a label.").max(255),
    type: z.enum(CF_TYPES),
    placeholder: zOptionalString,
    options: z.string().optional(),
    defaultAnswer: zOptionalString,
    order: z.coerce.number().int().min(0).max(9999),
    isRequired: zCheckbox,
    showOnDocument: zCheckbox,
    min_length: optNum,
    max_length: optNum,
    min: optNum,
    max: optNum,
    earliest: zOptionalString,
    latest: zOptionalString,
    pattern: z
      .string()
      .max(255)
      .optional()
      .refine((p) => {
        if (!p) return true;
        try {
          new RegExp(p);
          return true;
        } catch {
          return false;
        }
      }, "Invalid regular expression."),
  })
  .superRefine((d, c) => {
    if (d.type === "Dropdown" && !(d.options ?? "").split("\n").some((o) => o.trim())) {
      c.addIssue({ code: z.ZodIssueCode.custom, path: ["options"], message: "Add at least one option (one per line)." });
    }
  });

export async function saveCustomFieldAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return guard(async () => {
    const parsed = parseForm(cfSchema, formData);
    if (!parsed.success) return parsed.state;
    const d = parsed.data;
    const ctx = await requireAbility(d.id ? "edit-custom-field" : "create-custom-field");
    const options = (d.options ?? "")
      .split("\n")
      .map((o) => o.trim())
      .filter(Boolean);
    const validation = {
      min_length: d.min_length,
      max_length: d.max_length,
      min: d.min,
      max: d.max,
      earliest: d.earliest ?? null,
      latest: d.latest ?? null,
      pattern: d.pattern || null,
    };
    const data = {
      name: d.name,
      label: d.label,
      placeholder: d.placeholder ?? null,
      options: d.type === "Dropdown" ? options : [],
      defaultAnswer: d.defaultAnswer ?? null,
      order: d.order,
      isRequired: d.isRequired,
      placement: d.showOnDocument ? "document" : "internal",
      validation,
    };
    if (d.id) {
      const existing = await db.customField.findFirst({ where: { id: d.id, companyId: ctx.companyId }, include: { _count: { select: { values: true } } } });
      if (!existing) return failure("Custom field not found.");
      const inUse = existing._count.values > 0;
      if (inUse && (existing.modelType !== d.modelType || existing.type !== d.type)) {
        return failure("Model and type cannot change while the field has answers.");
      }
      await db.customField.update({ where: { id: d.id }, data: { ...data, modelType: d.modelType, type: d.type } });
    } else {
      const base = customFieldSlug(d.modelType, d.name);
      let slug = base;
      for (let i = 1; await db.customField.findFirst({ where: { companyId: ctx.companyId, slug } }); i++) {
        if (i > 10) return failure("Too many fields with this name.", { name: ["Choose a different name."] });
        slug = `${base}_${i}`;
      }
      await db.customField.create({ data: { ...data, companyId: ctx.companyId, slug, modelType: d.modelType, type: d.type } });
    }
    return done("/settings/custom-fields", d.id ? "Custom field updated." : "Custom field created.");
  });
}

export async function deleteCustomFieldAction(id: number): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireAbility("delete-custom-field");
    await db.customField.deleteMany({ where: { id, companyId: ctx.companyId } });
    return done("/settings/custom-fields", "Custom field deleted.");
  });
}

// ---- Roles (owner) ----------------------------------------------------------------------------
const roleSchema = z.object({
  id: zId.optional(),
  title: z.string().trim().min(2, "Enter a role name.").max(60),
  abilities: z.union([z.string(), z.array(z.string())]).optional(),
});

export async function saveRoleAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireOwner();
    const parsed = parseForm(roleSchema, formData);
    if (!parsed.success) return parsed.state;
    const { id, title } = parsed.data;
    const abilities = withDependencies([parsed.data.abilities ?? []].flat());
    if (abilities.length === 0) return failure("Select at least one ability.", { abilities: ["Select at least one ability."] });
    const name = title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    if (await db.role.findFirst({ where: { companyId: ctx.companyId, name, NOT: id ? { id } : undefined } })) {
      return failure("A role with this name already exists.", { title: ["Name already in use."] });
    }
    if (id) {
      const role = await db.role.findFirst({ where: { id, companyId: ctx.companyId } });
      if (!role) return failure("Role not found.");
      if (role.isOwner) throw new ForbiddenError("The owner role cannot be edited.");
      await db.role.update({ where: { id }, data: { title, name, abilities } });
    } else {
      await db.role.create({ data: { companyId: ctx.companyId, title, name, abilities } });
    }
    return done("/settings/roles", id ? "Role updated." : "Role created.");
  });
}

export async function deleteRoleAction(id: number): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireOwner();
    const role = await db.role.findFirst({ where: { id, companyId: ctx.companyId }, include: { _count: { select: { members: true } } } });
    if (!role) return failure("Role not found.");
    if (role.isOwner || ["owner", "manager", "read-only"].includes(role.name)) return failure("Preset roles cannot be deleted.");
    if (role._count.members > 0) return failure("This role is assigned to members and cannot be deleted.");
    await db.invitation.deleteMany({ where: { roleId: id, status: "PENDING" } });
    await db.role.delete({ where: { id } });
    return done("/settings/roles", "Role deleted.");
  });
}
