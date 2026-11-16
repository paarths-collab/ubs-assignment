import { PublicHeader } from "@/components/public-header";
import { HomeActions } from "@/components/home-actions";
import { DocsSidebar } from "./docs-sidebar";
import styles from "./blog.module.css";

export default function GuidesLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className={styles.page}><PublicHeader /><div className={styles.docsGrid}><DocsSidebar />{children}</div><HomeActions /></div>;
}
