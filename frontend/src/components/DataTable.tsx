import {useEffect,useMemo,useState} from 'react';
import {ChevronDown,ChevronLeft,ChevronRight,ChevronUp,ChevronsUpDown} from 'lucide-react';
import type {ReactNode} from 'react';
import StatusBadge from './StatusBadge';

export type Column<T=any>={key:string;label:string;sortable?:boolean;render?:(value:any,row:T)=>ReactNode};
type Props<T>={rows:T[];columns:Column<T>[];loading?:boolean;emptyText?:string;pageSize?:number;search?:string;filters?:Record<string,string>};
const valueAt=(row:any,key:string)=>key.split('.').reduce((v,k)=>v?.[k],row);
const display=(v:any)=>{if(v===null||v===undefined||v==='')return '—';if(typeof v==='object')return v.name??v.fullName??v.email??'—';return String(v)};
const statusKey=['status','accountStatus','employmentStatus','workMode','priority','projectStatus'];
const fmt=(key:string,v:any)=>{
 if(v===null||v===undefined||v==='')return '—';
 if(['date','fromDate','toDate','dueDate','dateOfJoining'].includes(key)){const d=new Date(v);return Number.isNaN(d.getTime())?'—':d.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})}
 if(['loginTime','logoutTime'].includes(key)){const d=new Date(v);return Number.isNaN(d.getTime())?'—':d.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}
 return display(v);
};
export default function DataTable<T extends Record<string,any>>({rows,columns,loading,emptyText='No records found.',pageSize=10,search='',filters={}}:Props<T>){
 const [sort,setSort]=useState<{key:string;dir:'asc'|'desc'}|null>(null);const [page,setPage]=useState(1);
 const filtered=useMemo(()=>rows.filter(r=>{const q=search.trim().toLowerCase();return(!q||columns.some(c=>display(valueAt(r,c.key)).toLowerCase().includes(q)))&&Object.entries(filters).every(([k,v])=>!v||String(valueAt(r,k)??'')===v)}),[rows,columns,search,filters]);
 useEffect(()=>setPage(1),[search,filters]);
 const sorted=useMemo(()=>sort?[...filtered].sort((a,b)=>display(valueAt(a,sort.key)).localeCompare(display(valueAt(b,sort.key)),undefined,{numeric:true})*(sort.dir==='asc'?1:-1)):filtered,[filtered,sort]);
 const pages=Math.max(1,Math.ceil(sorted.length/pageSize));const safe=Math.min(page,pages);const shown=sorted.slice((safe-1)*pageSize,safe*pageSize);
 const change=(key:string)=>{setPage(1);setSort(s=>s?.key===key?{key,dir:s.dir==='asc'?'desc':'asc'}:{key,dir:'asc'})};
 if(loading)return <div className="tableState">Loading data…</div>;
 return <div className="dataTableWrap"><div className="tableScroll"><table className="table dataTable"><thead><tr>{columns.map(c=><th key={c.key}>{c.sortable===false?<span>{c.label}</span>:<button className="sortButton" type="button" onClick={()=>change(c.key)}><span>{c.label}</span>{sort?.key===c.key?(sort.dir==='asc'?<ChevronUp size={14}/>:<ChevronDown size={14}/>):<ChevronsUpDown size={14}/>}</button>}</th>)}</tr></thead><tbody>{shown.map((r:any,i:number)=><tr key={r.id??i}>{columns.map(c=>{const v=valueAt(r,c.key);return <td key={c.key}>{c.render?c.render(v,r):statusKey.includes(c.key)?<StatusBadge status={v}/>:fmt(c.key,v)}</td>})}</tr>)}</tbody></table></div>{!shown.length&&<div className="tableState">{emptyText}</div>}<div className="pagination"><span>Showing <b>{sorted.length?((safe-1)*pageSize+1):0}</b>–<b>{Math.min(safe*pageSize,sorted.length)}</b> of <b>{sorted.length}</b></span><div className="paginationButtons"><button className="iconBtn" disabled={safe<=1} onClick={()=>setPage(p=>Math.max(1,p-1))}><ChevronLeft size={16}/></button><span>Page <b>{safe}</b> of <b>{pages}</b></span><button className="iconBtn" disabled={safe>=pages} onClick={()=>setPage(p=>Math.min(pages,p+1))}><ChevronRight size={16}/></button></div></div></div>;
}