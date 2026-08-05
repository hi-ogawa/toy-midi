export const appPath = {
  projects: "/",
  scoreViewer: "/score-viewer",
  project: ({ projectId }: { projectId: string }) => `/project/${projectId}`,
  projectScore: ({ projectId }: { projectId: string }) =>
    `/project/${projectId}/score`,
};

export type AppRoute =
  | { type: "projects" }
  | { type: "score-viewer" }
  | { type: "project"; projectId: string }
  | { type: "project-score"; projectId: string };

export function parseAppRoute(pathname: string): AppRoute {
  if (pathname === appPath.scoreViewer) {
    return { type: "score-viewer" };
  }

  const projectScore = pathname.match(/^\/project\/([^/]+)\/score$/);
  if (projectScore) {
    return { type: "project-score", projectId: projectScore[1] };
  }

  const project = pathname.match(/^\/project\/([^/]+)$/);
  if (project) {
    return { type: "project", projectId: project[1] };
  }

  return { type: "projects" };
}
