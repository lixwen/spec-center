"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Application error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center gap-4">
      <h2 className="text-xl font-semibold text-red-600">出现错误</h2>
      <p className="text-sm text-gray-600">{error.message || "发生了意外错误"}</p>
      <button
        onClick={reset}
        className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
      >
        重试
      </button>
    </div>
  );
}
