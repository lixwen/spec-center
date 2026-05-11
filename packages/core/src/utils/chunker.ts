export interface MarkdownChunk {
  heading_path: string;
  content: string;
  chunk_index: number;
}

const HEADING_RE = /^(#{1,3})\s+(.+)$/;

export function splitMarkdownByHeading(text: string): MarkdownChunk[] {
  const lines = text.split("\n");
  const chunks: MarkdownChunk[] = [];

  const headingStack: { level: number; title: string }[] = [];
  let currentContent: string[] = [];

  function buildPath(): string {
    return headingStack.map((h) => h.title).join(" > ");
  }

  function flush() {
    const content = currentContent.join("\n").trim();
    if (content.length > 0) {
      chunks.push({
        heading_path: buildPath(),
        content,
        chunk_index: chunks.length
      });
    }
    currentContent = [];
  }

  for (const line of lines) {
    const match = line.match(HEADING_RE);
    if (match) {
      flush();
      const level = match[1].length;
      const title = match[2].trim();

      while (headingStack.length > 0 && headingStack[headingStack.length - 1].level >= level) {
        headingStack.pop();
      }

      headingStack.push({ level, title });
    } else {
      currentContent.push(line);
    }
  }

  flush();
  return chunks;
}
