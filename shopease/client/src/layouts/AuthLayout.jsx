import { ShieldCheck } from 'lucide-react';
export default function AuthLayout({ title, description, children, footer, wide = false }) {
  return <div className="auth-background grid min-h-dvh place-items-center px-4 py-8 sm:px-8 sm:py-12">
    <a href="#main-content" className="skip-link">Skip to main content</a>
    <div className={`mx-auto w-full ${wide ? 'max-w-[1160px]' : 'max-w-[1040px]'}`}>
      <header className="mb-6 flex items-center justify-center gap-2.5 text-brand lg:hidden"><ShieldCheck size={28} aria-hidden="true" /><p className="text-2xl font-bold tracking-tight">BantayLog</p></header>
      <main id="main-content" tabIndex={-1} className={`auth-shell mx-auto grid w-full min-w-0 ${wide ? 'max-w-[640px] lg:max-w-none lg:grid-cols-[0.85fr_1.15fr]' : 'max-w-[440px] lg:max-w-none lg:grid-cols-[0.95fr_1.05fr]'}`}>
        <aside className="auth-art m-3 hidden min-w-0 rounded-[22px] p-8 text-white lg:block" aria-label="About BantayLog">
          <div className="sticky top-10 flex min-h-[530px] flex-col justify-between gap-16">
            <div className="flex items-center gap-3 self-start rounded-xl bg-brand-dark/90 px-4 py-3"><ShieldCheck size={33} strokeWidth={1.7} aria-hidden="true" /><p className="text-xl font-bold tracking-tight">BantayLog</p></div>
            <div className="max-w-[320px]"><p className="mb-4 text-xs font-semibold tracking-[0.16em] text-teal-100 uppercase">Connected communities</p><p className="text-[36px] leading-[1.15] font-semibold tracking-tight">Your community.<br />Your concerns.<br />One place.</p><p className="mt-5 max-w-[280px] text-sm leading-6 text-teal-50">Report local concerns and follow their progress with your barangay.</p></div>
          </div>
        </aside>
        <section className="flex min-w-0 flex-col justify-center px-6 py-7 sm:px-9 sm:py-9 lg:px-12 lg:py-12">
          <div className="mx-auto w-full max-w-[520px]">
            <div className="mb-6 hidden items-center gap-2 text-brand lg:flex"><ShieldCheck size={22} aria-hidden="true" /><span className="text-xs font-semibold tracking-wide">BARANGAY RESIDENT SERVICES</span></div>
            <h1 className="text-[28px] leading-tight font-bold tracking-tight">{title}</h1>
            <p className="mt-3 max-w-md text-sm leading-6 text-muted">{description || 'Welcome back. Sign in to access your barangay portal.'}</p>
            <div className="mt-7">{children}</div>
            {footer && <div className="mt-7 border-t border-line/70 pt-5 text-center text-sm leading-6 text-muted">{footer}</div>}
          </div>
        </section>
      </main>
      <footer className="mt-6 text-center text-xs leading-6 text-muted">Barangay incident reporting and blotter management.</footer>
    </div>
  </div>;
}
