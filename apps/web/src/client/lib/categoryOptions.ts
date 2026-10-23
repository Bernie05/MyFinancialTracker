import type { Category, TransactionType } from "../../shared/contracts";

/** Parents sorted by name, each followed by its subcategories. */
export function categoryTree<T extends Category>(categories: T[], type?: TransactionType) {
  const ofType = type ? categories.filter((c) => c.type === type) : categories;
  const byName = (a: T, b: T) => a.name.localeCompare(b.name);
  return ofType
    .filter((c) => c.parentId === null)
    .sort(byName)
    .map((parent) => ({ parent, children: ofType.filter((c) => c.parentId === parent.id).sort(byName) }));
}

/** A category's name as a picker shows it: "Bills & utilities › Electric" for a subcategory. */
export function categoryPath(category: Category, categories: Category[]) {
  const parent = category.parentId === null ? undefined : categories.find((c) => c.id === category.parentId);
  return parent ? `${parent.name} › ${category.name}` : category.name;
}

/**
 * Options for a native select: each parent (selectable) then its subcategories as "Parent › Child".
 * Native <optgroup> labels can't be picked, and parents must stay pickable, so the path is in the label.
 */
export function categoryOptions(categories: Category[], type?: TransactionType, exceptId?: number) {
  return categoryTree(categories, type).flatMap(({ parent, children }) =>
    [parent, ...children].filter((c) => c.id !== exceptId).map((c) => ({ value: String(c.id), label: categoryPath(c, categories) })),
  );
}
