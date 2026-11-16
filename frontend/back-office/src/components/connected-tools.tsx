import Link from 'next/link';
import { Activity, ArrowUpRight, Fingerprint, ListChecks } from 'lucide-react';
import styles from './connected-tools.module.css';
const tools = [
  {href:'/workspace/investigate',title:'Follow the priorities',copy:'Review signals, contributing records, and investigation evidence.',Icon:Fingerprint},
  {href:'/workspace/issues',title:'Explore recurring issues',copy:'Inspect ranked issues, patterns, and their supporting events.',Icon:ListChecks},
  {href:'/workspace/timeline',title:'See what changed',copy:'Trace recorded activity across periods and source records.',Icon:Activity},
];
export function ConnectedTools(){return <nav className={styles.grid} aria-label="Explore backend analysis tools">{tools.map(({href,title,copy,Icon})=><Link href={href} key={href}><span className={styles.icon}><Icon size={18}/></span><div><strong>{title}</strong><p>{copy}</p></div><ArrowUpRight size={14}/></Link>)}</nav>;}
