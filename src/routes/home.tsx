import { PrefetchPageLinks, useLocation } from "react-router";
import { HomeChatLauncher } from "#/components/features/home/home-chat-launcher";
import {
  isOnboardingPreviewActive,
  OnboardingHost,
} from "#/components/features/onboarding";

<PrefetchPageLinks page="/conversations/:conversationId" />;

function HomeScreen() {
  const location = useLocation();
  const isPreview = isOnboardingPreviewActive(location.search);

  return (
    <div
      data-testid="home-screen"
      className="custom-scrollbar-always h-full overflow-y-auto rounded-xl bg-transparent px-4 md:px-0 lg:px-10.5"
    >
      <HomeChatLauncher />

      {!isPreview ? <OnboardingHost /> : null}
    </div>
  );
}

export default HomeScreen;
