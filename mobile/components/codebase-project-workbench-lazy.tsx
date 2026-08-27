import { lazy, Suspense, type ComponentProps } from "react";
import { ActivityIndicator, View } from "react-native";

import { FeatureErrorBoundary } from "./feature-error-boundary";

const CodebaseProjectWorkbenchLazy = lazy(() =>
  import("./codebase-project-workbench").then((module) => ({
    default: module.CodebaseProjectWorkbench,
  })),
);

type WorkbenchProps = ComponentProps<typeof CodebaseProjectWorkbenchLazy>;

export function CodebaseProjectWorkbench(props: WorkbenchProps) {
  return (
    <FeatureErrorBoundary title="Codebase workbench">
      <Suspense
        fallback={
          <View style={{ flex: 1, justifyContent: "center" }}>
            <ActivityIndicator />
          </View>
        }
      >
        <CodebaseProjectWorkbenchLazy {...props} />
      </Suspense>
    </FeatureErrorBoundary>
  );
}
