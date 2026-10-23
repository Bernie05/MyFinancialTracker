import { Button, Select } from "@mft/ui";
import { PAGE_SIZES } from "./useTransactionFilters";

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onChange: (changes: { page?: number; pageSize?: number }) => void;
}

const sizeOptions = PAGE_SIZES.map((n) => ({ value: String(n), label: `${n} per page` }));

export function Pagination({ page, pageSize, total, onChange }: PaginationProps) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(total, page * pageSize);

  return (
    <nav className="pager" aria-label="Pages">
      <p className="pager__status">
        {total === 0 ? (
          <strong>0 transactions</strong>
        ) : (
          <>
            <strong>{first}–{last}</strong> of {total}
          </>
        )}
        <span className="pager__page">Page {page} of {pages}</span>
      </p>
      <div className="pager__controls">
        <Select
          className="pager__size"
          label="Rows per page"
          value={String(pageSize)}
          options={sizeOptions}
          // A new page size makes the old page number meaningless: back to page 1.
          onChange={({ target: { value } }) => onChange({ pageSize: Number(value), page: undefined })}
        />
        <div className="pager__buttons">
          <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onChange({ page: page - 1 })}>
            Previous
          </Button>
          <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => onChange({ page: page + 1 })}>
            Next
          </Button>
        </div>
      </div>
    </nav>
  );
}
