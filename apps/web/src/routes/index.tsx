import {
  createFileRoute,
  getRouteApi,
  useRouter,
} from "@tanstack/react-router";

import { WritingDesk } from "@/features/evaluations/writing-desk";

const routeApi = getRouteApi("/");

const WritingDeskPage = () => {
  const { progressSummary, recentEvaluations, setupStatus } =
    routeApi.useLoaderData();
  const { evaluationClient } = routeApi.useRouteContext();
  const router = useRouter();

  return (
    <WritingDesk
      evaluationClient={evaluationClient}
      onEvaluationCreated={() => {
        void router.invalidate();
      }}
      progressSummary={progressSummary}
      recentEvaluations={recentEvaluations}
      setupStatus={setupStatus}
    />
  );
};

export const Route = createFileRoute("/")({
  component: WritingDeskPage,
  loader: async ({ context }) => {
    const [progressSummary, evaluations, setupStatus] = await Promise.all([
      context.evaluationClient.getProgressSummary({ period: "30-days" }),
      context.evaluationClient.listEvaluations(),
      context.evaluationClient.getSetupStatus(),
    ]);

    return {
      progressSummary,
      recentEvaluations: evaluations.slice(0, 3),
      setupStatus,
    };
  },
  preloadStaleTime: 0,
});
