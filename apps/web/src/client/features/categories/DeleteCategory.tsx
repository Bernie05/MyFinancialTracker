import { Select } from "@mft/ui";
import { useState } from "react";
import type { CategoryListItem } from "../../../shared/contracts";
import { api } from "../../api/endpoints";
import { ConfirmDialog } from "../../layout/ConfirmDialog";
import { categoryOptions } from "../../lib/categoryOptions";

interface DeleteCategoryProps {
  category: CategoryListItem | null;
  /** Every category, to offer destinations for its transactions and subcategories. */
  all: CategoryListItem[];
  onDeleted: (message: string) => void;
  onClose: () => void;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Deleting is never a surprise: subcategories either move under another parent or (if unused) go too,
 * and the category's own transactions move first. The API does it all in one database transaction.
 */
export function DeleteCategory({ category, all, onDeleted, onClose }: DeleteCategoryProps) {
  const [moveTo, setMoveTo] = useState("");
  const [childPlan, setChildPlan] = useState<"move" | "delete">("move");
  const [childrenTo, setChildrenTo] = useState("");

  const children = category ? all.filter((c) => c.parentId === category.id) : [];
  const childrenUsed = children.some((c) => c.transactionCount > 0);
  const childrenTargets = category ? all.filter((c) => c.parentId === null && c.type === category.type && c.id !== category.id) : [];
  const deletingChildren = children.length > 0 && childPlan === "delete";
  // Its own transactions can go anywhere of the same type, except itself or subcategories being deleted.
  const moveOptions = category
    ? categoryOptions(all, category.type, category.id).filter((o) => !(deletingChildren && children.some((c) => String(c.id) === o.value)))
    : [];
  const chosenMove = moveTo && moveOptions.some((o) => o.value === moveTo) ? moveTo : (moveOptions[0]?.value ?? "");
  const chosenChildrenTo = childrenTo || (childrenTargets[0] ? String(childrenTargets[0].id) : "");

  const count = category?.transactionCount ?? 0;
  const blockedMove = count > 0 && moveOptions.length === 0;
  const blockedChildren = children.length > 0 && (childPlan === "move" ? childrenTargets.length === 0 : childrenUsed);

  function reset() {
    setMoveTo("");
    setChildrenTo("");
    setChildPlan("move");
    onClose();
  }

  const message = !category
    ? ""
    : [
        children.length > 0 && `${category.name} has ${plural(children.length, "subcategory", "subcategories")}.`,
        count > 0 ? `Its ${plural(count, "transaction", "transactions")} will move to the category you choose.` : "No transactions are booked on it directly.",
        blockedMove && `There's no other ${category.type} category to move them to. Add one first.`,
      ]
        .filter(Boolean)
        .join(" ");

  return (
    <ConfirmDialog
      open={category !== null}
      title={category ? `Delete “${category.name}”?` : "Delete category?"}
      message={message}
      confirmLabel={count > 0 || children.length > 0 ? "Move and delete" : "Delete"}
      confirmDisabled={blockedMove || blockedChildren}
      onConfirm={async () => {
        if (!category) return;
        await api.deleteCategory(category.id, {
          moveTo: count > 0 ? Number(chosenMove) : undefined,
          childrenTo: children.length > 0 && childPlan === "move" ? Number(chosenChildrenTo) : undefined,
          deleteChildren: deletingChildren,
        });
        onDeleted(`${category.name} deleted`);
      }}
      onClose={reset}
    >
      {children.length > 0 && (
        <fieldset className="choice">
          <legend className="mft-field__label">Its subcategories</legend>
          <label className="choice__option">
            <input type="radio" name="children-plan" checked={childPlan === "move"} onChange={() => setChildPlan("move")} />
            <span>Move them under another category</span>
          </label>
          {childPlan === "move" &&
            (childrenTargets.length > 0 ? (
              <Select
                label="Move subcategories to"
                value={chosenChildrenTo}
                onChange={(e) => setChildrenTo(e.target.value)}
                options={childrenTargets.map((t) => ({ value: String(t.id), label: t.name }))}
              />
            ) : (
              <p className="cat-editor__hint">There's no other top-level {category?.type} category to move them under.</p>
            ))}
          <label className="choice__option">
            <input type="radio" name="children-plan" checked={childPlan === "delete"} onChange={() => setChildPlan("delete")} />
            <span>Delete them too {childrenUsed ? "(not possible: some have transactions)" : "(none has transactions)"}</span>
          </label>
        </fieldset>
      )}
      {count > 0 && !blockedMove && (
        <Select label="Move its transactions to" value={chosenMove} onChange={(e) => setMoveTo(e.target.value)} options={moveOptions} />
      )}
    </ConfirmDialog>
  );
}
