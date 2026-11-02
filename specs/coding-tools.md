# Coding tools

### TERMINAL-ERROR-1: Honest terminal results

- [x] Typed terminal commands shall retain their transcript per conversation and show stdout, stderr, transport errors, and nonzero exit codes.
- [x] A nonzero exit shall be an error, not a successful output or a permanently running command. The next command shall remain available after completion.
- [x] Switching conversations during an in-flight command shall not append its result to the new transcript or unlock the new conversation using the old command's state.
- [x] Commands shall not run until the transcript for the currently loaded conversation is ready.

### CANVAS-CODING-1: Discoverable coding surfaces

- [x] Canvas UI tool metadata shall advertise the available Files, Terminal, Browser, Planner, Task list, Commits, and Usage surfaces.
- [x] Legacy VS Code tab requests shall map to Files so older conversations retain a working navigation path.
