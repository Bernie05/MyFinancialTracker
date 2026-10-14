import logoMark from "@mft/ui/logo-mark.svg";
import { TransactionsPage } from "./features/transactions/TransactionsPage";

export function App() {
  return (
    <>
      <header className="topbar">
        <img className="topbar__mark" src={logoMark} alt="" width={28} height={28} />
        <span className="topbar__name">MyFinancialTracker</span>
      </header>
      <TransactionsPage />
    </>
  );
}
