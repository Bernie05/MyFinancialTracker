import { Button, Card, TextField } from "@mft/ui";
import { useEffect, useState, type ReactNode } from "react";
import type { CategoryListItem, TransactionType } from "../../../shared/contracts";
import { api } from "../../api/endpoints";
import { Dialog } from "../../layout/Dialog";
import { EmptyState } from "../../layout/EmptyState";
import { ChevronDownIcon, PencilIcon, PlusIcon, SearchIcon, TrashIcon } from "../../layout/icons";
import { Loadable } from "../../layout/Loadable";
import { PageHeader } from "../../layout/PageHeader";
import { categoryColor } from "../../lib/categoryColor";
import { categoryTree } from "../../lib/categoryOptions";
import { useAsync } from "../../lib/useAsync";
import { CategoryEditor } from "./CategoryEditor";
import { DeleteCategory } from "./DeleteCategory";

/** What the editor opens with: an existing category, or a new one (top level or under a parent). */
type Editing = { category: CategoryListItem | null; type: TransactionType; parentId: number | null } | null;

const groups = [
  { type: "expense", title: "Expense categories" },
  { type: "income", title: "Income categories" },
] as const;

const OPEN_KEY = "mft:categories-open";
const count = (n: number) => `${n} transaction${n === 1 ? "" : "s"}`;

/** Which parents are open: a per-viewer convenience kept in localStorage (ignored if storage is unavailable). */
function useOpenParents() {
  const [open, setOpen] = useState<Set<number>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(OPEN_KEY) ?? "[]") as number[]);
    } catch {
      return new Set();
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(OPEN_KEY, JSON.stringify([...open]));
    } catch {
      // private mode or full storage: the accordion still works, it just won't remember
    }
  }, [open]);
  const set = (ids: number[], isOpen: boolean) =>
    setOpen((prev) => {
      const next = new Set(prev);
      for (const id of ids) (isOpen ? next.add(id) : next.delete(id));
      return next;
    });
  return { open, set };
}

/** Wraps the part of `text` matching `q` in <mark>, so search results show why they matched. */
function highlight(text: string, q: string): ReactNode {
  const i = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <mark>{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

/**
 * Categories as an accordion: one item per parent (swatch, totals, a preview of its subcategories),
 * opening to its subcategories. Several can be open; search opens the matches.
 */
export function CategoriesPage() {
  const list = useAsync(() => api.listCategories(), []);
  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<CategoryListItem | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [q, setQ] = useState("");
  const { open, set } = useOpenParents();
  const query = q.trim();

  function done(message: string) {
    // A new subcategory's parent opens, so you see where it went.
    if (editing?.parentId) set([editing.parentId], true);
    setEditing(null);
    setDeleting(null);
    setAnnouncement(message);
    list.reload();
  }

  const iconButton = (label: string, icon: ReactNode, onClick: () => void) => (
    <button type="button" className="icon-button icon-button--sm" aria-label={label} title={label} onClick={onClick}>
      {icon}
    </button>
  );

  const rowActions = (c: CategoryListItem, type: TransactionType) => (
    <span className="acc__actions">
      {iconButton(`Edit ${c.name}`, <PencilIcon />, () => setEditing({ category: c, type, parentId: c.parentId }))}
      {iconButton(`Delete ${c.name}`, <TrashIcon />, () => setDeleting(c))}
    </span>
  );

  return (
    <div className="page">
      <PageHeader
        title="Categories"
        subtitle="Give each category a color; subcategories share their parent's. It shows on chips, avatars and report bars."
        actions={
          <Button iconStart={<PlusIcon />} onClick={() => setEditing({ category: null, type: "expense", parentId: null })}>
            Add category
          </Button>
        }
      />

      <div className="acc-search">
        <TextField
          label="Find a category"
          type="search"
          prefix={<SearchIcon />}
          placeholder="Electric, Groceries…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="cat-groups">
        {groups.map(({ type, title }) => (
          <Card
            key={type}
            title={title}
            padding="none"
            action={
              <Button variant="ghost" size="sm" iconStart={<PlusIcon />} onClick={() => setEditing({ category: null, type, parentId: null })}>
                Add
              </Button>
            }
          >
            <Loadable state={list.state} reload={list.reload} what="categories">
              {(all) => {
                const lower = query.toLowerCase();
                const tree = categoryTree(all, type)
                  .map((node) => {
                    const parentHit = !lower || node.parent.name.toLowerCase().includes(lower);
                    const childHits = lower ? node.children.filter((c) => c.name.toLowerCase().includes(lower)) : [];
                    return { ...node, parentHit, childHits };
                  })
                  .filter((n) => n.parentHit || n.childHits.length > 0);
                const ids = tree.map((n) => n.parent.id);

                if (categoryTree(all, type).length === 0) {
                  return <EmptyState heading={`No ${type} categories yet`}>Add one to start sorting your {type === "expense" ? "spending" : "income"}.</EmptyState>;
                }
                if (tree.length === 0) {
                  return (
                    <EmptyState
                      icon={<SearchIcon />}
                      heading={`No ${type} categories match “${query}”`}
                      action={
                        <Button variant="secondary" size="sm" onClick={() => setQ("")}>
                          Clear search
                        </Button>
                      }
                    />
                  );
                }

                return (
                  <>
                    <div className="acc-toolbar">
                      <span>
                        {tree.length} categor{tree.length === 1 ? "y" : "ies"}
                        {query && " match"}
                      </span>
                      <span className="acc-toolbar__actions">
                        <button type="button" className="link-text" onClick={() => set(ids, true)}>
                          Expand all
                        </button>
                        <button type="button" className="link-text" onClick={() => set(ids, false)}>
                          Collapse all
                        </button>
                      </span>
                    </div>
                    <ul className="acc">
                      {tree.map(({ parent, children, childHits }) => {
                        // Search opens parents whose subcategories match; otherwise the viewer's choice.
                        const isOpen = open.has(parent.id) || childHits.length > 0;
                        const color = categoryColor(parent.color);
                        const total = parent.transactionCount + children.reduce((sum, c) => sum + c.transactionCount, 0);
                        const headId = `acc-head-${parent.id}`;
                        const panelId = `acc-panel-${parent.id}`;
                        const preview = children.slice(0, 3);
                        return (
                          <li key={parent.id} className={`acc__item${isOpen ? " is-open" : ""}`}>
                            <div className="acc__head">
                              <button
                                type="button"
                                id={headId}
                                className="acc__toggle"
                                aria-expanded={isOpen}
                                aria-controls={panelId}
                                onClick={() => set([parent.id], !isOpen)}
                              >
                                <span className="acc__chevron" aria-hidden="true">
                                  <ChevronDownIcon />
                                </span>
                                <span className="cat-row__swatch" style={{ background: color }} aria-hidden="true" />
                                <span className="acc__title">
                                  <span className="acc__name">{highlight(parent.name, query)}</span>
                                  <span className="acc__meta">
                                    {count(total)}
                                    {children.length === 0 ? (
                                      <span className="acc__none">No subcategories</span>
                                    ) : (
                                      <span className="acc__chips">
                                        {preview.map((c) => (
                                          <span key={c.id} className="acc__chip">
                                            {highlight(c.name, query)}
                                          </span>
                                        ))}
                                        {children.length > preview.length && <span className="acc__chip acc__chip--more">+{children.length - preview.length}</span>}
                                      </span>
                                    )}
                                  </span>
                                </span>
                              </button>
                              {rowActions(parent, type)}
                            </div>
                            {/* Always rendered so the height can animate; inert while closed so it's out of the tab order. */}
                            <div
                              id={panelId}
                              role="region"
                              aria-labelledby={headId}
                              className="acc__panel"
                              {...(isOpen ? {} : { inert: "" })}
                            >
                              <div className="acc__inner">
                                <ul className="acc__subs">
                                  {children.map((c) => (
                                    <li key={c.id} className="acc__sub">
                                      <span
                                        className="cat-row__swatch"
                                        style={{ background: `color-mix(in srgb, ${color} 60%, var(--surface-raised))` }}
                                        aria-hidden="true"
                                      />
                                      <span className="acc__sub-name">{highlight(c.name, query)}</span>
                                      <span className="acc__sub-count">{count(c.transactionCount)}</span>
                                      {rowActions(c, type)}
                                    </li>
                                  ))}
                                  <li className="acc__add">
                                    <button type="button" className="link-text" onClick={() => setEditing({ category: null, type, parentId: parent.id })}>
                                      + Add subcategory
                                      <span className="visually-hidden"> to {parent.name}</span>
                                    </button>
                                  </li>
                                </ul>
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </>
                );
              }}
            </Loadable>
          </Card>
        ))}
      </div>

      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={
          editing?.category
            ? `Edit ${editing.category.name}`
            : editing?.parentId
              ? `Add a subcategory to ${list.state.data?.find((c) => c.id === editing.parentId)?.name ?? "it"}`
              : "Add category"
        }
      >
        {editing && (
          <CategoryEditor
            key={editing.category?.id ?? `new-${editing.type}-${editing.parentId}`}
            category={editing.category}
            all={list.state.data ?? []}
            defaultType={editing.type}
            defaultParentId={editing.parentId}
            onSaved={done}
            onCancel={() => setEditing(null)}
          />
        )}
      </Dialog>

      <DeleteCategory category={deleting} all={list.state.data ?? []} onDeleted={done} onClose={() => setDeleting(null)} />

      <p className="visually-hidden" role="status" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}
