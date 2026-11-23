import { useConversationWorkspace } from "#/hooks/query/use-conversation-workspace";
import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { CustomChatInput } from "#/components/features/chat/custom-chat-input";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { useCreateConversation } from "#/hooks/mutation/use-create-conversation";
import { useLocalWorkspaces } from "#/hooks/query/use-local-workspaces";
import { useModelInterceptor } from "#/hooks/chat/use-model-interceptor";
import { useLlmConfigured } from "#/hooks/use-llm-configured";
import { HOME_PROMPT_DRAFT_KEY } from "#/hooks/chat/use-draft-persistence";
import { useChatAttachmentUpload } from "#/hooks/chat/use-chat-attachment-upload";
import { useConversationStore } from "#/stores/conversation-store";
import { setConversationState } from "#/utils/conversation-local-storage";
import { FolderKanban } from "lucide-react";
import { useInRouterContext, useSearchParams } from "react-router";
import { useProjectsStore } from "#/stores/projects-store";
import { mergeStoredConversationMetadata } from "#/api/conversation-metadata-store";
import { useApplyConversationAgentMode } from "#/hooks/use-apply-conversation-agent-mode";
import { LlmNotConfiguredBanner } from "#/components/features/home/llm-not-configured-banner";
import { CloudSignInBanner } from "#/components/features/home/cloud-sign-in-banner";
import type { WorkspaceMode } from "#/api/conversation-metadata-store";
import { setPendingTaskAttachments } from "#/stores/pending-task-attachments-store";
import { enqueueHomeTaskPendingMessage } from "#/utils/enqueue-home-task-pending-message";
import { sendMessageWithAttachments } from "#/utils/send-message-with-attachments";
import { useNavigation } from "#/context/navigation-context";
import { useIsCreatingConversation } from "#/hooks/use-is-creating-conversation";
import { Branch, GitRepository } from "#/types/git";
import { Provider } from "#/types/settings";
import { LocalWorkspace } from "#/types/workspace";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import {
  displayErrorToast,
  TOAST_OPTIONS,
} from "#/utils/custom-toast-handlers";
import { getApiErrorMessage } from "#/utils/api-error-message";
import { getWorkspacesUnsupportedMessage } from "#/utils/workspaces-compatibility";
import {
  readStoredLocalWorkspaceMode,
  writeStoredLocalWorkspaceMode,
} from "#/utils/workspace-mode";
import type { PluginSpec } from "#/api/conversation-service/agent-server-conversation-service.types";
import { markAutomationSetupHandoff } from "#/api/automation-setup-handoff-store";
import { PluginPickerModal } from "#/components/features/plugins/plugin-picker-modal";
import { PluginPickerTrigger } from "#/components/features/plugins/plugin-picker-trigger";
import { RecommendedAutomationsLauncher } from "#/components/features/automations/recommended-automations-launcher";
import { PinnedAutomationsDashboard } from "./featured-automations/pinned-automations-dashboard";
import { RunningAutomationsList } from "./featured-automations/running-automations-list";
import { HomeHeaderTitle } from "./home-header/home-header-title";
import {
  HomeLauncherModeToggle,
  type HomeLauncherMode,
} from "./home-launcher-mode-toggle";
import { OpenLauncherButton } from "./open-launcher-button";
import { OpenWorkspaceDialog } from "./open-workspace-dialog";
import { OpenRepositoryDialog } from "./open-repository-dialog";
import { HomeGitControlBarPreview } from "./home-git-control-bar-preview";

/**
 * Reads `?project=` without forcing every caller into a Router. The launcher
 * is rendered in router-less tests too, so the query reader mounts only when a
 * router context exists.
 */
function ProjectQueryReader({
  onChange,
}: {
  onChange: (projectId: string | null) => void;
}) {
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get("project");
  useEffect(() => onChange(projectId), [projectId, onChange]);
  return null;
}

export function HomeChatLauncher() {
  const { t } = useTranslation("openhands");
  const { backend } = useActiveBackend();
  const { navigate } = useNavigation();
  const isLocal = backend.kind === "local";

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [pendingWorkspace, setPendingWorkspace] =
    useState<LocalWorkspace | null>(null);
  const [pendingRepository, setPendingRepository] =
    useState<GitRepository | null>(null);
  const [pendingBranch, setPendingBranch] = useState<Branch | null>(null);
  const [pendingProvider, setPendingProvider] = useState<Provider | null>(null);
  const [workspaceMode, setWorkspaceModeState] = useState<WorkspaceMode>(() =>
    readStoredLocalWorkspaceMode(),
  );
  const [selectedPlugins, setSelectedPlugins] = useState<PluginSpec[]>([]);
  const [isPluginPickerOpen, setIsPluginPickerOpen] = useState(false);
  const [launcherMode, setLauncherMode] = useState<HomeLauncherMode>("code");
  const inRouter = useInRouterContext();
  const [projectId, setProjectId] = useState<string | null>(null);
  const project = useProjectsStore(
    (state) => state.projects.find((p) => p.id === projectId) ?? null,
  );
  const isProjectMode = project !== null;
  // A project conversation is always Complex Code: the project is the
  // deliberate "real engineering work" entry point.
  const displayedLauncherMode: HomeLauncherMode = isProjectMode
    ? "complex"
    : launcherMode;
  const isAutomateMode = displayedLauncherMode === "automate";
  const handleLauncherModeChange = setLauncherMode;
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // The launcher reports a failed create itself (see handleSubmit), so the
  // global mutation error toast is turned off to keep it to one toast.
  const { mutateAsync: createConversation, isPending } = useCreateConversation({
    disableToast: true,
  });
  const isCreatingElsewhere = useIsCreatingConversation();
  const isCreating = isPending || isCreatingElsewhere;
  const { isConfigured: isLlmConfigured, isLoading: isLlmConfigLoading } =
    useLlmConfigured();
  // Block sending entirely when there's no usable LLM; the banner above the
  // launcher explains it and offers setup. Complex Code is exempt: OpenCode is
  // an ACP agent that owns its own model.
  const isComplexMode = displayedLauncherMode === "complex";
  const llmBlocked = !isLlmConfigLoading && !isLlmConfigured && !isComplexMode;
  const { applyMode } = useApplyConversationAgentMode();
  const {
    images,
    files,
    imagesMarkedUploadAsFile,
    clearAllFiles,
    restoreMessageToInputIfEmpty,
    setConversationMode,
  } = useConversationStore();
  const { handleUpload } = useChatAttachmentUpload();
  const { error: workspacesError } = useLocalWorkspaces({ enabled: isLocal });
  const { isolated, unsupportedMessage: runtimeWorkspaceMessage } =
    useConversationWorkspace();
  const workspacesUnsupportedMessage =
    runtimeWorkspaceMessage ??
    (isLocal ? getWorkspacesUnsupportedMessage(workspacesError, t) : null);

  const setWorkspaceMode = (mode: WorkspaceMode) => {
    setWorkspaceModeState(mode);
    if (isLocal) writeStoredLocalWorkspaceMode(mode);
  };

  const hasSelection = isLocal
    ? !!pendingWorkspace
    : !!pendingRepository && !!pendingBranch;

  const handleSubmit = (message: string) => {
    const trimmed = message.trim();
    const hasAttachments = images.length > 0 || files.length > 0;
    if ((!trimmed && !hasAttachments) || isCreating) return;

    // Safety net: the input is disabled when there's no usable LLM, but never
    // create a conversation that can't run (it would fail with a cryptic
    // API-key error on the first turn).
    if (llmBlocked) return;

    const attachmentSnapshot = {
      images: [...images],
      files: [...files],
    };

    // Workspace/repo are optional — match the "Start from scratch" flow which
    // creates a conversation with no working dir and no repo. Build the
    // payload from whatever is selected.
    // When attachments are present the first user message is sent afterward
    // via sendMessageWithAttachments / flushPendingTaskAttachments. Passing
    // query here would create a duplicate text-only initial_message.
    let variables: Parameters<typeof createConversation>[0] = {
      query: hasAttachments ? undefined : trimmed || undefined,
      automationSetup: isAutomateMode,
      entryPoint: "home_chat_launcher",
    };
    // An isolated backend owns its workspace, so a host selection left over
    // from a non-isolated session must not be forwarded: the server rejects it
    // (`HOME$ISOLATED_WORKSPACE_NOTICE`) and the user sees an error toast for a
    // selection they may not have noticed. Creation proceeds isolated instead;
    // the launcher still offers an explicit "clear" affordance for the UI.
    // A project can pin a workspace; an explicit pick in the composer wins.
    const projectWorkingDir =
      isLocal && !isolated ? (project?.workspacePath ?? null) : null;
    if (isLocal && (pendingWorkspace || projectWorkingDir) && !isolated) {
      variables = {
        ...variables,
        workingDir: pendingWorkspace?.path ?? projectWorkingDir ?? undefined,
        workspaceMode,
      };
    } else if (!isLocal && pendingRepository && pendingBranch) {
      variables = {
        ...variables,
        repository: {
          name: pendingRepository.full_name,
          gitProvider: pendingRepository.git_provider,
          branch: pendingBranch.name,
        },
      };
    }

    // Explicitly-attached plugins are additive on top of any ambient set and
    // are resolved from git at run time. Omitted entirely when none selected so
    // nothing attaches unless the user picked it.
    if (!isAutomateMode && selectedPlugins.length > 0) {
      variables = { ...variables, plugins: selectedPlugins };
    }

    const openAutomationSetupMode = (conversationId: string) => {
      if (!isAutomateMode) return;
      markAutomationSetupHandoff(conversationId);
    };

    // Loading toast gives the user a clear signal that the request is in
    // flight; dismissed precisely once the mutation resolves.
    const toastId = toast.loading(
      t(I18nKey.HOME$CREATING_CONVERSATION),
      TOAST_OPTIONS,
    );

    void (async () => {
      let isCreated = false;
      try {
        // Complex Code must land on OpenCode before the conversation is
        // created: activation is a pointer, and the launch reads it. Passing
        // the resolved profile id as well removes the race entirely.
        let launchVariables = variables;
        if (isComplexMode) {
          const applied = await applyMode("complex");
          if (!applied.ok) {
            toast.dismiss(toastId);
            displayErrorToast(t(I18nKey.ERROR$GENERIC));
            return;
          }
          if (applied.agentProfileId) {
            launchVariables = {
              ...launchVariables,
              agentProfileId: applied.agentProfileId,
            };
          }
          setConversationMode("complex");
        }

        const data = await createConversation(launchVariables);
        isCreated = true;
        toast.dismiss(toastId);
        try {
          sessionStorage.removeItem(HOME_PROMPT_DRAFT_KEY);
        } catch {
          // sessionStorage not available
        }
        const targetConversationId = data.conversation_id;
        const isTaskConversation = targetConversationId.startsWith("task-");
        // Persist the mode with the conversation so reopening it keeps the
        // Complex Code composer (and its ACP model picker) in place.
        setConversationState(targetConversationId, {
          conversationMode: isComplexMode ? "complex" : "code",
        });
        if (project) {
          mergeStoredConversationMetadata(targetConversationId, {
            projectId: project.id,
          });
        }

        if (hasAttachments) {
          // Cloud sandboxes provision asynchronously; uploads and the first
          // message must target the runtime URL, not the bundled local server.
          const shouldDeferAttachments = !isLocal || isTaskConversation;

          if (shouldDeferAttachments) {
            const taskId =
              data.task_id ??
              (isTaskConversation
                ? targetConversationId.slice("task-".length)
                : null);

            if (!taskId) {
              displayErrorToast(null);
              return;
            }

            setPendingTaskAttachments(taskId, {
              content: trimmed,
              images: attachmentSnapshot.images,
              files: attachmentSnapshot.files,
              imagesMarkedUploadAsFile: [...imagesMarkedUploadAsFile],
            });
            clearAllFiles();
            await enqueueHomeTaskPendingMessage({
              conversationId: targetConversationId,
              text: trimmed,
              images: attachmentSnapshot.images,
              imagesMarkedUploadAsFile,
            });
            openAutomationSetupMode(targetConversationId);
            navigate(`/conversations/${targetConversationId}`);
            return;
          } else {
            try {
              await sendMessageWithAttachments({
                conversationId: targetConversationId,
                content: trimmed,
                images: attachmentSnapshot.images,
                files: attachmentSnapshot.files,
                imagesMarkedUploadAsFile,
                t,
              });
              clearAllFiles();
            } catch (error) {
              displayErrorToast(error instanceof Error ? error.message : null);
              return;
            }
          }
        }

        if (isTaskConversation && trimmed) {
          await enqueueHomeTaskPendingMessage({
            conversationId: targetConversationId,
            text: trimmed,
            images: [],
            imagesMarkedUploadAsFile: [],
          });
        }

        openAutomationSetupMode(targetConversationId);
        navigate(`/conversations/${targetConversationId}`);
      } catch (error) {
        toast.dismiss(toastId);
        // Prefer the server's own message; without one, keep the launcher's
        // existing wording (the error's message).
        const fallback = error instanceof Error ? error.message : "";
        displayErrorToast(getApiErrorMessage(error, fallback) || null);
        // The composer cleared itself on submit; hand the prompt back so the
        // user can retry without retyping it. Only when the create itself
        // failed and this composer is still on screen: the request is consumed
        // by whichever composer is mounted, so otherwise the prompt would
        // replay into a conversation.
        if (!isCreated && isMountedRef.current) {
          restoreMessageToInputIfEmpty(message);
        }
      }
    })();
  };

  // Without this wrapper a `/model NAME` typed here would become the first
  // user message of the new conversation. The interceptor activates the
  // profile globally (null conversationId path) so the next conversation
  // launches with it.
  const handleSubmitWithModelGuard = useModelInterceptor(null, handleSubmit);

  return (
    <div
      data-testid="home-chat-launcher"
      className="flex w-full flex-col items-center pt-[max(4rem,28vh)] pb-10"
    >
      {inRouter ? <ProjectQueryReader onChange={setProjectId} /> : null}
      <div className="flex w-full max-w-200 flex-col gap-4 md:px-4">
        <div className="flex w-full justify-center">
          <HomeHeaderTitle />
        </div>

        {isProjectMode && project ? (
          <div className="flex w-full justify-center">
            <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-white/15 bg-white/8 px-3 py-1.5 text-[13px] text-contrast backdrop-blur">
              <FolderKanban className="size-4 shrink-0" aria-hidden />
              <span className="min-w-0 truncate font-medium">
                {project.name}
              </span>
              <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em]">
                {t(I18nKey.PROJECTS$COMPLEX_BADGE)}
              </span>
            </div>
          </div>
        ) : (
          <div className="flex w-full justify-center">
            <HomeLauncherModeToggle
              mode={displayedLauncherMode}
              onChange={handleLauncherModeChange}
            />
          </div>
        )}

        {llmBlocked ? (
          <div className="w-full">
            <LlmNotConfiguredBanner />
          </div>
        ) : null}

        <div className="w-full">
          <CloudSignInBanner />
        </div>

        <div className="w-full">
          <CustomChatInput
            onSubmit={handleSubmitWithModelGuard}
            onFilesPaste={handleUpload}
            disabled={isCreating || llmBlocked}
            placeholder={
              isAutomateMode
                ? t(I18nKey.HOME$AUTOMATE_PROMPT_PLACEHOLDER)
                : t(I18nKey.SUGGESTIONS$WHAT_TO_BUILD)
            }
          />
        </div>

        {isolated && (
          <p role="status" className="text-xs text-[var(--oh-text-secondary)]">
            {pendingWorkspace
              ? runtimeWorkspaceMessage
              : t(I18nKey.HOME$ISOLATED_WORKSPACE_NEW)}
            {pendingWorkspace && (
              <button
                type="button"
                className="ml-2 underline"
                onClick={() => setPendingWorkspace(null)}
              >
                {t(I18nKey.HOME$CLEAR_HOST_WORKSPACE)}
              </button>
            )}
          </p>
        )}
        <div
          data-testid="home-composer-actions"
          aria-disabled={isAutomateMode}
          className={cn(
            "flex items-center justify-start gap-2",
            isAutomateMode && "pointer-events-none opacity-40",
          )}
        >
          {hasSelection ? (
            <HomeGitControlBarPreview
              workspace={pendingWorkspace}
              repository={pendingRepository}
              branch={pendingBranch}
              provider={pendingProvider}
              workspaceMode={workspaceMode}
              backendKind={backend.kind}
              onRepoClick={() => setIsDialogOpen(true)}
              onWorkspaceModeChange={setWorkspaceMode}
            />
          ) : (
            <OpenLauncherButton
              kind={isLocal ? "local" : "cloud"}
              onClick={() => setIsDialogOpen(true)}
              disabled={
                isCreating ||
                isAutomateMode ||
                Boolean(workspacesUnsupportedMessage)
              }
              disabledTooltip={workspacesUnsupportedMessage}
            />
          )}
          <PluginPickerTrigger
            count={selectedPlugins.length}
            onClick={() => setIsPluginPickerOpen(true)}
            disabled={isCreating || isAutomateMode}
          />
        </div>

        <div className="mt-8 flex w-full flex-col gap-8">
          <RecommendedAutomationsLauncher variant="rail" />
          <PinnedAutomationsDashboard />
          <RunningAutomationsList />
        </div>
      </div>

      {isLocal ? (
        <OpenWorkspaceDialog
          isOpen={isDialogOpen}
          onClose={() => setIsDialogOpen(false)}
          onConfirm={(workspace) => {
            setPendingWorkspace(workspace);
            setPendingRepository(null);
            setPendingBranch(null);
            setPendingProvider(null);
          }}
        />
      ) : (
        <OpenRepositoryDialog
          isOpen={isDialogOpen}
          onClose={() => setIsDialogOpen(false)}
          onConfirm={({ repository, branch, provider }) => {
            setPendingRepository(repository);
            setPendingBranch(branch);
            setPendingProvider(provider ?? repository.git_provider);
            setPendingWorkspace(null);
            setWorkspaceModeState("local_repo");
          }}
        />
      )}

      {isPluginPickerOpen && (
        <PluginPickerModal
          selected={selectedPlugins}
          onChange={setSelectedPlugins}
          onClose={() => setIsPluginPickerOpen(false)}
        />
      )}
    </div>
  );
}
