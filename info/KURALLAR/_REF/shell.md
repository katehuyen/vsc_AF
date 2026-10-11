# Shell Transport — what the shell eats before your tool ever sees it

**The one rule:** a command string is parsed by a **shell** before Node, the bridge or the file ever gets it. Anything the shell finds meaningful inside it — backticks, quotes, backslashes, `$`, non-ASCII bytes — is consumed **silently**, and the damage is invisible in the tool's own output. So:

> **A PAYLOAD NEVER TRAVELS INSIDE A COMMAND.** Turkish prose, backticked `code` spans, multi-line text, a Windows path, a regex, a patch script: write it to a file **in the work area** (`$AGENT_FARM_WORKAREA`, named at session start) with the **Write** tool, and let the command only **name** the file (`node patch.js`, bridge `@args.json`). This costs one extra tool call and removes the whole class.

## The four measured traps

1. **Backticks vanish.** `node -e "…"` through a shell eats every `` `word` `` span and the quotes around it — measured on a CHANGELOG entry that had to be repaired by hand, twice on Turkish-heavy commands. Nothing errors; the words are simply gone.
2. **A quoted heredoc still eats one level of backslashes.** `cat > f <<'EOF'` is supposed to be literal and in this transport is not: `"D:\\zone\\x"` arrived as `"D:\zone\x"` and JS read it as `D:zonex`; `/a\\(b\\)/` arrived as `/a(b)/` and became a capture group. **Any** script carrying a backslash goes through **Write**, never a heredoc — and in a shell argument prefer forward slashes, which Windows accepts everywhere.
3. **The Edit tool turns an escape into the character it names.** A `join('\0')` separator arrived on disk as a real NUL and broke the build; a four-digit u-escape for U+FE0E arrived as the invisible selector itself, in the source and in the test that asserted it. Use a printable separator (`'|'`, `' >> '`); write a code point in the brace form (`\u{FE0E}`), which survives; and grep the escape back after the edit.
4. **`$` and shell loops are eaten too — not just payloads.** Measured three times in one session: `for d in "$A"/x-*; do ... "$d" ...; done` arrived with **every `$d` and `$A` replaced by nothing**, so `basename` ran with no argument and `ls` listed the wrong path. The command is re-expanded before this shell sees it, so a variable you set in the same command may be gone by the time it runs. Write the loop in a `.js` file and run `node file.js`; a single flat command with literal paths is fine, a loop with variables is not.
5. **Line endings are per file, and a patch script that ignores that doubles them.** Some files are CRLF and some LF. A script that joins lines with `'\n'` and writes them back into a CRLF file produces `\r\r\n`. Work internally with a single `'\n'` and normalise **once, at the end** — or derive the newline from the file you are editing. And a multi-line anchor matched with `\n` fails on half the repo: **anchor on ONE line.**

## Encoding

Windows PowerShell 5.1 re-encodes non-ASCII before a native process sees it, and `Get-Content`/`Set-Content` default to the ANSI codepage — which is why the constitution forbids rewriting repo files through them. For the bridge specifically, the shell-safe forms are in `_REF/bridge.md`: `@file.json` for anything nested or long, `--stdin-base64` when the payload must be piped, `--out` instead of a shell redirection.

## Verify, do not assume

After writing marked-up or Turkish content through any path, **read one affected line back** and check the backticks and the diacritics survived. Half of this damage is invisible in the command's own output, so a green exit code proves nothing.
