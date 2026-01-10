interface StartupScreenProps {
  hasSavedProject: boolean;
  onNewProject: () => void;
  onContinue: () => void;
}

export function StartupScreen({
  hasSavedProject,
  onNewProject,
  onContinue,
}: StartupScreenProps) {
  return (
    <div
      data-testid="startup-screen"
      className="fixed inset-0 bg-neutral-900 flex items-center justify-center z-50"
    >
      <div className="flex flex-col items-center gap-6">
        <h1 className="text-2xl font-semibold text-neutral-200">toy-midi</h1>
        <div className="flex gap-3">
          {hasSavedProject && (
            <button
              data-testid="continue-button"
              onClick={onContinue}
              className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium"
            >
              Continue
            </button>
          )}
          <button
            data-testid="new-project-button"
            onClick={onNewProject}
            className={`px-6 py-3 rounded-lg font-medium ${
              hasSavedProject
                ? "bg-neutral-700 hover:bg-neutral-600 text-neutral-200"
                : "bg-emerald-600 hover:bg-emerald-500 text-white"
            }`}
          >
            New Project
          </button>
        </div>
      </div>
    </div>
  );
}
