import Link from "next/link";
import styles from "@/components/global-navigation.module.css";

export default function NotFound() {
  return <main id="main" className={styles.notFound}><span>404 · PAGE NOT FOUND</span><h1>This page is not available.</h1><p>Use the DataLens navigation to explore your data, or return to the homepage.</p><div><Link href="/">Back to home</Link><Link href="/workspace/overview">Open workspace</Link></div></main>;
}
