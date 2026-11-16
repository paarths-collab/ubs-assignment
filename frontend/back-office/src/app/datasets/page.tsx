"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, ArrowUpRight, Check, CheckCheck, ChevronRight, CircleAlert, Columns3, Database, FileSpreadsheet, Layers3, LoaderCircle, Plus, Search, ShieldCheck, Table2, Trash2, Upload, X } from "lucide-react";
import { ApiError, api, clearPrivateState, uploadDatasets } from "@/lib/api";
import styles from "./datasets.module.css";

type Column = { id: string; name: string; type: string; missing_count: number; missing_rate: number };
type Dataset = { id: string; display_name: string; version: number; profile: {
  row_count: number; column_count: number; duplicate_row_count: number; columns: Column[]; warnings: string[] } };
type Result = { filename: string; status: string; error?: string };
type Preview = { columns: Column[]; rows: Record<string, string | number | null>[];
  returned_rows: number; total_rows: number; truncated: boolean };

function fileType(name: string) {
  return name.toLowerCase().endsWith(".xlsx") ? "XLSX" : name.toLowerCase().endsWith(".xls") ? "XLS" : "CSV";
}
function hasQualityNotes(item: Dataset) {
  return item.profile.warnings.length > 0 || item.profile.duplicate_row_count > 0 || item.profile.columns.some(column => column.missing_count > 0);
}

export default function Datasets() {
  const router = useRouter();
  const [items, setItems] = useState<Dataset[]>([]);
  const [results, setResults] = useState<Result[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [qualityFilter, setQualityFilter] = useState<"all" | "ready" | "review">("all");
  const [sort, setSort] = useState("recent");
  const [active, setActive] = useState<Dataset | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [inspectTab, setInspectTab] = useState<"preview" | "profile">("preview");
  const fileInput = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const previewRequest = useRef(0);
  const load = useCallback(async () => {
    try { setItems(await api<Dataset[]>("/datasets")); }
    catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        clearPrivateState(); router.replace("/login");
      } else setError(cause instanceof Error ? cause.message : "Your datasets could not be loaded. Try refreshing the page.");
    } finally { setLoading(false); }
  }, [router]);
  useEffect(() => {
    let current = true;
    api<Dataset[]>("/datasets").then(data => { if (current) setItems(data); }).catch(cause => {
      if (!current) return;
      if (cause instanceof ApiError && cause.status === 401) {
        clearPrivateState(); router.replace("/login");
      } else setError(cause instanceof Error ? cause.message : "Your datasets could not be loaded. Try refreshing the page.");
    }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [router]);
  useEffect(() => {
    if (active) dialog.current?.showModal();
    else dialog.current?.close();
  }, [active]);

  async function upload(files: FileList | File[]) {
    const chosen = Array.from(files);
    if (!chosen.length) return;
    if (chosen.length > 10) { setError("Choose at most 10 files per upload."); return; }
    setError(""); setBusy(true);
    setResults(chosen.map(file => ({ filename: file.name, status: "uploading" })));
    try {
      setResults(await uploadDatasets<Result[]>(chosen, () => {
        setResults(chosen.map(file => ({ filename: file.name, status: "processing" })));
      }));
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Upload failed. Try again."); }
    finally { setBusy(false); }
  }
  async function sample(names: string[]) {
    setBusy(true); setError("");
    try {
      const files = await Promise.all(names.map(async name => {
        const response = await fetch(`/sample_data/${name}`);
        if (!response.ok) throw new Error("Included data is unavailable.");
        return new File([await response.blob()], name, { type: "text/csv" });
      }));
      await upload(files);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Data loading failed."); setBusy(false); }
  }
  async function inspect(item: Dataset, tab: "preview" | "profile" = "preview") {
    const request = ++previewRequest.current;
    setActive(item); setPreview(null); setPreviewError(""); setInspectTab(tab);
    try {
      const data = await api<Preview>(`/datasets/${item.id}/preview`);
      if (request === previewRequest.current) setPreview(data);
    } catch (cause) {
      if (request === previewRequest.current) setPreviewError(cause instanceof Error ? cause.message : "Preview could not be loaded.");
    }
  }
  function analyze(item: Dataset) {
    sessionStorage.setItem("selected-datasets", JSON.stringify([item.id]));
    router.push("/analyze");
  }
  async function remove(item: Dataset) {
    if (!window.confirm(`Delete ${item.display_name}? Its stored file and snapshot will be removed.`)) return;
    setDeleting(item.id); setError("");
    try {
      await api(`/datasets/${item.id}`, { method: "DELETE" });
      let selected: unknown = [];
      try { selected = JSON.parse(sessionStorage.getItem("selected-datasets") ?? "[]"); } catch { /* Discard invalid local selections. */ }
      sessionStorage.setItem("selected-datasets", JSON.stringify(Array.isArray(selected) ? selected.filter(id => typeof id === "string" && id !== item.id) : []));
      if (active?.id === item.id) { setActive(null); setPreview(null); }
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Dataset could not be deleted."); }
    finally { setDeleting(null); }
  }
  const totalRows = items.reduce((sum, item) => sum + item.profile.row_count, 0);
  const totalColumns = items.reduce((sum, item) => sum + item.profile.column_count, 0);
  const flagged = items.filter(hasQualityNotes).length;
  const totalCells = items.reduce((sum, item) => sum + item.profile.row_count * item.profile.column_count, 0);
  const missingCells = items.reduce((sum, item) => sum + item.profile.columns.reduce((count, column) => count + column.missing_count, 0), 0);
  const completeness = totalCells ? (1 - missingCells / totalCells) * 100 : null;
  const filtered = items.filter(item => (item.display_name.toLowerCase().includes(search.trim().toLowerCase()) || item.profile.columns.some(column => column.name.toLowerCase().includes(search.trim().toLowerCase()))) && (qualityFilter === "all" || (qualityFilter === "review" ? hasQualityNotes(item) : !hasQualityNotes(item)))).sort((a, b) => sort === "name" ? a.display_name.localeCompare(b.display_name) : sort === "records" ? b.profile.row_count - a.profile.row_count : sort === "quality" ? Number(hasQualityNotes(b)) - Number(hasQualityNotes(a)) : 0);

  return <main id="main" className={styles.page}>
    <div className={styles.breadcrumb}><span>Workspace</span><ChevronRight size={12} /><span>Data library</span></div>
    <header className={styles.heading}>
      <div><h1>Datasets</h1><p>Manage source files, inspect data quality, and select data for analysis.</p></div>
      <button className={styles.primaryButton} onClick={() => fileInput.current?.click()} disabled={busy}><Plus size={15} /> Add dataset</button>
    </header>

    <section className={styles.metrics} aria-label="Dataset overview">
      <div className={styles.metric}><div className={styles.metricTop}><span>Datasets</span><Database size={16} /></div><strong>{loading ? "—" : items.length.toLocaleString()}</strong><div className={styles.metricBottom}>{loading ? "Loading your sources" : "CSV and Excel sources"}</div></div>
      <div className={styles.metric}><div className={styles.metricTop}><span>Total records</span><Layers3 size={16} /></div><strong>{loading ? "—" : totalRows.toLocaleString()}</strong><div className={styles.metricBottom}>Across {items.length} {items.length === 1 ? "dataset" : "datasets"}</div></div>
      <div className={styles.metric}><div className={styles.metricTop}><span>Total columns</span><Columns3 size={16} /></div><strong>{loading ? "—" : totalColumns.toLocaleString()}</strong><div className={styles.metricBottom}>{loading ? "Reading your profiles" : !items.length ? "No stored profiles" : flagged ? `${flagged} ${flagged === 1 ? "source has" : "sources have"} quality notes` : "No quality notes"}</div></div>
      <div className={styles.metric}><div className={styles.metricTop}><span>Data completeness</span><ShieldCheck size={16} /></div><strong>{loading || completeness === null ? "—" : `${completeness.toFixed(completeness === 100 ? 0 : 1)}%`}</strong><div className={styles.metricBottom}>{missingCells.toLocaleString()} missing values across stored profiles</div></div>
    </section>

    {error && <div className={styles.error} role="alert"><CircleAlert size={16} /><span>{error}</span><button aria-label="Dismiss error" onClick={() => setError("")}><X size={14} /></button></div>}
    <div className={styles.libraryLayout}>
      <section className={styles.library} aria-label="Stored datasets">
        <div className={styles.libraryHeading}><div><h2>All datasets <span>{items.length}</span></h2><p>Uploaded files and stored profiles.</p></div><div className={styles.libraryView}><Table2 size={14} /><span>Table view</span></div></div>
        <div className={styles.toolbar}><label className={styles.search}><Search size={15} /><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search sources or fields…" aria-label="Search datasets" /></label><select className={styles.sortSelect} aria-label="Sort datasets" value={sort} onChange={event => setSort(event.target.value)}><option value="recent">Recent first</option><option value="name">Name A–Z</option><option value="records">Most records</option><option value="quality">Quality notes first</option></select></div>
        <div className={styles.qualityFilters} aria-label="Filter datasets by quality">{(["all", "ready", "review"] as const).map(value => <button key={value} aria-pressed={qualityFilter === value} onClick={() => setQualityFilter(value)}>{value === "all" ? "All sources" : value === "ready" ? "Ready to explore" : "Needs review"}<span>{value === "all" ? items.length : value === "ready" ? items.length - flagged : flagged}</span></button>)}</div>
        {loading ? <div className={styles.empty}><LoaderCircle size={24} className={styles.spinner} /><h3>Loading datasets</h3><p>Retrieving your source files and profiles…</p></div> : items.length === 0 ? <div className={styles.empty}><div className={styles.emptyIcon}><Database size={25} /></div><h3>No datasets yet</h3><p>Upload a CSV or Excel file to begin, or load the included dataset.</p><button className={styles.secondaryButton} disabled={busy} onClick={() => void sample(["analysis_flat.csv"])}><Database size={14} /> Load included data <ArrowRight size={14} /></button></div> : filtered.length === 0 ? <div className={styles.empty}><Search size={25} /><h3>No matching datasets</h3><p>Try another quality filter, source name, or field name.</p><button className={styles.secondaryButton} onClick={() => { setSearch(""); setQualityFilter("all"); }}>Reset filters</button></div> : <div className={styles.tableScroll}><table className={styles.datasetTable}><thead><tr><th>Dataset name</th><th>Records</th><th>Columns</th><th>Completeness</th><th>Status</th><th><span className={styles.srOnly}>Actions</span></th></tr></thead><tbody>{filtered.map(item => <tr key={item.id}>
          <td><button className={styles.datasetName} onClick={() => void inspect(item)}><span className={styles.fileIcon}><FileSpreadsheet size={19} /></span><span><strong title={item.display_name}>{item.display_name}</strong><small>{fileType(item.display_name)} <span>·</span> Version {item.version}</small></span></button></td>
          <td className={styles.numberCell}>{item.profile.row_count.toLocaleString()}</td><td className={styles.numberCell}>{item.profile.column_count}</td>
          <td className={styles.numberCell}>{item.profile.row_count * item.profile.column_count ? `${((1 - item.profile.columns.reduce((sum, column) => sum + column.missing_count, 0) / (item.profile.row_count * item.profile.column_count)) * 100).toFixed(1)}%` : "—"}</td>
          <td><span className={hasQualityNotes(item) ? styles.statusNote : styles.statusReady}>{hasQualityNotes(item) ? <CircleAlert size={11} /> : <Check size={11} />}{hasQualityNotes(item) ? "Review" : "Ready"}</span></td>
          <td><div className={styles.rowActions}><button className={styles.analyzeButton} onClick={() => analyze(item)}>Analyze <ArrowUpRight size={13} /></button><button className={styles.iconButton} aria-label={`Inspect ${item.display_name}`} title="Inspect dataset" onClick={() => void inspect(item)}><Table2 size={14} /></button><button className={`${styles.iconButton} ${styles.deleteButton}`} disabled={deleting === item.id} aria-label={`Delete ${item.display_name}`} title="Delete dataset" onClick={() => void remove(item)}>{deleting === item.id ? <LoaderCircle size={14} className={styles.spinner} /> : <Trash2 size={14} />}</button></div></td>
        </tr>)}</tbody></table></div>}
        <div className={styles.libraryFooter}><span>{loading ? "Loading sources…" : `${filtered.length} of ${items.length} datasets`}</span><span><ShieldCheck size={12} /> Only visible to you</span></div>
      </section>
      <aside className={styles.aside}>
        <section className={`${styles.uploadCard} ${dragging ? styles.dragging : ""}`} aria-label="Upload datasets" onDragEnter={event => { event.preventDefault(); if (!busy) setDragging(true); }} onDragOver={event => event.preventDefault()} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }} onDrop={event => { event.preventDefault(); setDragging(false); if (!busy) void upload(event.dataTransfer.files); }}>
          <div className={styles.uploadTop}><span className={styles.uploadIcon}><Upload size={19} /></span></div><h2>Add a dataset</h2><p>Drag and drop files here, or choose files to upload.</p><button className={styles.uploadButton} onClick={() => fileInput.current?.click()} disabled={busy}>{busy ? <LoaderCircle size={15} className={styles.spinner} /> : <Upload size={15} />}{busy ? "Importing data…" : "Choose files"}<Plus size={14} /></button><div className={styles.uploadLimits}>CSV, XLS, XLSX · Up to 10 files<br />64 MiB per file · 256 MiB per batch</div>
        </section>
        <section className={styles.sampleCard}><div className={styles.sampleIcon}><Database size={17} /></div><h3>Included datasets</h3><p>Use synthetic data to explore analysis and multi-file relationships.</p><button disabled={busy} onClick={() => void sample(["analysis_flat.csv"])}>Load analysis data <ArrowRight size={14} /></button><button disabled={busy} onClick={() => void sample(["sales.csv", "customers.csv", "products.csv"])}>Load linked data <ArrowRight size={14} /></button></section>
        <div className={styles.privacyNote}><ShieldCheck size={15} /><span>Sources are private to your account. Deleting a source removes its stored file and snapshot.</span></div>
      </aside>
    </div>
    <section id="source-health" className={styles.healthSection} aria-labelledby="source-health-title"><div className={styles.healthHeading}><div><span>UNDERSTAND THE SOURCE</span><h2 id="source-health-title">Data health, before the first question.</h2><p>Inspect missing values, repeated records, and inferred field types from the complete stored profiles.</p></div>{flagged > 0 && <button onClick={() => { setQualityFilter("review"); document.querySelector('section[aria-label="Stored datasets"]')?.scrollIntoView({ behavior: "auto", block: "start" }); }}>Review {flagged} {flagged === 1 ? "source" : "sources"}<ArrowRight size={13} /></button>}</div>
      {items.length > 0 ? <div className={styles.healthGrid}>{items.slice(0, 6).map(item => { const missing = item.profile.columns.reduce((sum, column) => sum + column.missing_count, 0); const cells = item.profile.row_count * item.profile.column_count; const percent = cells ? (1 - missing / cells) * 100 : null; return <button key={item.id} onClick={() => void inspect(item, "profile")} className={styles.healthCard}><div><FileSpreadsheet size={16} /><strong>{item.display_name}</strong><ArrowUpRight size={13} /></div><span className={styles.completenessTrack}><i style={{ width: `${percent ?? 0}%` }} /></span><div className={styles.healthNumbers}><span><strong>{percent === null ? "—" : `${percent.toFixed(1)}%`}</strong>Complete values</span><span><strong>{missing.toLocaleString()}</strong>Missing cells</span><span><strong>{item.profile.duplicate_row_count.toLocaleString()}</strong>Duplicate rows</span></div><small>{item.profile.columns.length} profiled fields · Open full profile</small></button>; })}</div> : <div className={styles.healthExplainer}>{[{ icon: Columns3, title: "Know your fields", text: "See inferred types and column names before choosing a question." }, { icon: CircleAlert, title: "Spot quality notes", text: "Review missing values, duplicated records, and parsing warnings." }, { icon: ShieldCheck, title: "Preserve the original", text: "Profiles describe the source without silently changing its values." }].map(item => <div key={item.title}><item.icon size={18} /><h3>{item.title}</h3><p>{item.text}</p></div>)}</div>}
    </section>
    <input ref={fileInput} className={styles.srOnly} type="file" accept=".csv,.xls,.xlsx" multiple disabled={busy} aria-label="Choose CSV, XLS, or XLSX files" onChange={event => { const chosen = event.currentTarget.files ? Array.from(event.currentTarget.files) : []; event.currentTarget.value = ""; if (chosen.length) void upload(chosen); }} />
    {results.length > 0 && <section className={styles.uploadStatus} aria-live="polite"><div className={styles.uploadStatusHeading}><h3>Import activity</h3>{!busy && <button className={styles.iconButton} aria-label="Dismiss import activity" onClick={() => setResults([])}><X size={14} /></button>}</div>{results.map((result, index) => <div className={styles.uploadResult} key={`${result.filename}-${index}`}><span className={result.error || result.status === "rejected" ? styles.resultError : styles.resultStatus}>{["uploading", "processing"].includes(result.status) ? <LoaderCircle size={14} className={styles.spinner} /> : result.error || result.status === "rejected" ? <CircleAlert size={14} /> : <CheckCheck size={14} />}</span><strong>{result.filename}</strong><span>{result.status}{result.error ? ` — ${result.error}` : ""}</span></div>)}</section>}

    <dialog ref={dialog} className={styles.dialog} aria-labelledby="dataset-dialog-title" onCancel={() => setActive(null)} onClick={event => { if (event.target === event.currentTarget) setActive(null); }}>
      {active && <><div className={styles.dialogHeader}><div className={styles.dialogTitle}><span className={styles.fileIcon}><FileSpreadsheet size={21} /></span><div><p>Dataset inspector <span>v{active.version}</span></p><h2 id="dataset-dialog-title">{active.display_name}</h2></div></div><button className={styles.iconButton} onClick={() => setActive(null)} aria-label="Close dataset inspector"><X size={19} /></button></div>
        <div className={styles.dialogMetrics}><div><span>Records</span><strong>{active.profile.row_count.toLocaleString()}</strong></div><div><span>Columns</span><strong>{active.profile.column_count}</strong></div><div><span>Duplicate rows</span><strong>{active.profile.duplicate_row_count.toLocaleString()}</strong></div><div><span>Missing values</span><strong>{active.profile.columns.reduce((sum, column) => sum + column.missing_count, 0).toLocaleString()}</strong></div></div>
        {active.profile.warnings.length > 0 && <div className={styles.warnings}>{active.profile.warnings.map(warning => <p key={warning}><CircleAlert size={14} />{warning}</p>)}</div>}
        <div className={styles.inspectTabs} role="tablist" aria-label="Dataset inspection" onKeyDown={event => { if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return; event.preventDefault(); const next = event.key === "Home" ? "preview" : event.key === "End" ? "profile" : inspectTab === "preview" ? "profile" : "preview"; setInspectTab(next); event.currentTarget.querySelector<HTMLButtonElement>(`#dataset-${next}-tab`)?.focus(); }}><button id="dataset-preview-tab" role="tab" tabIndex={inspectTab === "preview" ? 0 : -1} aria-selected={inspectTab === "preview"} aria-controls="dataset-preview-panel" className={inspectTab === "preview" ? styles.activeTab : ""} onClick={() => setInspectTab("preview")}><Table2 size={14} /> Data preview</button><button id="dataset-profile-tab" role="tab" tabIndex={inspectTab === "profile" ? 0 : -1} aria-selected={inspectTab === "profile"} aria-controls="dataset-profile-panel" className={inspectTab === "profile" ? styles.activeTab : ""} onClick={() => setInspectTab("profile")}><Columns3 size={14} /> Column profile <span>{active.profile.column_count}</span></button></div>
        {inspectTab === "preview" ? <div id="dataset-preview-panel" role="tabpanel" aria-labelledby="dataset-preview-tab" className={styles.inspectPanel}>{previewError ? <div className={styles.previewError} role="alert"><CircleAlert size={18} /><p>{previewError}</p><button className={styles.secondaryButton} onClick={() => void inspect(active)}>Retry preview</button></div> : preview ? <><div className={styles.previewMeta}><span>{preview.returned_rows.toLocaleString()} of {preview.total_rows.toLocaleString()} records shown</span>{preview.truncated && <span>Preview limited</span>}</div><div className={styles.previewScroll} tabIndex={0} aria-label="Dataset preview, scroll to explore columns"><table className={styles.previewTable}><thead><tr><th className={styles.rowNumber}>#</th>{preview.columns.map(column => <th key={column.id}>{column.name}<span>{column.type}</span></th>)}</tr></thead><tbody>{preview.rows.map((row, index) => <tr key={index}><td className={styles.rowNumber}>{index + 1}</td>{preview.columns.map(column => <td key={column.id}>{row[column.id] === null ? <span className={styles.nullValue}>null</span> : String(row[column.id])}</td>)}</tr>)}</tbody></table></div></> : <div className={styles.previewLoading}><LoaderCircle size={22} className={styles.spinner} /><span>Loading data preview…</span></div>}</div> : <div id="dataset-profile-panel" role="tabpanel" aria-labelledby="dataset-profile-tab" className={styles.inspectPanel}><div className={styles.previewMeta}><span>Inferred types and data quality from your stored profile</span></div><div className={styles.previewScroll} tabIndex={0} aria-label="Column profile"><table className={styles.profileTable}><thead><tr><th>Column name</th><th>Data type</th><th>Missing values</th><th>Missing rate</th></tr></thead><tbody>{active.profile.columns.map(column => <tr key={column.id}><td>{column.name}</td><td><span className={styles.typeTag}>{column.type}</span></td><td>{column.missing_count.toLocaleString()}</td><td><div className={styles.missingRate}><span>{(column.missing_rate * 100).toFixed(1)}%</span><span className={styles.rateTrack}><i style={{ width: `${Math.min(100, Math.max(0, column.missing_rate * 100))}%` }} /></span></div></td></tr>)}</tbody></table></div></div>}
        <div className={styles.dialogFooter}><span><ShieldCheck size={13} /> Original data is preserved</span><button className={styles.primaryButton} onClick={() => analyze(active)}>Analyze this dataset <ArrowUpRight size={14} /></button></div></>}
    </dialog>
  </main>;
}
