import ServiceIdentity from '../components/ui/ServiceIdentity';
import churchPhoto from '../assets/branding/church.jpg';
import {Link} from 'react-router-dom';
export default function AuthLayout({title,description,children,footer,wide=false}) {
  return <div className="auth-background min-h-dvh px-4 py-6 sm:px-8 sm:py-10 lg:py-12">
    <a href="#main-content" className="skip-link">Skip to main content</a>
    <div className={`mx-auto w-full ${wide?'max-w-[1080px]':'max-w-[960px]'}`}>
      <header className="service-masthead mb-7 flex items-center justify-between gap-4 pb-5 sm:mb-10"><ServiceIdentity/><p className="hidden text-right text-xs leading-6 text-muted sm:block">Barangay services<br/>Incident reporting &amp; blotter records</p></header>
      <main id="main-content" tabIndex={-1} className="auth-shell grid min-w-0 lg:grid-cols-[0.85fr_1.15fr]">
        <aside className="auth-art flex min-w-0 flex-col overflow-hidden" aria-label="About BantayLog">
          <img src={churchPhoto} alt="Church facade and bell tower" width="1140" height="660" fetchPriority="high" className="block h-auto w-full" />
          <div className="hidden flex-1 flex-col justify-between gap-10 p-8 lg:flex">
            <div><p className="eyebrow text-brand">Barangay service desk</p><h2 className="mt-5 text-[32px] leading-[1.18] font-normal text-brand-dark">A record of your concern.<br/>A way to follow up.</h2><p className="mt-5 max-w-[30ch] text-sm leading-7 text-ink">Report an incident, keep your Report ID and follow the barangay's response.</p></div>
            <div className="border-t border-rule pt-6"><p className="eyebrow mb-3">Your information</p><p className="max-w-[32ch] text-sm leading-7 text-muted">Your reports are available to you and authorized barangay personnel.</p></div>
          </div>
        </aside>
        <section className="min-w-0 px-5 py-7 sm:px-9 sm:py-10 lg:px-11 lg:py-12"><div className="mx-auto max-w-[520px]"><p className="eyebrow mb-4">Resident &amp; personnel access</p><h1 className="text-[30px] leading-tight font-semibold text-brand-dark sm:text-[36px]">{title}</h1><p className="mt-3 text-sm leading-7 text-muted">{description || 'Sign in using your registered email and password.'}</p><div className="mt-8">{children}</div>{footer && <div className="mt-7 border-t border-line pt-5 text-sm leading-7 text-muted">{footer}</div>}</div></section>
      </main>
      <footer className="mt-6 flex flex-wrap justify-between gap-2 text-xs leading-6 text-muted"><p>BantayLog / Barangay records</p><p><Link className="text-link" to="/terms">Terms and Conditions</Link> · <Link className="text-link" to="/privacy">Privacy Notice</Link></p></footer>
    </div>
  </div>;
}
