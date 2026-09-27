import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Strip react-markdown's internal `node` prop before spreading onto DOM
// elements (React would warn about an unknown attribute otherwise).
const strip = (Tag: any, className: string) =>
  function MdEl({ node, ...rest }: any) {
    return <Tag className={className} {...rest} />;
  };

// Module-scope: the override map must have stable component identities,
// otherwise every Markdown re-render remounts the whole rendered subtree.
const COMPONENTS = {
  h1: strip("h3", "mt-4 mb-1.5 text-sm font-semibold text-foreground first:mt-0"),
  h2: strip("h3", "mt-4 mb-1.5 text-sm font-semibold text-foreground first:mt-0"),
  h3: strip("h4", "mt-3 mb-1 text-sm font-semibold text-foreground first:mt-0"),
  h4: strip("h5", "mt-3 mb-1 text-sm font-medium text-foreground first:mt-0"),
  p: strip("p", "mb-2.5 last:mb-0"),
  ul: strip("ul", "mb-2.5 list-disc pl-5 space-y-1 last:mb-0"),
  ol: strip("ol", "mb-2.5 list-decimal pl-5 space-y-1 last:mb-0"),
  li: strip("li", "leading-relaxed marker:text-steel"),
  strong: strip("strong", "font-semibold text-foreground"),
  em: strip("em", "italic text-foreground"),
  a: ({ node, ...rest }: any) => (
    <a className="text-secondary underline hover:text-foreground" target="_blank" rel="noopener noreferrer" {...rest} />
  ),
  code: ({ node, className, children: c, ...rest }: any) =>
    className ? (
      <code className="block overflow-x-auto rounded bg-background border border-border p-3 text-xs text-secondary font-mono" {...rest}>{c}</code>
    ) : (
      <code className="rounded bg-background px-1 py-0.5 text-xs text-foreground font-mono" {...rest}>{c}</code>
    ),
  pre: strip("pre", "mb-2.5 last:mb-0"),
  blockquote: strip("blockquote", "mb-2.5 border-l-2 border-border-strong pl-3 text-secondary last:mb-0"),
  hr: strip("hr", "my-3 border-border"),
  table: strip("table", "mb-2.5 w-full text-xs last:mb-0"),
  thead: strip("thead", "text-muted-foreground"),
  th: strip("th", "text-left px-2 py-1 font-normal border-b border-border"),
  td: strip("td", "px-2 py-1 border-b border-border"),
};

export default function Markdown({ children }: { children: string }) {
  return (
    <div className="text-sm leading-relaxed text-secondary">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
