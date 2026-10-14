import {X} from 'lucide-react';
import type {ReactNode} from 'react';

type Props={open:boolean;title:string;children:ReactNode;onClose:()=>void;onSubmit?:()=>void;submitText?:string;loading?:boolean};
export default function FormModal({open,title,children,onClose,onSubmit,submitText='Save',loading}:Props){if(!open)return null;return <div className="modalBackdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><div className="modal modalLarge"><button className="modalClose" onClick={onClose}><X size={18}/></button><h3>{title}</h3><div className="modalBody">{children}</div>{onSubmit&&<div className="modalActions"><button className="btn secondary" onClick={onClose} disabled={loading}>Cancel</button><button className="btn" onClick={onSubmit} disabled={loading}>{loading?'Saving…':submitText}</button></div>}</div></div>}
