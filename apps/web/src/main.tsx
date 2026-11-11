import { RouterProvider } from "@tanstack/react-router";
import ReactDOM from "react-dom/client";

import { createHttpEvaluationClient } from "./features/evaluations/http-evaluation-client";
import { createAppRouter } from "./router";

const router = createAppRouter({
  evaluationClient: createHttpEvaluationClient(),
});

const rootElement = document.querySelector("#app");

if (!rootElement) {
  throw new Error("Root element not found");
}

if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(<RouterProvider router={router} />);
}
