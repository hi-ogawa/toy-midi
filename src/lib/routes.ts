import { route } from "@remix-run/fetch-router/routes";

export const routes = route({
  home: "/",
  scoreViewer: "/score-viewer",
  project: "/project/:projectId",
  projectScore: "/project/:projectId/score",
});
