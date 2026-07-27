from difflib import SequenceMatcher
from pathlib import Path
import subprocess

path = Path("src/main.jsx")
base_bytes = subprocess.check_output(["git", "show", "origin/main:src/main.jsx"])
patched_bytes = path.read_bytes()
base_has_bom = base_bytes.startswith(b"\xef\xbb\xbf")
base_text = base_bytes.decode("utf-8-sig")
patched_text = patched_bytes.decode("utf-8-sig")
base_lines = base_text.splitlines(keepends=True)
base_content = [line.rstrip("\r\n") for line in base_lines]
patched_content = patched_text.splitlines()
matcher = SequenceMatcher(None, base_content, patched_content, autojunk=False)


def line_ending(index: int) -> str:
    candidates = []
    if 0 <= index < len(base_lines):
        candidates.append(base_lines[index])
    if 0 <= index - 1 < len(base_lines):
        candidates.append(base_lines[index - 1])
    for line in candidates:
        if line.endswith("\r\n"):
            return "\r\n"
        if line.endswith("\n"):
            return "\n"
    return "\n"


output = []
for tag, i1, i2, j1, j2 in matcher.get_opcodes():
    if tag == "equal":
        output.extend(base_lines[i1:i2])
        continue
    ending = line_ending(i1)
    for line in patched_content[j1:j2]:
        output.append(line + ending)

result = "".join(output).encode("utf-8")
if base_has_bom:
    result = b"\xef\xbb\xbf" + result
path.write_bytes(result)
print("Restored original main.jsx line-ending pattern around unchanged lines")
