import {useEffect,useRef,useState} from 'react';
import {bucketLabel,shortBucketLabel} from './chartFormat';
import {labelEvery,monotonePath,niceScale} from './lineChart';
const titles={day:'Reports received per day',week:'Reports received per week (Monday to Sunday)',month:'Reports received per month',year:'Reports received per year'};
const HEIGHT=260,PAD={top:28,right:20,bottom:36,left:40};

// Animated line chart drawn in SVG at the container's real pixel width, so text stays
// readable on phones. Dots mark the true counts; the curve only connects them.
export default function VolumeChart({series,granularity}){
  const frame=useRef(null);const [width,setWidth]=useState(640);
  useEffect(()=>{
    const element=frame.current;if(!element || typeof ResizeObserver==='undefined') return undefined;
    const observer=new ResizeObserver(([entry])=>setWidth(Math.max(260,Math.round(entry.contentRect.width))));
    observer.observe(element);return ()=>observer.disconnect();
  },[]);
  const max=Math.max(0,...series.map(row=>row.total));
  const scale=niceScale(max),plotWidth=width-PAD.left-PAD.right,plotHeight=HEIGHT-PAD.top-PAD.bottom;
  const x=index=>PAD.left+(series.length===1?plotWidth/2:index*plotWidth/(series.length-1));
  const y=value=>PAD.top+plotHeight-value/scale.max*plotHeight;
  const points=series.map((row,index)=>({x:x(index),y:y(row.total),row}));
  const line=monotonePath(points);
  const area=points.length>1?`${line} L${points.at(-1).x},${y(0)} L${points[0].x},${y(0)} Z`:'';
  const every=labelEvery(series.length,plotWidth),showValues=plotWidth/Math.max(series.length,1)>=26;
  // Changing the data restarts the drawing animation.
  const signature=series.map(row=>row.bucket+':'+row.total).join('|');
  return <section className="panel p-5 sm:p-7" aria-labelledby="volume-title">
    <h2 id="volume-title" className="text-lg font-semibold text-brand-dark">{titles[granularity]}</h2>
    <p className="mt-1 text-xs text-muted">Grouped by the date each report was first submitted, in Philippine time. Each dot is the actual count.</p>
    <div ref={frame} className="mt-4 w-full">
      {max===0?<p className="text-sm text-muted">No reports were received in this period.</p>:
      <svg key={signature} className="line-chart" width={width} height={HEIGHT} viewBox={`0 0 ${width} ${HEIGHT}`} aria-hidden="true">
        <defs><linearGradient id="volume-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="var(--color-brand)" stopOpacity="0.22"/><stop offset="100%" stopColor="var(--color-brand)" stopOpacity="0"/></linearGradient></defs>
        {scale.ticks.map(tick=><g key={tick}><line className="line-grid" x1={PAD.left} x2={width-PAD.right} y1={y(tick)} y2={y(tick)}/><text className="line-axis" x={PAD.left-8} y={y(tick)} dy="0.32em" textAnchor="end">{tick}</text></g>)}
        {area && <path className="line-area" d={area} fill="url(#volume-fill)"/>}
        <path className="line-path" d={line} pathLength="1"/>
        {points.map((point,index)=><g key={point.row.bucket} className="line-point" style={{'--delay':`${0.9+index/points.length*0.5}s`}}>
          <title>{`${bucketLabel(point.row.bucket,granularity)}: ${point.row.total}`}</title>
          <circle cx={point.x} cy={point.y} r="5"/>
          {showValues && <text className="line-value" x={point.x} y={point.y-11} textAnchor="middle">{point.row.total}</text>}
          {index%every===0 && <text className="line-axis" x={point.x} y={HEIGHT-PAD.bottom+20} textAnchor="middle">{shortBucketLabel(point.row.bucket,granularity)}</text>}
        </g>)}
      </svg>}
    </div>
    <table className="sr-only"><caption>{titles[granularity]}</caption><thead><tr><th scope="col">Period</th><th scope="col">Reports</th></tr></thead><tbody>{series.map(row=><tr key={row.bucket}><td>{bucketLabel(row.bucket,granularity)}</td><td>{row.total}</td></tr>)}</tbody></table>
  </section>;
}
