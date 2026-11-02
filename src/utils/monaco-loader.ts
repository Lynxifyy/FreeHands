import { loader } from "@monaco-editor/react";
import { useEffect, useState } from "react";
// Keep worker URLs as static imports: Vite/Rolldown emits their URLs
// and bootstrap code here. Dynamic ?worker imports are not portable across
// the app's Rolldown runtime and can resolve to a module namespace instead
// of a worker URL.
// eslint-disable-next-line import-x/extensions, import-x/default -- Vite generates this worker URL
import editorWorkerUrl from "monaco-editor/editor/editor.worker.js?worker&url";
// eslint-disable-next-line import-x/extensions -- Vite generates this worker URL
import jsonWorkerUrl from "monaco-editor/language/json/json.worker.js?worker&url";
// eslint-disable-next-line import-x/extensions -- Vite generates this worker URL
import cssWorkerUrl from "monaco-editor/language/css/css.worker.js?worker&url";
// eslint-disable-next-line import-x/extensions -- Vite generates this worker URL
import htmlWorkerUrl from "monaco-editor/language/html/html.worker.js?worker&url";
// eslint-disable-next-line import-x/extensions -- Vite generates this worker URL
import typeScriptWorkerUrl from "monaco-editor/language/typescript/ts.worker.js?worker&url";

export type Monaco = typeof import("monaco-editor");
let initialization: Promise<Monaco> | undefined;

/** Configure the bundled editor only when an editor is actually mounted. */
export function configureMonaco(): Promise<Monaco> {
  initialization ??= (async () => {
    const monaco = await import("monaco-editor");
    self.MonacoEnvironment = {
      getWorker(_workerId, label) {
        const workerUrl =
          label === "json"
            ? jsonWorkerUrl
            : ["css", "scss", "less"].includes(label)
              ? cssWorkerUrl
              : ["html", "handlebars", "razor"].includes(label)
                ? htmlWorkerUrl
                : ["typescript", "javascript"].includes(label)
                  ? typeScriptWorkerUrl
                  : editorWorkerUrl;
        return new Worker(workerUrl, { type: "module" });
      },
    };
    loader.config({ monaco });
    return monaco;
  })().catch((error: unknown) => {
    initialization = undefined;
    throw error;
  });
  return initialization;
}

export function useMonaco(enabled = true) {
  const [monaco, setMonaco] = useState<Monaco | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return undefined;
    let active = true;
    configureMonaco().then(
      (api) => {
        if (active) setMonaco(api);
      },
      (cause: unknown) => {
        if (active)
          setError(cause instanceof Error ? cause.message : String(cause));
      },
    );
    return () => {
      active = false;
    };
  }, [enabled]);
  return { monaco, error };
}
