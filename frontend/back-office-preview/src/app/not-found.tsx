import Link from "next/link";
import { PublicHeader } from "@/components/public-header";

export default function NotFound() {
  return <main id="main" style={{minHeight:"100vh",background:"var(--background)",color:"var(--foreground)"}}><PublicHeader /><section style={{maxWidth:780,margin:"12vh auto",padding:"2rem",textAlign:"center"}}><p>FRONTEND PREVIEW</p><h1 style={{fontSize:"clamp(3rem,8vw,5rem)"}}>This page is not in the preview.</h1><p>Explore the interactive dashboard, local chat, and guides on the homepage.</p><Link href="/">Back to homepage →</Link></section></main>;
}
