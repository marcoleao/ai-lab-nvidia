'use client';
import Link from 'next/link';
import {BookOpen} from 'lucide-react';

export default function HelpNavigation({active=false,onNavigate}:{active?:boolean;onNavigate?:()=>void}){
 return <nav className="help-navigation" aria-label="Ajuda"><Link href="/help" className={active?'selected':undefined} aria-current={active?'page':undefined} onClick={onNavigate}><BookOpen size={19} aria-hidden="true"/><span>HELP — Guia do SDLC</span></Link></nav>;
}
