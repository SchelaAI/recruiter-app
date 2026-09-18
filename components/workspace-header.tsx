import Link from "next/link";
import { Icons } from "./ui-icons";

type Props = {
  title: string;
  subtitle: string;
  showNewInterview?: boolean;
  children?: React.ReactNode;
};

export function WorkspaceHeader({ title, subtitle, showNewInterview = true, children }: Props) {
  return (
    <header className="workspace-header">
      <div className="workspace-heading"><h1>{title}</h1><p>{subtitle}</p></div>
      <form className="global-search" action="/search" method="get">
        <Icons.search size={16}/><input name="q" aria-label="Search workspace" placeholder="Search candidates, interviews..." />
      </form>
      <div className="workspace-actions">
        <Link className="icon-button" href="/dashboard#attention" aria-label="Needs your attention"><Icons.bell size={17}/></Link>
        {children}
        {showNewInterview ? <Link className="button button-primary new-interview-button" href="/interviews/new"><Icons.plus size={16}/><span>New<br/>Interview</span></Link> : null}
      </div>
    </header>
  );
}
