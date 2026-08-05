import { type Route, route } from "@remix-run/fetch-router/routes";
import { createMultiMatcher, type Match } from "@remix-run/route-pattern/match";

// borrow type-safe routing utils from remix
// with minor twist to make it work as standalone route mathcing helper

export const routes = route({
  home: "/",
  scoreViewer: "/score-viewer",
  project: "/project/:projectId",
  projectScore: "/project/:projectId/score",
});

type RouteName = keyof typeof routes;
type RouteMatch = {
  [name in RouteName]: (typeof routes)[name] extends Route<
    infer _method,
    infer pattern
  >
    ? Match<pattern, name>
    : never;
}[RouteName];

const matcher = createMultiMatcher<RouteName>();

for (const name of Object.keys(routes) as RouteName[]) {
  matcher.add(routes[name].pattern, name);
}

export function matchRoute(url: string | URL) {
  // MultiMatcher tracks pattern and data as independent unions. These entries
  // are registered together above, so restore their correlation for callers.
  return matcher.match(url) as RouteMatch | null;
}
