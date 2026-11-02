import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import React from "react";
import i18n from "#/i18n";
import { I18nKey } from "#/i18n/declaration";
import { useColorTheme } from "#/hooks/use-color-theme";
import { getTerminalTheme } from "#/themes/terminal-themes";
import { useEventStore } from "#/stores/use-event-store";
import {
  deriveTerminalCommands,
  type TerminalCommand,
} from "#/utils/terminal-events";
import { parseTerminalOutput } from "#/utils/parse-terminal-output";

/*
  NOTE: Tests for this hook are indirectly covered by the tests for the XTermTerminal component.
  The reason for this is that the hook exposes a ref that requires a DOM element to be rendered.
*/

const renderCommand = (command: TerminalCommand, terminal: Terminal) => {
  const { content, type } = command;

  const trimmedContent = (content || "").replaceAll("\n", "\r\n").trim();
  // Only write if there's actual content to avoid empty newlines
  if (trimmedContent) {
    const prefix = type === "error" ? "\x1b[31m" : "";
    const suffix = type === "error" ? "\x1b[0m" : "";
    terminal.writeln(prefix + parseTerminalOutput(trimmedContent) + suffix);
  }

  // A command the agent started but that has not finished is called out so the
  // user does not read the empty tail as "the command produced nothing".
  if (type === "error") {
    terminal.writeln(
      `  \x1b[31m✖ ${command.exitCode !== undefined ? i18n.t(I18nKey.TERMINAL$EXIT_CODE, { code: command.exitCode }) : i18n.t(I18nKey.TERMINAL$COMMAND_FAILED)}\x1b[0m`,
    );
  }
  if (type === "running") {
    terminal.writeln(`  ⏳ ${i18n.t(I18nKey.TERMINAL$STILL_RUNNING)}`);
  }
};

/**
 * Check if the terminal is ready for fit operations.
 * This prevents the "Cannot read properties of undefined (reading 'dimensions')" error
 * that occurs when fit() is called on a terminal that is hidden, disposed, or not fully initialized.
 */
const canFitTerminal = (
  terminalInstance: Terminal | null,
  fitAddonInstance: FitAddon | null,
  containerElement: HTMLDivElement | null,
): boolean => {
  // Check terminal and fitAddon exist
  if (!terminalInstance || !fitAddonInstance) {
    return false;
  }

  // Check container element exists
  if (!containerElement) {
    return false;
  }

  // Check element is visible (not display: none)
  // When display is none, offsetParent is null (except for fixed/body elements)
  const computedStyle = window.getComputedStyle(containerElement);
  if (computedStyle.display === "none") {
    return false;
  }

  // Check element has dimensions
  const { clientWidth, clientHeight } = containerElement;
  if (clientWidth === 0 || clientHeight === 0) {
    return false;
  }

  // Check terminal has been opened (element property is set after open())
  if (!terminalInstance.element) {
    return false;
  }

  return true;
};

function resolveTerminalForeground(host: HTMLElement): string {
  const probe = host.ownerDocument.createElement("span");
  probe.style.color = "var(--oh-surface-foreground)";
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  probe.style.pointerEvents = "none";
  host.appendChild(probe);
  const fromVar = getComputedStyle(probe).color;
  probe.remove();
  if (fromVar && fromVar !== "rgba(0, 0, 0, 0)") {
    return fromVar;
  }
  return getComputedStyle(host).color;
}

/**
 * The full terminal transcript: the agent's commands derived from the shared
 * event log, followed by commands a person typed into the tab.
 *
 * Single derivation point, so the tab's emptiness check and what it renders
 * can never disagree about which commands exist.
 */
export const useTerminalTranscript = (
  typedCommands: TerminalCommand[] = [],
): TerminalCommand[] => {
  const events = useEventStore((state) => state.events);
  const agentCommands = React.useMemo(
    () => deriveTerminalCommands(events),
    [events],
  );
  return React.useMemo(
    () => [...agentCommands, ...typedCommands],
    [agentCommands, typedCommands],
  );
};

export const useTerminal = (commands: TerminalCommand[] = []) => {
  const colorTheme = useColorTheme();
  const terminal = React.useRef<Terminal | null>(null);
  const fitAddon = React.useRef<FitAddon | null>(null);
  const ref = React.useRef<HTMLDivElement>(null);
  // Per-mount: the terminal element is disposed on unmount, so a fresh mount
  // replays the whole transcript from index 0. A module-global index would
  // carry over and skip the replay, leaving the tab empty after a remount.
  const lastCommandIndex = React.useRef(0);
  const isDisposed = React.useRef(false);

  const createTerminal = (host: HTMLDivElement) =>
    new Terminal({
      fontFamily: "Menlo, Monaco, 'Courier New', monospace",
      fontSize: 14,
      scrollback: 10000,
      scrollSensitivity: 1,
      fastScrollSensitivity: 5,
      disableStdin: true, // Make terminal read-only
      // Canvas fillStyle does not resolve CSS variables; use transparency so
      // the host / panel background shows through (`allowTransparency` required).
      allowTransparency: true,
      theme: getTerminalTheme(colorTheme, resolveTerminalForeground(host)),
    });

  const fitTerminalSafely = React.useCallback(() => {
    if (isDisposed.current) {
      return;
    }
    if (canFitTerminal(terminal.current, fitAddon.current, ref.current)) {
      fitAddon.current!.fit();
    }
  }, []);

  const initializeTerminal = () => {
    if (terminal.current) {
      if (fitAddon.current) terminal.current.loadAddon(fitAddon.current);
      if (ref.current) {
        terminal.current.open(ref.current);
        // Hide cursor for read-only terminal using ANSI escape sequence
        terminal.current.write("\x1b[?25l");
        fitTerminalSafely();
      }
    }
  };

  // Initialize terminal and handle cleanup
  React.useEffect(() => {
    isDisposed.current = false;
    const host = ref.current;
    if (!host) {
      return undefined;
    }

    terminal.current = createTerminal(host);
    fitAddon.current = new FitAddon();

    if (ref.current) {
      initializeTerminal();
      // Render all commands in array
      // This happens when we just switch to Terminal from other tabs
      if (commands.length > 0) {
        for (let i = 0; i < commands.length; i += 1) {
          if (commands[i].type === "input") {
            terminal.current.write("$ ");
          }
          // Don't pass isUserInput=true here because we're initializing the terminal
          // and need to show all previous commands
          renderCommand(commands[i], terminal.current);
        }
        lastCommandIndex.current = commands.length;
      }
      // Don't show prompt in read-only terminal
    }

    return () => {
      isDisposed.current = true;
      terminal.current?.dispose();
      lastCommandIndex.current = 0;
    };
  }, []);

  React.useEffect(() => {
    const host = ref.current;
    if (!terminal.current?.options || !host) return;
    terminal.current.options.theme = getTerminalTheme(
      colorTheme,
      resolveTerminalForeground(host),
    );
  }, [colorTheme]);

  React.useEffect(() => {
    if (
      terminal.current &&
      commands.length > 0 &&
      lastCommandIndex.current < commands.length
    ) {
      for (let i = lastCommandIndex.current; i < commands.length; i += 1) {
        if (commands[i].type === "input") {
          terminal.current.write("$ ");
        }
        renderCommand(commands[i], terminal.current);
      }
      lastCommandIndex.current = commands.length;
    }
  }, [commands]);

  React.useEffect(() => {
    let resizeObserver: ResizeObserver | null = null;

    resizeObserver = new ResizeObserver(() => {
      // Use requestAnimationFrame to debounce resize events and ensure DOM is ready
      requestAnimationFrame(() => {
        fitTerminalSafely();
      });
    });

    if (ref.current) {
      resizeObserver.observe(ref.current);
    }

    return () => {
      resizeObserver?.disconnect();
    };
  }, [fitTerminalSafely]);

  return ref;
};
