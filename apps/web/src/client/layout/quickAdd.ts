import { navigate } from "../lib/router";

/** Pages that keep an add form on screen; elsewhere, quick add opens Cash & Others' Add expense dialog. */
const withForm = ["/income/other", "/expenses/all"];

/**
 * "Add transaction" from anywhere. On a page with an add form, put the cursor in its amount field
 * (the timeout lets the page render first); everywhere else, open Add expense on Cash & Others.
 */
export function startAddTransaction() {
  if (!withForm.includes(window.location.pathname)) {
    navigate("/expenses/cash?add=1");
    return;
  }
  setTimeout(() => {
    const amount = document.getElementById("add-amount");
    amount?.scrollIntoView({ block: "center" });
    amount?.focus();
  }, 60);
}
