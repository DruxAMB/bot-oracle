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
  h1: strip("h3", "mt-4 mb-1.5 text-sm font-semibold text-zinc-100 first:mt-0"),
  h2: strip("h3", "mt-4 mb-1.5 text-sm font-semibold text-zinc-100 first:mt-0"),
  h3: strip("h4", "mt-3 mb-1 text-sm font-semibold text-zinc-200 first:mt-0"),
  h4: strip("h5", "mt-3 mb-1 text-sm font-medium text-zinc-200 first:mt-0"),
  p: strip("p", "mb-2.5 last:mb-0"),
  ul: strip("ul", "mb-2.5 list-disc pl-5 space-y-1 last:mb-0"),
  ol: strip("ol", "mb-2.5 list-decimal pl-5 space-y-1 last:mb-0"),
  li: strip("li", "leading-relaxed marker:text-zinc-600"),
  strong: strip("strong", "font-semibold text-zinc-100"),
  em: strip("em", "italic text-zinc-200"),
  a: ({ node, ...rest }: any) => (
    <a className="text-sky-400 underline hover:text-sky-300" target="_blank" rel="noopener noreferrer" {...rest} />
  ),
  code: ({ node, className, children: c, ...rest }: any) =>
    className ? (
      <code className="block overflow-x-auto rounded bg-zinc-950 border border-zinc-800/70 p-3 text-xs text-zinc-300 font-mono" {...rest}>{c}</code>
    ) : (
      <code className="rounded bg-zinc-950 px-1 py-0.5 text-xs text-zinc-200 font-mono" {...rest}>{c}</code>
    ),
  pre: strip("pre", "mb-2.5 last:mb-0"),
  blockquote: strip("blockquote", "mb-2.5 border-l-2 border-zinc-700 pl-3 text-zinc-400 last:mb-0"),
  hr: strip("hr", "my-3 border-zinc-800"),
  table: strip("table", "mb-2.5 w-full text-xs last:mb-0"),
  thead: strip("thead", "text-zinc-500"),
  th: strip("th", "text-left px-2 py-1 font-normal border-b border-zinc-800"),
  td: strip("td", "px-2 py-1 border-b border-zinc-800/60"),
};

export default function Markdown({ children }: { children: string }) {
  return (
    <div className="text-sm leading-relaxed text-zinc-300">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
