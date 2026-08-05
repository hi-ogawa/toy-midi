import { route } from "@remix-run/fetch-router/routes";
import { createMultiMatcher } from "@remix-run/route-pattern/match";

export const routes = route({
  home: "/",
  scoreViewer: "/score-viewer",
  project: "/project/:projectId",
  projectScore: "/project/:projectId/score",
});

export const routeMatcher = createMultiMatcher<keyof typeof routes>();

for (const [name, route] of Object.entries(routes)) {
  routeMatcher.add(route.pattern, name as any);
}
