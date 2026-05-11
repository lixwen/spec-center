import { describe, it, expect } from "vitest";
import { splitMarkdownByHeading } from "../packages/core/src/utils/chunker";

describe("splitMarkdownByHeading", () => {
  it("splits multi-level heading document correctly", () => {
    const doc = `# Title
## Overview
content1
## Requirements
### Must
content2
### Should
content3`;

    const chunks = splitMarkdownByHeading(doc);

    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toEqual({
      heading_path: "Title > Overview",
      content: "content1",
      chunk_index: 0
    });
    expect(chunks[1]).toEqual({
      heading_path: "Title > Requirements > Must",
      content: "content2",
      chunk_index: 1
    });
    expect(chunks[2]).toEqual({
      heading_path: "Title > Requirements > Should",
      content: "content3",
      chunk_index: 2
    });
  });

  it("returns single chunk for document without headings", () => {
    const doc = `Just some plain text
with multiple lines
and no headings at all.`;

    const chunks = splitMarkdownByHeading(doc);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toEqual({
      heading_path: "",
      content: doc,
      chunk_index: 0
    });
  });

  it("treats content before first heading as first chunk", () => {
    const doc = `Preamble text here
## Section1
section content`;

    const chunks = splitMarkdownByHeading(doc);

    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toEqual({
      heading_path: "",
      content: "Preamble text here",
      chunk_index: 0
    });
    expect(chunks[1]).toEqual({
      heading_path: "Section1",
      content: "section content",
      chunk_index: 1
    });
  });

  it("handles sibling headings at the same level", () => {
    const doc = `## A
content-a
## B
content-b
## C
content-c`;

    const chunks = splitMarkdownByHeading(doc);

    expect(chunks).toHaveLength(3);
    expect(chunks[0].heading_path).toBe("A");
    expect(chunks[1].heading_path).toBe("B");
    expect(chunks[2].heading_path).toBe("C");
  });

  it("returns empty array for empty input", () => {
    expect(splitMarkdownByHeading("")).toEqual([]);
    expect(splitMarkdownByHeading("   \n  \n  ")).toEqual([]);
  });

  it("handles heading with no content underneath", () => {
    const doc = `## Heading Only
## Another Heading
some content`;

    const chunks = splitMarkdownByHeading(doc);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].heading_path).toBe("Another Heading");
    expect(chunks[0].content).toBe("some content");
  });
});
