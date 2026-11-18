import barangaySeal from '../../assets/branding/sta-ana-logo.jpg';

export default function ServiceIdentity({compact=false,tone='default'}) {
  const light = tone === 'light';
  return <div className="flex min-w-0 items-center gap-3 sm:gap-4">
    <img src={barangaySeal} alt="Barangay Sta. Ana, Bayan ng Pateros seal" width="64" height="64" className={`service-seal shrink-0 object-contain ${compact?'h-10 w-10 sm:h-16 sm:w-16':'h-14 w-14 sm:h-16 sm:w-16'}`} />
    <div className="min-w-0"><p className={`font-heading leading-tight font-semibold tracking-tight ${light?'text-white':'text-brand-dark'} ${compact?'text-xl sm:text-[28px]':'text-[23px] sm:text-[28px]'}`}>BantayLog</p><p className={`mt-1 leading-5 ${light?'text-white':'text-muted'} ${compact?'text-[10px] sm:text-xs':'text-xs'}`}>Barangay Sta. Ana · Pateros</p></div>
  </div>;
}
