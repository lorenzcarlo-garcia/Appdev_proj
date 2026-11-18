import {useEffect,useState} from 'react';
import {Link,useLocation} from 'react-router-dom';
import {BadgeCheck,Clock3,ShieldQuestion} from 'lucide-react';
import {useAuth} from '../../hooks/useAuth';
import {getOwnProfile} from '../../services/management';

export default function ResidentVerification(){
  const {user}=useAuth();
  const {pathname}=useLocation();
  const [state,setState]=useState({userId:null,status:'checking'});
  const userId=user.id;
  useEffect(()=>{
    let controller;
    function refresh(){
      if(document.visibilityState==='hidden')return;
      controller?.abort();
      const request=new AbortController();
      controller=request;
      getOwnProfile({},request.signal).then(({profile})=>{
        if(request.signal.aborted)return;
        const value=profile?.is_verified;
        const status=value===true || value===1 ? 'verified' : value===false || value===0 ? 'pending' : 'unavailable';
        setState({userId,status});
      }).catch(()=>{
        if(!request.signal.aborted)setState({userId,status:'unavailable'});
      });
    }
    refresh();
    window.addEventListener('focus',refresh);
    window.addEventListener('bantaylog:profile-updated',refresh);
    document.addEventListener('visibilitychange',refresh);
    const timer=window.setInterval(refresh,60000);
    return ()=>{
      controller?.abort();
      window.clearInterval(timer);
      window.removeEventListener('focus',refresh);
      window.removeEventListener('bantaylog:profile-updated',refresh);
      document.removeEventListener('visibilitychange',refresh);
    };
  },[userId,pathname]);
  const status=state.userId===userId?state.status:'checking';
  const verified=status==='verified';
  const Icon=verified?BadgeCheck:status==='pending' || status==='checking'?Clock3:ShieldQuestion;
  const label=verified?'Verified':status==='pending'?'Not yet verified':status==='checking'?'Checking status…':'Status unavailable';
  const hint=verified?'Your resident details have been verified by the barangay.':status==='pending'?'Your resident details are awaiting barangay verification.':'Open your profile to check your resident details.';
  return <Link to="/resident/profile" className="resident-identity" title={hint} aria-label={`Resident: ${label}. View my profile`}>
    <span className="text-xs font-semibold tracking-wide text-white">Resident</span>
    <span className={`verification-badge verification-${status}`} role="status"><Icon size={17} aria-hidden="true"/><span>{label}</span></span>
  </Link>;
}
