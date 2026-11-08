#!/usr/bin/env python3
"""Minimal, dependency-free Markdown -> print-ready HTML for the EduSync brief.

Handles the subset used in README.md: headings, paragraphs, tables, fenced code,
bullet lists, blockquotes, horizontal rules, images, bold, inline code, links.
"""
import html
import re
import sys
from pathlib import Path

INLINE_CODE = re.compile(r"`([^`]+)`")
BOLD = re.compile(r"\*\*(.+?)\*\*")
ITALIC = re.compile(r"(?<!\*)\*([^*\n]+)\*(?!\*)")
LINK = re.compile(r"\[([^\]]+)\]\(([^)]+)\)")


def inline(text: str) -> str:
    out = html.escape(text, quote=False)
    stash = {}

    def keep(fragment):
        key = f"\x00{len(stash)}\x00"
        stash[key] = fragment
        return key

    out = INLINE_CODE.sub(lambda m: keep(f"<code>{html.escape(m.group(1), quote=False)}</code>"), out)
    out = BOLD.sub(lambda m: f"<strong>{m.group(1)}</strong>", out)
    out = ITALIC.sub(lambda m: f"<em>{m.group(1)}</em>", out)
    out = LINK.sub(lambda m: keep(f'<a href="{m.group(2)}">{m.group(1)}</a>'), out)
    for key, frag in stash.items():
        out = out.replace(key, frag)
    return out


def split_row(line: str):
    return [c.strip() for c in line.strip().strip("|").split("|")]


def convert(md: str, image_prefix: str) -> str:
    lines = md.split("\n")
    out, i = [], 0
    n = len(lines)
    while i < n:
        line = lines[i]
        stripped = line.strip()

        if not stripped:
            i += 1
            continue

        # fenced code
        if stripped.startswith("```"):
            i += 1
            buf = []
            while i < n and not lines[i].strip().startswith("```"):
                buf.append(lines[i])
                i += 1
            i += 1
            code = html.escape("\n".join(buf), quote=False)
            out.append(f"<pre><code>{code}</code></pre>")
            continue

        # horizontal rule
        if re.fullmatch(r"-{3,}", stripped):
            out.append("<hr>")
            i += 1
            continue

        # headings
        m = re.match(r"^(#{1,4})\s+(.*)$", stripped)
        if m:
            level = len(m.group(1))
            out.append(f"<h{level}>{inline(m.group(2))}</h{level}>")
            i += 1
            continue

        # tables
        if stripped.startswith("|") and i + 1 < n and re.match(r"^\|[\s:|-]+\|$", lines[i + 1].strip()):
            head = split_row(stripped)
            i += 2
            body = []
            while i < n and lines[i].strip().startswith("|"):
                body.append(split_row(lines[i].strip()))
                i += 1
            out.append("<table><thead><tr>" + "".join(f"<th>{inline(c)}</th>" for c in head) + "</tr></thead><tbody>")
            for row in body:
                out.append("<tr>" + "".join(f"<td>{inline(c)}</td>" for c in row) + "</tr>")
            out.append("</tbody></table>")
            continue

        # blockquote
        if stripped.startswith(">"):
            buf = []
            while i < n and lines[i].strip().startswith(">"):
                buf.append(lines[i].strip()[1:].strip())
                i += 1
            out.append(f"<blockquote>{inline(' '.join(buf))}</blockquote>")
            continue

        # lists
        if re.match(r"^(\*|-|\d+\.)\s+", stripped):
            ordered = bool(re.match(r"^\d+\.", stripped))
            tag = "ol" if ordered else "ul"
            out.append(f"<{tag}>")
            while i < n and re.match(r"^(\*|-|\d+\.)\s+", lines[i].strip()):
                item = re.sub(r"^(\*|-|\d+\.)\s+", "", lines[i].strip())
                out.append(f"<li>{inline(item)}</li>")
                i += 1
            out.append(f"</{tag}>")
            continue

        # image paragraph
        m = re.fullmatch(r"!\[([^\]]*)\]\(([^)]+)\)", stripped)
        if m:
            src = m.group(2)
            if not src.startswith(("http", "/")):
                src = image_prefix + src
            out.append(
                f'<figure><img src="{html.escape(src, quote=True)}" alt="{html.escape(m.group(1))}">'
                f'<figcaption>{html.escape(m.group(1))}</figcaption></figure>'
            )
            i += 1
            continue

        # paragraph (join consecutive lines)
        buf = []
        while i < n and lines[i].strip() and not re.match(
            r"^(#{1,4}\s|```|\||>|(\*|-|\d+\.)\s|!\[|-{3,}$)", lines[i].strip()
        ):
            buf.append(lines[i].strip())
            i += 1
        out.append(f"<p>{inline(' '.join(buf))}</p>")

    return "\n".join(out)


CSS = """
:root{
  --navy:#0F1B2D; --teal:#0E7C6B; --ink:#101828; --ink2:#344054; --muted:#667085;
  --line:#E4E7EC; --bg2:#F7F9FC; --amber:#B45309; --amber-soft:#FDF3E3;
}
@page { size: A4; margin: 15mm 14mm 16mm 14mm; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif;
  color: var(--ink); font-size: 9.6pt; line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}
.cover { border-bottom: 3px solid var(--teal); padding-bottom: 10mm; margin-bottom: 8mm; }
.kicker { font-size: 7.6pt; letter-spacing: .16em; text-transform: uppercase; color: var(--teal); font-weight: 700; }
.cover h1 { font-size: 26pt; letter-spacing: -.03em; margin: 4mm 0 2mm; line-height: 1.05; }
.cover .sub { font-size: 11pt; color: var(--ink2); }
.meta { margin-top: 4mm; font-size: 8pt; color: var(--muted); }
h1 { font-size: 17pt; letter-spacing: -.02em; margin: 0 0 3mm; }
h2 { font-size: 13.4pt; letter-spacing: -.015em; margin: 8mm 0 2.5mm; padding-bottom: 1.6mm;
     border-bottom: 1px solid var(--line); break-after: avoid; }
h3 { font-size: 10.6pt; margin: 5mm 0 1.8mm; color: var(--navy); break-after: avoid; }
p { margin: 0 0 2.6mm; color: var(--ink2); }
strong { color: var(--navy); }
a { color: var(--teal); text-decoration: none; }
code { font-family: "SF Mono", ui-monospace, Menlo, monospace; font-size: 8.4pt; background: var(--bg2);
       border: 1px solid var(--line); border-radius: 3px; padding: 0 2px; color: #0A5B4F; }
pre { background: #0F1B2D; color: #D7E4F2; padding: 3.2mm 4mm; border-radius: 3mm; overflow: hidden;
      break-inside: avoid; margin: 0 0 3mm; }
pre code { background: none; border: none; color: inherit; font-size: 7.5pt; line-height: 1.55; padding: 0; }
table { width: 100%; border-collapse: collapse; font-size: 8.2pt; margin: 0 0 3.6mm; break-inside: avoid; }
th { text-align: left; background: var(--navy); color: #fff; font-size: 7.2pt; letter-spacing: .07em;
     text-transform: uppercase; padding: 1.8mm 2mm; font-weight: 700; }
td { padding: 1.7mm 2mm; border-bottom: 1px solid var(--line); vertical-align: top; color: var(--ink2); }
tr:nth-child(even) td { background: #FAFBFD; }
blockquote { margin: 0 0 3mm; padding: 2.6mm 3.6mm; background: var(--amber-soft);
             border-left: 3px solid var(--amber); border-radius: 0 2mm 2mm 0; color: #7A3E06;
             font-weight: 550; break-inside: avoid; }
ul, ol { margin: 0 0 3mm; padding-left: 5mm; color: var(--ink2); }
li { margin-bottom: 1.3mm; }
hr { border: none; border-top: 1px solid var(--line); margin: 6mm 0; }
figure { margin: 4mm 0 5mm; break-inside: avoid; }
figure img { width: 100%; border: 1px solid var(--line); border-radius: 2.5mm; display: block; }
figcaption { font-size: 7.6pt; color: var(--muted); margin-top: 1.6mm; text-align: center; }
h2 + p, h3 + p { margin-top: 0; }
"""


def main() -> None:
    root = Path(__file__).resolve().parent.parent
    md_path = root / "README.md"
    out_path = Path(sys.argv[2]) if len(sys.argv) > 2 else root / "src" / "brief.html"
    img_prefix = sys.argv[1] if len(sys.argv) > 1 else "../"
    md = md_path.read_text(encoding="utf-8")

    # strip the leading H1 block: rendered as a cover instead, and drop the metadata
    # paragraph that follows it (the cover already carries that information).
    body_md = md
    m = re.search(r"^# (.*?)\n", md, re.S)
    title = m.group(1) if m else "EduSync"
    body_md = md.split("\n", 1)[1] if m else md
    body_md = re.sub(r"^.*?\n---\n", "", body_md, count=1, flags=re.S)

    body = convert(body_md, image_prefix=img_prefix)
    hero = (
        f'<figure><img src="{img_prefix}assets/00-overview.png" alt="EduSync at a glance">'
        '<figcaption>EduSync at a glance — problem, solution, architecture, merge ladder, stack and rubric evidence</figcaption></figure>'
    )
    doc = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>{title}</title>
<style>{CSS}</style></head>
<body>
<div class="cover">
  <div class="kicker">Technical EdTech Hackathon · Problem 1 · Very hard</div>
  <h1>{title}</h1>
  <div class="sub">Offline-first learning infrastructure — problem definition, solution, architecture, stack and product design</div>
  <div class="meta">Theme: education technology · Domains: distributed systems, databases, networking, fault tolerance · Brief's stack: React · Node.js · PostgreSQL · IndexedDB · Redis · WebSockets · Docker</div>
</div>
{hero}
{body}
</body></html>"""
    out_path.write_text(doc, encoding="utf-8")
    print(f"wrote {out_path} ({len(doc)} bytes)")


if __name__ == "__main__":
    sys.exit(main())
