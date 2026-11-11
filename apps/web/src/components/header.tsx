import { Link } from "@tanstack/react-router";

const Header = () => {
  const links = [
    { exact: true, label: "Writing Desk", to: "/" },
    { exact: false, label: "History", to: "/evaluations" },
    { exact: true, label: "Progress", to: "/progress" },
    { exact: true, label: "Setup & privacy", to: "/setup" },
  ] as const;

  return (
    <header className="bg-background/95 border-b">
      <div className="mx-auto flex w-full max-w-[88rem] flex-wrap items-center gap-x-8 gap-y-3 px-4 py-4 sm:px-6">
        <Link className="text-base font-semibold tracking-tight" to="/">
          Prompt Evolution
        </Link>
        <nav
          aria-label="Primary navigation"
          className="grid w-full grid-cols-2 gap-1 text-sm sm:flex sm:w-auto sm:items-center"
        >
          {links.map(({ exact, label, to }) => (
            <Link
              activeOptions={{ exact }}
              activeProps={{
                className: "bg-muted text-foreground",
              }}
              className="text-muted-foreground hover:bg-muted/70 hover:text-foreground rounded-md px-3 py-2 text-center font-medium"
              key={to}
              to={to}
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
};

export default Header;
