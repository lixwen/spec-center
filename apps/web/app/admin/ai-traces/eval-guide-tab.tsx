"use client";

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

const components: Components = {
  h1: ({ children, ...props }) => (
    <h1 className="mb-6 text-3xl font-bold text-slate-900" {...props}>{children}</h1>
  ),
  h2: ({ children, ...props }) => (
    <h2 className="mb-4 mt-10 text-2xl font-semibold text-slate-800 border-b border-slate-200 pb-2" {...props}>{children}</h2>
  ),
  h3: ({ children, ...props }) => (
    <h3 className="mb-3 mt-6 text-xl font-semibold text-slate-700" {...props}>{children}</h3>
  ),
  h4: ({ children, ...props }) => (
    <h4 className="mb-2 mt-4 text-lg font-medium text-slate-700" {...props}>{children}</h4>
  ),
  p: ({ children, ...props }) => (
    <p className="mb-4 leading-7 text-slate-600" {...props}>{children}</p>
  ),
  ul: ({ children, ...props }) => (
    <ul className="mb-4 ml-6 list-disc space-y-1 text-slate-600" {...props}>{children}</ul>
  ),
  ol: ({ children, ...props }) => (
    <ol className="mb-4 ml-6 list-decimal space-y-1 text-slate-600" {...props}>{children}</ol>
  ),
  li: ({ children, ...props }) => (
    <li className="leading-7" {...props}>{children}</li>
  ),
  code: ({ className, children, ...props }) => {
    const isBlock = className?.startsWith("language-");
    if (isBlock) {
      return (
        <code className={`block rounded-lg bg-slate-900 px-4 py-3 text-sm text-slate-100 overflow-x-auto ${className ?? ""}`} {...props}>
          {children}
        </code>
      );
    }
    return (
      <code className="rounded bg-slate-100 px-1.5 py-0.5 text-sm font-medium text-rose-600" {...props}>
        {children}
      </code>
    );
  },
  pre: ({ children, ...props }) => (
    <pre className="mb-4 overflow-x-auto rounded-lg bg-slate-900 p-0" {...props}>{children}</pre>
  ),
  table: ({ children, ...props }) => (
    <div className="mb-4 overflow-x-auto rounded-lg border border-slate-200">
      <table className="min-w-full divide-y divide-slate-200 text-sm" {...props}>{children}</table>
    </div>
  ),
  thead: ({ children, ...props }) => (
    <thead className="bg-slate-50" {...props}>{children}</thead>
  ),
  th: ({ children, ...props }) => (
    <th className="px-4 py-2.5 text-left font-semibold text-slate-700" {...props}>{children}</th>
  ),
  td: ({ children, ...props }) => (
    <td className="px-4 py-2 text-slate-600" {...props}>{children}</td>
  ),
  blockquote: ({ children, ...props }) => (
    <blockquote className="mb-4 border-l-4 border-blue-300 bg-blue-50 px-4 py-2 text-slate-700 italic" {...props}>
      {children}
    </blockquote>
  ),
  hr: (props) => <hr className="my-8 border-slate-200" {...props} />,
  a: ({ href, children, ...props }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline hover:text-blue-800" {...props}>
      {children}
    </a>
  )
};

export default function EvalGuideTab({ markdown }: { markdown: string }) {
  return (
    <article className="mx-auto max-w-4xl rounded-xl border border-slate-200 bg-white px-10 py-8 shadow-sm">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {markdown}
      </ReactMarkdown>
    </article>
  );
}
