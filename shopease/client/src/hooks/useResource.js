import {useCallback,useEffect,useState} from 'react';
export function errorMessage(error,fallback='We could not complete this request. Please try again.'){return typeof error.response?.data?.message==='string'?error.response.data.message:fallback;}
export default function useResource(loader,params={}){
 const query=JSON.stringify(params);const [revision,setRevision]=useState(0);const key=query+':'+revision;
 const [state,setState]=useState({key:null,data:{},error:''});
 useEffect(()=>{const controller=new AbortController();loader(JSON.parse(query),controller.signal).then(data=>{if(!controller.signal.aborted)setState({key,data,error:''});}).catch(error=>{if(!controller.signal.aborted)setState({key,data:{},error:errorMessage(error)});});return()=>controller.abort();},[loader,query,key]);
 const reload=useCallback(()=>setRevision(value=>value+1),[]);
 return {data:state.key===key?state.data:{},loading:state.key!==key,error:state.key===key?state.error:'',reload};
}
