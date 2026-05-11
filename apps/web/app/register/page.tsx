import { RegisterForm } from "../../components/register-form";
import { getRequestMessages } from "../../lib/locale";
import { getCurrentUser } from "../../lib/session";
import { redirect } from "next/navigation";

export default async function RegisterPage() {
  const { messages } = await getRequestMessages();
  const currentUser = await getCurrentUser();
  if (currentUser) {
    redirect("/");
  }
  return (
    <div className="fixed inset-0 z-[80] overflow-y-auto bg-[color:rgba(15,23,42,0.42)] px-4 py-10 backdrop-blur-md md:px-8">
      <div className="mx-auto flex min-h-full max-w-5xl items-center justify-center">
        <div className="grid w-full max-w-4xl overflow-hidden rounded-[28px] border border-white/55 bg-[color:rgba(247,249,251,0.92)] shadow-[0_24px_90px_rgba(15,23,42,0.22)] lg:grid-cols-[minmax(0,1.1fr)_420px]">
          <section className="relative hidden min-h-[420px] overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(218,226,253,0.95),transparent_38%),linear-gradient(160deg,#fbfdff_0%,#eef3f8_52%,#dde7f7_100%)] p-10 lg:block">
            <div className="absolute inset-y-10 right-10 w-px bg-[linear-gradient(to_bottom,transparent,rgba(77,85,106,0.18),transparent)]" />
            <div className="relative z-10 max-w-md">
              <p className="font-[family-name:var(--font-label)] text-[11px] uppercase tracking-[0.24em] text-[var(--tertiary)]">
                {messages.register.eyebrow}
              </p>
              <h1 className="mt-4 font-[family-name:var(--font-display)] text-5xl font-black tracking-[-0.06em] text-slate-950">
                {messages.register.title}
              </h1>
              <p className="mt-5 text-base leading-7 text-slate-600">
                {messages.register.description}
              </p>
            </div>
            <div className="absolute bottom-10 left-10 right-16">
              <p className="font-[family-name:var(--font-label)] text-[11px] tracking-[0.14em] text-slate-400">
                Spec Center
              </p>
            </div>
          </section>
          <section className="relative p-6 sm:p-8 lg:p-10">
            <div className="mx-auto max-w-sm">
              <div className="mb-8 lg:hidden">
                <p className="font-[family-name:var(--font-label)] text-[11px] uppercase tracking-[0.24em] text-[var(--tertiary)]">
                  {messages.register.eyebrow}
                </p>
                <h1 className="mt-3 font-[family-name:var(--font-display)] text-3xl font-extrabold tracking-[-0.05em] text-slate-950">
                  {messages.register.title}
                </h1>
                <p className="mt-3 text-sm leading-6 text-slate-600">
                  {messages.register.description}
                </p>
              </div>
              <div className="rounded-[24px] border border-white/70 bg-white/88 p-6 shadow-[0_16px_48px_rgba(15,23,42,0.12)] backdrop-blur">
                <RegisterForm messages={messages.register} errorLabel={messages.common.requestFailed} workingLabel={messages.common.working} />
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
