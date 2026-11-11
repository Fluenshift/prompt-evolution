import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/evaluations/new")({
  beforeLoad: () => {
    throw redirect({ replace: true, to: "/" });
  },
});
