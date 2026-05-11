export function NoProjectAccess({
  messages
}: {
  messages: { title: string; description: string; hint: string };
}) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className="mx-auto max-w-md text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--primary-soft)]">
          <svg
            className="h-8 w-8 text-[var(--primary)]"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z"
            />
          </svg>
        </div>
        <h2 className="mt-6 font-[family-name:var(--font-display)] text-2xl font-bold tracking-[-0.03em] text-slate-900">
          {messages.title}
        </h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">{messages.description}</p>
        <p className="mt-2 text-sm leading-6 text-slate-500">{messages.hint}</p>
      </div>
    </div>
  );
}
