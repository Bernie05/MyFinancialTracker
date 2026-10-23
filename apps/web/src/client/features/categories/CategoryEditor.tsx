import { Badge, Button, SegmentedControl, Select, TextField, TransactionRow } from "@mft/ui";
import { useState, type FormEvent } from "react";
import {
  categoryColorPresets,
  colorOwner,
  newCategorySchema,
  type CategoryListItem,
  type TransactionType,
} from "../../../shared/contracts";
import { ApiError } from "../../api/client";
import { api } from "../../api/endpoints";
import { ColorPicker, isHex } from "../../layout/ColorPicker";
import { categoryColor } from "../../lib/categoryColor";

interface CategoryEditorProps {
  /** The category being edited, or null to create one. */
  category: CategoryListItem | null;
  /** Every category, so colors used by others can be hidden or rejected. */
  all: CategoryListItem[];
  /** Type to start with when creating. */
  defaultType: TransactionType;
  /** Parent to start with when creating ("+ Add subcategory"). */
  defaultParentId?: number | null;
  onSaved: (message: string) => void;
  onCancel: () => void;
}

type FieldErrors = Partial<Record<"name" | "type" | "color" | "parentId", string>>;

const typeOptions = [
  { value: "expense", label: "Expense" },
  { value: "income", label: "Income" },
] as const;

const label = (key: string) => key.charAt(0).toUpperCase() + key.slice(1);

/** Name, type and color, with a live preview of how the category will look across the app. */
export function CategoryEditor({ category, all, defaultType, defaultParentId = null, onSaved, onCancel }: CategoryEditorProps) {
  // Colors belong to top-level categories and are unique among them (both types share the dashboard).
  const parents = all.filter((c) => c.parentId === null);
  const freePresets = categoryColorPresets.filter((key) => !colorOwner(parents, key, category?.id));
  const [name, setName] = useState(category?.name ?? "");
  const [parentId, setParentId] = useState(String(category?.parentId ?? defaultParentId ?? ""));
  const [type, setType] = useState<TransactionType>(category?.type ?? defaultType);
  const isTopLevel = category?.parentId === null || (category === null && defaultParentId === null);
  const [color, setColor] = useState(isTopLevel && category ? category.color : (freePresets[0] ?? "#c0392b"));
  const parent = parents.find((c) => String(c.id) === parentId);
  const hasChildren = category !== null && all.some((c) => c.parentId === category.id);
  // A subcategory follows its parent's type and color.
  const effectiveType = parent?.type ?? type;
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Preview falls back to grey while a custom hex is half-typed.
  const css = parent ? categoryColor(parent.color) : color.startsWith("#") && !isHex(color) ? "var(--cat-grey)" : categoryColor(color);
  const clash = parent ? undefined : colorOwner(parents, color, category?.id);
  const clashMessage = clash && `${clash.name} already uses this color. Pick another.`;
  const locked = (category?.transactionCount ?? 0) > 0;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    const parsed = newCategorySchema.safeParse(
      parent ? { name, type: parent.type, parentId: parent.id } : { name, type, color, parentId: null },
    );
    if (clashMessage) {
      setErrors({ color: clashMessage });
      return;
    }
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) next[issue.path[0] as keyof FieldErrors] ??= issue.message;
      setErrors(next);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      const { color: chosen, ...rest } = parsed.data;
      if (category) await api.updateCategory(category.id, parent ? { name: rest.name, parentId: parent.id } : { ...rest, color: chosen });
      else await api.createCategory(parsed.data);
      onSaved(category ? `${parsed.data.name} saved` : `${parsed.data.name} added`);
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length > 0) setErrors(err.fields as FieldErrors);
      else setFormError(err instanceof Error ? err.message : "Couldn't save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="cat-editor" onSubmit={onSubmit} noValidate>
      <TextField label="Name" placeholder="Bills & utilities" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} error={errors.name} data-autofocus />

      <Select
        label="Parent"
        value={parentId}
        onChange={(e) => setParentId(e.target.value)}
        disabled={hasChildren}
        error={errors.parentId}
        hint={hasChildren ? "It has subcategories, so it stays top level." : "Pick one to make this a subcategory. It takes the parent's color."}
        options={[
          { value: "", label: "None (top level)" },
          ...parents
            .filter((c) => c.id !== category?.id && (!locked || c.type === category?.type))
            .sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name))
            .map((c) => ({ value: String(c.id), label: `${c.name} (${c.type})` })),
        ]}
      />

      <div className="cat-editor__type">
        <span className="mft-field__label">Type</span>
        {parent ? (
          <p className="cat-editor__hint">
            {label(effectiveType)}, like {parent.name}.
          </p>
        ) : locked ? (
          <p className="cat-editor__hint">
            {label(type)}. It has transactions, so its type stays the same.
          </p>
        ) : (
          <SegmentedControl aria-label="Type" options={typeOptions} value={type} onChange={setType} />
        )}
        {errors.type && <p className="cat-editor__error">{errors.type}</p>}
      </div>

      {parent ? (
        <p className="cat-editor__hint">Color: inherited from {parent.name}.</p>
      ) : (
        <ColorPicker value={color} onChange={setColor} taken={parents} exceptId={category?.id} noun="category" error={errors.color} />
      )}

      {/* Live preview: the chip, the ledger avatar and a report bar, all in this color. */}
      <section className="cat-preview" aria-label="Preview">
        <p className="mft-field__label">Preview</p>
        <div className="cat-preview__box">
          <Badge category={css}>{name.trim() || "Category"}</Badge>
          <TransactionRow
            className="cat-preview__row"
            description="Example transaction"
            category={name.trim() || "Category"}
            categoryColor={css}
            date="Today"
            minorUnits={effectiveType === "expense" ? -125000 : 125000}
          />
          <div className="cat-preview__bar">
            <span style={{ width: "62%", background: css }} />
          </div>
        </div>
      </section>

      {formError && (
        <p className="cat-editor__error" role="alert">
          {formError}
        </p>
      )}

      <div className="dialog__actions">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" loading={saving}>
          {category ? "Save category" : "Add category"}
        </Button>
      </div>
    </form>
  );
}
