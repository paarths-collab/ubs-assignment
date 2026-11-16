import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, ArrowUpRight, BookOpen, Clock3 } from "lucide-react";
import { guides } from "../docs-content";
import styles from "../blog.module.css";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() { return guides.map(guide => ({ slug: guide.slug })); }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const guide = guides.find(item => item.slug === slug);
  return guide ? { title: `${guide.title} · DataLens Guides`, description: guide.description } : {};
}

export default async function GuideArticle({ params }: Props) {
  const { slug } = await params;
  const index = guides.findIndex(item => item.slug === slug);
  if (index < 0) notFound();
  const guide = guides[index];
  return <main id="main" className={styles.main}>
    <nav className={styles.breadcrumb} aria-label="Breadcrumb"><Link href="/">Home</Link><span>/</span><Link href="/blog">Guides</Link><span>/</span><span aria-current="page">{guide.title}</span></nav>
    <div className={styles.articleLayout}>
      <article className={styles.articleBody}>
        <div className={styles.articleEyebrow}><BookOpen size={14} />{guide.category}<span>·</span><Clock3 size={13} />{guide.readingTime} read</div>
        <h1>{guide.title}</h1><p className={styles.articleLede}>{guide.description}</p>
        <div className={styles.articleRule} />
        {guide.sections.map(section => <section id={section.id} key={section.id} className={styles.articleSection}><h2>{section.title}</h2>{section.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}{section.points && <ul>{section.points.map(point => <li key={point}>{point}</li>)}</ul>}</section>)}
        <div className={styles.articleAction}><span>PUT IT INTO PRACTICE</span><p>Continue in your workspace with the source and result close together.</p><Link href={guide.action.href}>{guide.action.label}<ArrowUpRight size={15} /></Link></div>
        <nav className={styles.articlePager} aria-label="Guide navigation">{index > 0 ? <Link href={`/blog/${guides[index - 1].slug}`}><ArrowLeft size={17}/><span><small>Previous</small>{guides[index - 1].title}</span></Link> : <span />}{index < guides.length - 1 ? <Link href={`/blog/${guides[index + 1].slug}`}><span><small>Next</small>{guides[index + 1].title}</span><ArrowRight size={17}/></Link> : <span />}</nav>
      </article>
      <aside className={styles.toc} aria-label="On this page"><span>ON THIS PAGE</span><nav>{guide.sections.map(section => <a href={`#${section.id}`} key={section.id}>{section.title}</a>)}</nav><Link href="/blog">All guides<ArrowRight size={13}/></Link></aside>
    </div>
  </main>;
}
