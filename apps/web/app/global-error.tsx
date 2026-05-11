"use client";

export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="zh-CN">
      <body className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-4 p-8">
          <h2 className="text-xl font-semibold text-red-600">系统错误</h2>
          <p className="text-sm text-gray-600">{error.message || "发生了严重错误"}</p>
          <button
            onClick={reset}
            className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
          >
            重新加载
          </button>
        </div>
      </body>
    </html>
  );
}
