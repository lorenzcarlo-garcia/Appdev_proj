// Pure helpers for the reporting-volume line chart (kept separate so they can be tested).

// Round axis maximum and steps: 1, 2 or 5 x 10^n, with about four gridlines.
export function niceScale(max){
  if(max<=0) return {max:1,ticks:[0,1]};
  const rough=max/4,power=10**Math.floor(Math.log10(rough)),unit=rough/power;
  const step=Math.max(1,(unit<=1.5?1:unit<=3?2:unit<=7?5:10)*power);
  const top=Math.ceil(max/step)*step;
  const ticks=[];for(let value=0;value<=top;value+=step) ticks.push(value);
  return {max:top,ticks};
}

// Monotone cubic curve (same rule as d3's curveMonotoneX): the curve passes through every
// point, never overshoots between two neighbouring points, and so never dips below zero.
export function monotonePath(points){
  if(!points.length) return '';
  if(points.length===1) return `M${points[0].x},${points[0].y}`;
  const n=points.length,slopes=[],tangents=[];
  for(let i=0;i<n-1;i++) slopes.push((points[i+1].y-points[i].y)/(points[i+1].x-points[i].x));
  for(let i=0;i<n;i++){
    if(i===0) tangents.push(slopes[0]);
    else if(i===n-1) tangents.push(slopes[n-2]);
    else {
      const a=slopes[i-1],b=slopes[i];
      tangents.push(a*b<=0?0:(Math.sign(a)+Math.sign(b))*Math.min(Math.abs(a),Math.abs(b),Math.abs(a+b)/4));
    }
  }
  const round=value=>Math.round(value*100)/100;
  let path=`M${round(points[0].x)},${round(points[0].y)}`;
  for(let i=0;i<n-1;i++){
    const p=points[i],q=points[i+1],h=(q.x-p.x)/3;
    path+=` C${round(p.x+h)},${round(p.y+tangents[i]*h)} ${round(q.x-h)},${round(q.y-tangents[i+1]*h)} ${round(q.x)},${round(q.y)}`;
  }
  return path;
}

// Show every k-th x label so labels never collide on narrow phone screens.
export function labelEvery(count,plotWidth,minimumSpacing=44){
  return Math.max(1,Math.ceil(count*minimumSpacing/Math.max(plotWidth,1)));
}
