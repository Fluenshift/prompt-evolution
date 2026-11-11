import { Toaster } from "@english-prompt-evaluation/ui/components/sonner";
import {
  HeadContent,
  Outlet,
  createRootRouteWithContext,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";

import Header from "@/components/header";
import type { EvaluationClient } from "@/features/evaluations/evaluation-client";

import "../index.css";

export interface RouterAppContext {
  evaluationClient: EvaluationClient;
}

const RootComponent = () => (
  <>
    <HeadContent />
    <div className="grid min-h-svh grid-rows-[auto_1fr]">
      <Header />
      <Outlet />
    </div>
    <Toaster richColors theme="light" />
    <TanStackRouterDevtools position="bottom-left" />
  </>
);

export const Route = createRootRouteWithContext<RouterAppContext>()({
  component: RootComponent,
  head: () => ({
    meta: [
      {
        title: "Prompt Evolution",
      },
      {
        content:
          "Find and fix recurring English-writing errors in your prompts.",
        name: "description",
      },
    ],
  }),
});
