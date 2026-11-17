import {useEffect,useRef,useState} from 'react';
import {errorMessage} from './useResource';
export default function useWriteAction(){
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[uncertain,setUncertain]=useState(false);
 const locked=useRef(false),mounted=useRef(true);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 async function run(operation,onSuccess,{create=false}={}){
  if(locked.current || uncertain)return false;locked.current=true;setBusy(true);setError('');
  try{const result=await operation();if(mounted.current)onSuccess?.(result);return true;}
  catch(failure){if(mounted.current){setError(errorMessage(failure));if(create && (!failure.response || failure.response.status>=500))setUncertain(true);}return false;}
  finally{locked.current=false;if(mounted.current)setBusy(false);}
 }
 return {busy,error,uncertain,run,reset:()=>{if(!locked.current){setError('');setUncertain(false);}}};
}
