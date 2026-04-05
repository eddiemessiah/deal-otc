const HEADING_PATTERN = /^#{1,4}\s+.+/;
const NUMBERED_SECTION = /^(\d+\.)+\s+/;
const LETTERED_SUBSECTION = /^\s*\(?[a-z]\)\s+/i;
const ARTICLE_PATTERN = /^(ARTICLE|SECTION|CLAUSE)\s+[IVXLCDM\d]+/i;
const DEFINED_TERM_LINE = /^"[A-Z][^"]*"\s+(means|refers to|shall mean)/;
const ALL_CAPS_HEADING = /^[A-Z][A-Z\s]{4,}$/;

interface SectionBoundary {
  lineIndex: number;
  type: "heading" | "numbered" | "article" | "caps-heading";
}

function detectBoundaries(lines: string[]): SectionBoundary[] {
  const boundaries: SectionBoundary[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (ARTICLE_PATTERN.test(line)) {
      boundaries.push({ lineIndex: i, type: "article" });
    } else if (HEADING_PATTERN.test(line)) {
      boundaries.push({ lineIndex: i, type: "heading" });
    } else if (NUMBERED_SECTION.test(line) && !LETTERED_SUBSECTION.test(line)) {
      boundaries.push({ lineIndex: i, type: "numbered" });
    } else if (ALL_CAPS_HEADING.test(line) && line.length < 80) {
      boundaries.push({ lineIndex: i, type: "caps-heading" });
    }
  }

  return boundaries;
}

function splitByBoundaries(lines: string[], boundaries: SectionBoundary[]): string[] {
  if (boundaries.length === 0) return splitByParagraphs(lines);

  const sections: string[] = [];

  for (let i = 0; i < boundaries.length; i++) {
    const start = boundaries[i].lineIndex;
    const end = i + 1 < boundaries.length ? boundaries[i + 1].lineIndex : lines.length;
    const sectionLines = lines.slice(start, end);
    const content = sectionLines.join("\n").trim();
    if (content.length > 0) {
      sections.push(content);
    }
  }

  if (boundaries[0].lineIndex > 0) {
    const preamble = lines.slice(0, boundaries[0].lineIndex).join("\n").trim();
    if (preamble.length > 20) {
      sections.unshift(preamble);
    }
  }

  return sections;
}

function splitByParagraphs(lines: string[]): string[] {
  const sections: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    if (line.trim() === "") {
      if (current.length > 0) {
        const content = current.join("\n").trim();
        if (content.length > 20) {
          sections.push(content);
        }
        current = [];
      }
    } else {
      current.push(line);
    }
  }

  if (current.length > 0) {
    const content = current.join("\n").trim();
    if (content.length > 20) {
      sections.push(content);
    }
  }

  return sections;
}

function mergeShortSections(sections: string[], minLength: number = 50): string[] {
  const merged: string[] = [];

  for (const section of sections) {
    if (merged.length > 0 && merged[merged.length - 1].length < minLength) {
      merged[merged.length - 1] += "\n\n" + section;
    } else {
      merged.push(section);
    }
  }

  return merged;
}

export function parseContract(content: string): string[] {
  const lines = content.split("\n");
  const boundaries = detectBoundaries(lines);
  const rawSections = splitByBoundaries(lines, boundaries);
  return mergeShortSections(rawSections);
}

