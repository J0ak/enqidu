from pathlib import Path

path = Path("src/main.jsx")
raw = path.read_bytes()
text = raw.decode("utf-8-sig").replace("\r\n", "\n").replace("\r", "\n")
path.write_bytes(b"\xef\xbb\xbf" + text.replace("\n", "\r\n").encode("utf-8"))
print("Normalized src/main.jsx to UTF-8 BOM + CRLF to match repository format")
