import { navigate } from "../lib/router";

/**
 * "Add transaction" from anywhere: go to Expenses (unless already on a ledger page), then put
 * the cursor in the add form's amount field. The timeout lets the new page render first.
 */
export function startAddTransaction() {
  const path = window.location.pathname;
  if (path !== "/expenses" && path !== "/income") navigate("/expenses");
  setTimeout(() => {
    const amount = document.getElementById("add-amount");
    amount?.scrollIntoView({ block: "center" });
    amount?.focus();
  }, 60);
}
