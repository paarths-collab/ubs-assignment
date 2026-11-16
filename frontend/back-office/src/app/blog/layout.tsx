import { DocsSidebar } from "./docs-sidebar";
import styles from "./blog.module.css";

export default function GuidesLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className={styles.page}><div className={styles.docsGrid}><DocsSidebar />{children}</div></div>;
}
