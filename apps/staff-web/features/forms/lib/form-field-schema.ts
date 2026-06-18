import { z } from "zod";
import { FIELD_ID_PATTERN } from "./validate-fields.js";

const FieldIdSchema = z
  .string()
  .regex(FIELD_ID_PATTERN, "Field id must match [A-Za-z0-9_-]+");

export const FormFieldSchema = z.object({
  id: FieldIdSchema,
  type: z.enum([
    "text",
    "email",
    "number",
    "textarea",
    "select",
    "multiselect",
    "checkbox",
    "radio",
    "date",
    "rating",
    "scale",
  ]),
  label: z.string().min(1),
  placeholder: z.string().optional(),
  description: z.string().optional(),
  required: z.boolean(),
  options: z.array(z.string()).optional(),
  validation: z
    .object({
      min: z.number().optional(),
      max: z.number().optional(),
      pattern: z.string().optional(),
      message: z.string().optional(),
    })
    .optional(),
  conditional: z
    .object({
      fieldId: FieldIdSchema,
      operator: z.enum(["equals", "not_equals", "contains"]),
      value: z.string(),
    })
    .optional(),
  width: z.enum(["full", "half"]).optional(),
});

export type FormFieldInput = z.infer<typeof FormFieldSchema>;
