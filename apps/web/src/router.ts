import { createRouter } from "@tanstack/react-router";
import type { RouterHistory } from "@tanstack/react-router";

import Loader from "@/components/loader";
import type { EvaluationClient } from "@/features/evaluations/evaluation-client";
import { routeTree } from "@/routeTree.gen";

interface CreateAppRouterOptions {
  evaluationClient: EvaluationClient;
  history?: RouterHistory;
}

export const createAppRouter = ({
  evaluationClient,
  history,
}: CreateAppRouterOptions) =>
  createRouter({
    context: { evaluationClient },
    defaultPendingComponent: Loader,
    defaultPreload: "intent",
    history,
    routeTree,
    scrollRestoration: true,
  });

export type AppRouter = ReturnType<typeof createAppRouter>;

declare module "@tanstack/react-router" {
  interface Register {
    router: AppRouter;
  }
}
