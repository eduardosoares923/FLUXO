import React from 'react';

export interface LegalSectionItem {
  id: string;
  number: string;
  title: string;
}

export function extractLegalSections(markdown: string): LegalSectionItem[] {
  const lines = (markdown || '').split(/\r?\n/);
  const sections: LegalSectionItem[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    const m = line.match(/^##\s+(?:(\d+)\.\s+)?(.+)$/);
    if (m) {
      const num = m[1] || String(sections.length + 1);
      const title = m[2].trim();
      sections.push({
        id: `secao-${num}`,
        number: num,
        title,
      });
    }
  }
  return sections;
}

function renderInline(text: string): React.ReactNode[] {
  const tokenRegex = /(\*\*[^*]+\*\*|\[[^\]]+\])/g;
  const parts = text.split(tokenRegex);
  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={idx} className="font-bold text-ink">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('[') && part.endsWith(']') && part.length > 2) {
      return (
        <span
          key={idx}
          className="inline-block px-2 py-0.5 rounded-md bg-priSoft text-priInk font-bold text-xs align-baseline"
        >
          {part.slice(1, -1)}
        </span>
      );
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

interface LegalMarkdownProps {
  markdown: string;
  compact?: boolean;
}

export function LegalMarkdown({ markdown, compact = false }: LegalMarkdownProps) {
  const lines = (markdown || '').split(/\r?\n/);
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let sectionIndex = 0;

  while (i < lines.length) {
    const line = lines[i].trim();

    if (!line) {
      i++;
      continue;
    }

    // Heading ##
    const headingMatch = line.match(/^##\s+(?:(\d+)\.\s+)?(.+)$/);
    if (headingMatch) {
      sectionIndex++;
      const num = headingMatch[1] || String(sectionIndex);
      const rawTitle = headingMatch[2].trim();
      const fullHeading = headingMatch[1] ? `${num}. ${rawTitle}` : rawTitle;
      blocks.push(
        <h2
          key={`h2-${i}`}
          id={`secao-${num}`}
          className={
            compact
              ? 'font-display text-sm font-bold text-ink pt-2 first:pt-0 scroll-mt-24'
              : 'font-display text-lg sm:text-xl font-bold text-ink pt-4 first:pt-0 scroll-mt-24'
          }
        >
          {fullHeading}
        </h2>
      );
      i++;
      continue;
    }

    // Callout >
    if (line.startsWith('>')) {
      const calloutLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        calloutLines.push(lines[i].trim().replace(/^>\s*/, ''));
        i++;
      }
      const cleanText = calloutLines.join(' ').replace(/^\*\*|\*\*$/g, '');
      blocks.push(
        <div
          key={`callout-${i}`}
          className="rounded-[18px] bg-priSoft text-priInk p-4 flex items-start gap-3"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-4 h-4 mt-0.5 shrink-0"
            aria-hidden="true"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
          <div className="font-bold text-xs sm:text-sm leading-relaxed">
            {renderInline(cleanText)}
          </div>
        </div>
      );
      continue;
    }

    // Table | ... |
    if (line.startsWith('|') && line.endsWith('|')) {
      const tableRows: string[][] = [];
      while (
        i < lines.length &&
        lines[i].trim().startsWith('|') &&
        lines[i].trim().endsWith('|')
      ) {
        const rowStr = lines[i].trim();
        const cells = rowStr
          .slice(1, -1)
          .split('|')
          .map((c) => c.trim());
        // Ignore markdown separator row like |---|---|
        if (!cells.every((c) => /^[-:]+$/.test(c))) {
          tableRows.push(cells);
        }
        i++;
      }
      if (tableRows.length > 0) {
        const header = tableRows[0];
        const body = tableRows.slice(1);
        blocks.push(
          <div
            key={`table-${i}`}
            className="overflow-x-auto rounded-[18px] border border-border bg-bg/60"
          >
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-border text-[11px] font-bold uppercase tracking-wider text-muted">
                  {header.map((cell, cIdx) => (
                    <th key={cIdx} className="py-3 px-4">
                      {cell}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {body.map((row, rIdx) => (
                  <tr key={rIdx}>
                    {row.map((cell, cIdx) => (
                      <td
                        key={cIdx}
                        className={`py-3 px-4 align-top ${
                          cIdx === 0 ? 'font-bold text-ink' : 'text-ink/90'
                        }`}
                      >
                        {renderInline(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      continue;
    }

    // Bullet list -
    if (line.startsWith('- ') || line.startsWith('* ')) {
      const items: string[] = [];
      while (
        i < lines.length &&
        (lines[i].trim().startsWith('- ') || lines[i].trim().startsWith('* '))
      ) {
        items.push(lines[i].trim().slice(2).trim());
        i++;
      }
      blocks.push(
        <ul
          key={`ul-${i}`}
          className={`list-disc pl-5 space-y-1.5 ${
            compact ? 'text-xs text-muted' : 'text-sm text-ink/90'
          } leading-relaxed`}
        >
          {items.map((it, idx) => (
            <li key={idx}>{renderInline(it)}</li>
          ))}
        </ul>
      );
      continue;
    }

    // Paragraph
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].trim().startsWith('## ') &&
      !lines[i].trim().startsWith('>') &&
      !lines[i].trim().startsWith('|') &&
      !lines[i].trim().startsWith('- ') &&
      !lines[i].trim().startsWith('* ')
    ) {
      paraLines.push(lines[i].trim());
      i++;
    }
    blocks.push(
      <p
        key={`p-${i}`}
        className={`${
          compact ? 'text-xs text-muted' : 'text-sm sm:text-[15px] text-ink/90'
        } leading-relaxed`}
      >
        {renderInline(paraLines.join(' '))}
      </p>
    );
  }

  return <div className={compact ? 'space-y-2.5' : 'space-y-4'}>{blocks}</div>;
}
