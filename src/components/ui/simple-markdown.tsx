import { Fragment } from "react";

// Tiny, dependency-free renderer for campaign scripts: ### headings,
// numbered / bulleted lists, **bold** and paragraphs. Anything else is
// shown as plain text, so an unformatted script still reads fine.
function inline(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i} className="font-semibold text-ink">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

export function SimpleMarkdown({ source, className }: { source: string; className?: string }) {
  const blocks = source.split(/\n{2,}/);
  return (
    <div className={className}>
      {blocks.map((block, bi) => {
        const lines = block.split("\n").filter((l) => l.trim());
        if (lines.length === 0) return null;
        return (
          <div key={bi} className="mb-2 last:mb-0">
            {lines.map((line, li) => {
              const t = line.trim();
              if (t.startsWith("### ") || t.startsWith("## "))
                return (
                  <div key={li} className="mb-0.5 mt-1 text-[11px] font-semibold uppercase tracking-wide text-brand-blue">
                    {t.replace(/^#+\s/, "")}
                  </div>
                );
              const list = t.match(/^(\d+\.|[-*])\s+(.*)$/);
              if (list)
                return (
                  <div key={li} className="flex gap-1.5 pl-1">
                    <span className="shrink-0 text-gold-text">{list[1].endsWith(".") ? list[1] : "•"}</span>
                    <span>{inline(list[2])}</span>
                  </div>
                );
              return <p key={li}>{inline(t)}</p>;
            })}
          </div>
        );
      })}
    </div>
  );
}
