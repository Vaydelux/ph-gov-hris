import { DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { BarChart3, Briefcase, CalendarPlus, ChevronRight, FileText, MessageSquare, Plus, Star, Users, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import api from "../lib/api";
import { cn, fmtDateMed, fmtDateTime } from "../lib/core";
import type { CandidateStatus } from "../lib/contracts";
import { useApi, useApp } from "../state/store";
import { Button, Card, Drawer, Field, InfoNote, Input, Modal, PageHeader, SectionLabel, Select, StatusChip, Tag, Textarea } from "../components/ui";

type KanbanCard = Awaited<ReturnType<typeof api.kanban>>[number];
const COLUMNS: CandidateStatus[] = ["NEW", "UNDER_REVIEW", "SHORTLISTED", "INTERVIEW_SCHEDULED", "INTERVIEWED", "FOR_FINAL_REVIEW", "HIRED"];
const COLUMN_HINT: Record<string, string> = { NEW: "Fresh applications", UNDER_REVIEW: "Screening", SHORTLISTED: "Qualified", INTERVIEW_SCHEDULED: "Interview set", INTERVIEWED: "Post-interview", FOR_FINAL_REVIEW: "Decision", HIRED: "Appointed" };

export function RecruitmentPage() {
  const { toast } = useApp();
  const [jobId, setJobId] = useState("");
  const [active, setActive] = useState<KanbanCard | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [postOpen, setPostOpen] = useState(false);
  const jobs = useApi(() => api.internalJobs(), []);
  const kb = useApi(() => api.kanban(jobId || undefined), [jobId]);
  const analytics = useApi(() => api.recruitmentAnalytics(), []);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const byCol = useMemo(() => {
    const m = new Map<string, KanbanCard[]>();
    COLUMNS.forEach((c) => m.set(c, []));
    (kb.data ?? []).forEach((a) => { if (m.has(a.status)) m.get(a.status)!.push(a); });
    return m;
  }, [kb.data]);

  const onDragStart = (e: DragStartEvent) => setActive((kb.data ?? []).find((a) => a.id === e.active.id) ?? null);
  const onDragEnd = async (e: DragEndEvent) => {
    setActive(null);
    const to = e.over?.id as CandidateStatus | undefined;
    const app = (kb.data ?? []).find((a) => a.id === e.active.id);
    if (!to || !app || app.status === to) return;
    try {
      await api.moveApplication(app.id, to);
      toast(`Moved to ${to.replace(/_/g, " ")}`, "success", `${app.applicant.fullName} · ${app.job.title}`);
      kb.reload(); analytics.reload();
    } catch (err) { toast(err instanceof Error ? err.message : "Move failed", "error"); }
  };
  return (
    <div>
      <PageHeader title="Recruitment" sub="Public postings flow into this pipeline. Match scores are decision-support — every stage is a human decision."
        actions={<Button icon={Plus} onClick={() => setPostOpen(true)}>Post new job</Button>} />

      <div className="stagger mb-4 grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <Card className="!p-4"><div className="flex items-center gap-3"><span className="rounded-md bg-royal-50 p-2.5 text-royal-600"><Briefcase size={18} /></span><div><div className="font-display text-[22px] font-extrabold text-navy-900">{(jobs.data ?? []).filter((j) => j.status === "OPEN").length}</div><div className="text-[11px] font-bold uppercase tracking-wide text-ink-400">Active job listings</div></div></div></Card>
        <Card className="!p-4"><div className="flex items-center gap-3"><span className="rounded-md bg-gold-50 p-2.5 text-gold-600"><Users size={18} /></span><div><div className="font-display text-[22px] font-extrabold text-navy-900">{analytics.data?.total ?? 0}</div><div className="text-[11px] font-bold uppercase tracking-wide text-ink-400">Total applications</div></div></div></Card>
        <Card className="!p-4"><div className="flex items-center gap-3"><span className="rounded-md bg-emerald-50 p-2.5 text-emerald-600"><Star size={18} /></span><div><div className="font-display text-[22px] font-extrabold text-navy-900">{(analytics.data?.byStatus ?? []).find((s) => s.status === "SHORTLISTED")?.count ?? 0}</div><div className="text-[11px] font-bold uppercase tracking-wide text-ink-400">Shortlisted</div></div></div></Card>
        <Card className="!p-4"><div className="flex items-center gap-3"><span className="rounded-md bg-navy-900/8 p-2.5 text-navy-800"><BarChart3 size={18} /></span><div><div className="font-display text-[22px] font-extrabold text-navy-900">{(analytics.data?.byStatus ?? []).find((s) => s.status === "HIRED")?.count ?? 0}</div><div className="text-[11px] font-bold uppercase tracking-wide text-ink-400">Hired</div></div></div></Card>
      </div>

      <Card pad={false} className="anim-fade-up mb-4">
        <div className="flex flex-wrap items-center gap-2.5 border-b border-ink-100 px-4 py-3">
          <h3 className="font-display text-[15px] font-bold text-navy-900">Job listings</h3>
          <Select value={jobId} onChange={(e) => setJobId(e.target.value)} className="ml-auto w-72">
            <option value="">All positions</option>
            {(jobs.data ?? []).map((j) => <option key={j.id} value={j.id}>{j.title} — {j.applicantCount} applicant(s)</option>)}
          </Select>
        </div>
        <div className="grid gap-2.5 p-4 sm:grid-cols-2 xl:grid-cols-4">
          {(jobs.data ?? []).map((j) => (
            <div key={j.id} className="rounded-lg border border-ink-200/70 bg-ink-50/40 p-3.5 transition-all hover:border-royal-300 hover:bg-royal-50/40">
              <div className="flex items-center justify-between"><Tag tone="gold">SG {j.salaryGrade}</Tag><StatusChip status={j.status} /></div>
              <div className="font-display mt-2 text-[14px] font-bold leading-snug text-navy-900">{j.title}</div>
              <div className="mt-0.5 text-[11.5px] text-ink-400">{j.department}</div>
              <div className="mt-2 flex items-center justify-between border-t border-ink-100 pt-2 text-[11.5px]">
                <span className="text-ink-400">Deadline {fmtDateMed(j.deadline)}</span>
                <span className="font-bold text-royal-600">{j.applicantCount} applied</span>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="anim-fade-up mb-4">
        <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
          <div className="flex gap-3 overflow-x-auto pb-3">
            {COLUMNS.map((col) => (
              <PipelineColumn key={col} col={col} cards={byCol.get(col) ?? []} onOpen={setDetailId} />
            ))}
          </div>
          <DragOverlay>{active && <CardShell card={active} overlay />}</DragOverlay>
        </DndContext>
      </div>

      <Card pad={false} className="anim-fade-up">
        <div className="border-b border-ink-100 px-4 py-3"><h3 className="font-display text-[15px] font-bold text-navy-900">Applications per position</h3></div>
        <div className="p-4">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={(analytics.data?.byJob ?? []).map((j) => ({ ...j, title: j.title.length > 22 ? `${j.title.slice(0, 22)}…` : j.title }))} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e7ebf3" vertical={false} />
              <XAxis dataKey="title" tick={{ fontSize: 10, fill: "#7c8aa0" }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 10.5, fill: "#7c8aa0" }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #d4dbe7", fontSize: 12 }} />
              <Bar dataKey="count" name="Applications" fill="#0058be" radius={[4, 4, 0, 0]} barSize={26} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {detailId && <CandidateDrawer id={detailId} onClose={() => { setDetailId(null); kb.reload(); }} />}
      {postOpen && <PostJobModal onClose={() => setPostOpen(false)} onDone={() => { setPostOpen(false); jobs.reload(); }} />}
    </div>
  );
}
function PipelineColumn({ col, cards, onOpen }: { col: CandidateStatus; cards: KanbanCard[]; onOpen: (id: string) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: col });
  return (
    <div ref={setNodeRef} className={cn("flex w-[248px] shrink-0 flex-col rounded-lg border bg-ink-50/60 transition-colors", isOver ? "border-royal-400 bg-royal-50/70" : "border-ink-200/70")}>
      <div className="flex items-center justify-between border-b border-ink-200/60 px-3 py-2.5">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-navy-900">{col.replace(/_/g, " ")}</div>
          <div className="text-[10px] text-ink-400">{COLUMN_HINT[col]}</div>
        </div>
        <span className="rounded-full bg-navy-900 px-2 py-0.5 text-[11px] font-bold text-white">{cards.length}</span>
      </div>
      <div className="min-h-40 flex-1 space-y-2 p-2">
        {cards.map((c) => <DraggableCard key={c.id} card={c} onOpen={onOpen} />)}
        {cards.length === 0 && <div className="rounded-md border border-dashed border-ink-200 px-2 py-6 text-center text-[11px] text-ink-300">Drop candidates here</div>}
      </div>
    </div>
  );
}
function DraggableCard({ card, onOpen }: { card: KanbanCard; onOpen: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: card.id });
  return (
    <div ref={setNodeRef} {...listeners} {...attributes}
      className={cn("cursor-grab touch-none active:cursor-grabbing", isDragging && "opacity-40")}>
      <CardShell card={card} onOpen={onOpen} />
    </div>
  );
}
function CardShell({ card, onOpen, overlay }: { card: KanbanCard; onOpen?: (id: string) => void; overlay?: boolean }) {
  return (
    <button onClick={() => onOpen?.(card.id)} className={cn("w-full rounded-md border border-ink-200/80 bg-white p-3 text-left shadow-card transition-all hover:-translate-y-0.5 hover:border-royal-300 hover:shadow-lift", overlay && "rotate-2 shadow-deep")}>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[13px] font-bold text-navy-900">{card.applicant.fullName}</span>
        <span className={cn("tabular shrink-0 rounded-full px-1.5 py-0.5 text-[10.5px] font-bold", card.matchScore >= 75 ? "bg-emerald-50 text-emerald-700" : card.matchScore >= 50 ? "bg-royal-50 text-royal-700" : "bg-ink-100 text-ink-500")}>{card.matchScore}%</span>
      </div>
      <div className="mt-0.5 truncate text-[11.5px] text-ink-400">{card.job.title} · SG {card.job.salaryGrade}</div>
      <div className="mt-2 flex items-center justify-between">
        <span className="flex gap-1">{card.tags.slice(0, 2).map((t) => <Tag key={t} tone="gold">{t}</Tag>)}</span>
        {card.interview && <span className="flex items-center gap-1 text-[10.5px] font-bold text-royal-600"><CalendarPlus size={11} />{fmtDateMed(card.interview.scheduledAt.slice(0, 10))}</span>}
      </div>
    </button>
  );
}

/* ================= candidate drawer ================= */
function CandidateDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const { toast } = useApp();
  const r = useApi(() => api.applicationDetail(id), [id]);
  const [rating, setRating] = useState(4);
  const [note, setNote] = useState("");
  const [iv, setIv] = useState({ scheduledAt: "", mode: "ONSITE" as "ONSITE" | "ONLINE", location: "", participants: "" });
  const nextStatus: Partial<Record<CandidateStatus, CandidateStatus>> = {
    NEW: "UNDER_REVIEW", UNDER_REVIEW: "SHORTLISTED", SHORTLISTED: "INTERVIEW_SCHEDULED",
    INTERVIEW_SCHEDULED: "INTERVIEWED", INTERVIEWED: "FOR_FINAL_REVIEW", FOR_FINAL_REVIEW: "HIRED",
  };
  const terminal = ["HIRED", "REJECTED", "WITHDRAWN"];
  if (!r.data) return null;
  const { app, evaluations, interview } = r.data;
  const advance = async () => {
    const to = nextStatus[app.status];
    if (!to) return;
    try { await api.moveApplication(id, to); toast(`Advanced to ${to.replace(/_/g, " ")}`, "success"); r.reload(); }
    catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); }
  };
  return (
    <Drawer open onClose={onClose} title={<span className="flex items-center gap-2">{app.applicant.fullName} <StatusChip status={app.status} /></span>} width="max-w-2xl">
      <div className="space-y-4 p-5">
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-display text-[16px] font-bold text-navy-900">{app.job.title}</div>
              <div className="text-[12.5px] text-ink-400">{app.job.department} · SG {app.job.salaryGrade} · applied {fmtDateMed(app.appliedAt.slice(0, 10))}</div>
            </div>
            <div className="text-right">
              <div className="text-[10.5px] font-bold uppercase tracking-wide text-ink-400">Match score</div>
              <div className={cn("font-display text-[22px] font-extrabold", app.matchScore >= 75 ? "text-emerald-600" : app.matchScore >= 50 ? "text-royal-600" : "text-ink-500")}>{app.matchScore}<span className="text-[12px] text-ink-400">/100</span></div>
            </div>
          </div>
          <InfoNote>Match score is <b>decision-support only</b> — keyword overlap with the qualification standards. A human reviewer decides every stage.</InfoNote>
        </Card>

        <div className="flex flex-wrap gap-2">
          {nextStatus[app.status] != null && <Button icon={ChevronRight} onClick={advance}>Advance to {(nextStatus[app.status] as CandidateStatus).replace(/_/g, " ")}</Button>}
          {["SHORTLISTED", "UNDER_REVIEW"].includes(app.status) && (
            <Button variant="subtle" icon={CalendarPlus} onClick={async () => {
              if (!iv.scheduledAt) { toast("Pick a date & time", "error"); return; }
              try { await api.scheduleInterview(id, { scheduledAt: iv.scheduledAt, mode: iv.mode, location: iv.location || undefined, participants: iv.participants.split(",").map((x) => x.trim()).filter(Boolean) }); toast("Interview scheduled", "success"); r.reload(); }
              catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); }
            }}>Schedule interview</Button>
          )}
          {!terminal.includes(app.status) && <Button variant="outline" icon={X} onClick={async () => { try { await api.moveApplication(id, "REJECTED", "Did not meet qualification standards"); toast("Candidate rejected", "info"); r.reload(); } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); } }}>Reject</Button>}
        </div>

        {["SHORTLISTED", "UNDER_REVIEW", "INTERVIEW_SCHEDULED"].includes(app.status) && (
          <Card>
            <SectionLabel>Schedule interview</SectionLabel>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Date & time" required><Input type="datetime-local" value={iv.scheduledAt} onChange={(e) => setIv({ ...iv, scheduledAt: e.target.value })} /></Field>
              <Field label="Mode"><Select value={iv.mode} onChange={(e) => setIv({ ...iv, mode: e.target.value as "ONSITE" | "ONLINE" })}><option value="ONSITE">On-site</option><option value="ONLINE">Online</option></Select></Field>
              <Field label="Location / link"><Input value={iv.location} onChange={(e) => setIv({ ...iv, location: e.target.value })} placeholder="HRMO Conference Room" /></Field>
              <Field label="Panel (comma-separated)"><Input value={iv.participants} onChange={(e) => setIv({ ...iv, participants: e.target.value })} placeholder="HRMO Chief, Division Chief" /></Field>
            </div>
            {interview && <p className="mt-3 rounded-md bg-royal-50 px-3 py-2 text-[12px] font-semibold text-royal-800">Interview set: {fmtDateTime(interview.scheduledAt)} · {interview.mode}{interview.location ? ` · ${interview.location}` : ""}</p>}
          </Card>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <SectionLabel>Qualification screening</SectionLabel>
            <div className="space-y-1.5">
              {app.job.qualifications.map((q) => {
                const hit = app.resumeText.toLowerCase().includes(q.split(" ").slice(0, 2).join(" ").toLowerCase().slice(0, 12));
                return (
                  <div key={q} className="flex items-start gap-2 rounded-md border border-ink-100 px-2.5 py-2 text-[12px]">
                    <span className={cn("mt-0.5 size-2 shrink-0 rounded-full", hit ? "bg-emerald-500" : "bg-ink-200")} />
                    <span className="text-ink-600">{q}</span>
                  </div>
                );
              })}
            </div>
          </Card>
          <Card>
            <SectionLabel>Documents & resume</SectionLabel>
            <div className="space-y-2 text-[12.5px]">
              <div className="flex items-center justify-between rounded-md border border-ink-100 px-3 py-2">
                <span className="flex items-center gap-2 font-semibold text-navy-900"><FileText size={14} className="text-royal-600" />{app.docName}</span>
                <Tag tone="navy">private storage</Tag>
              </div>
              <div className="rounded-md bg-ink-50/70 p-3 text-[12px] leading-relaxed text-ink-600">
                <span className="font-bold text-navy-900">Resume highlights:</span> {app.resumeText}
              </div>
              <p className="text-[10.5px] text-ink-400">In production, files live in a private Supabase Storage bucket and are served via expiring signed URLs authorized by the API.</p>
            </div>
          </Card>
        </div>

        <Card>
          <SectionLabel><span className="flex items-center gap-1.5"><MessageSquare size={13} /> Recruiter evaluations</span></SectionLabel>
          <div className="space-y-2">
            {evaluations.map((ev) => (
              <div key={ev.id} className="rounded-md border border-ink-100 px-3 py-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[12.5px] font-bold text-navy-900">{ev.authorName}</span>
                  <span className="flex gap-0.5">{Array.from({ length: 5 }, (_, i) => <Star key={i} size={12} className={i < ev.rating ? "fill-gold-500 text-gold-500" : "text-ink-200"} />)}</span>
                </div>
                <p className="mt-1 text-[12px] text-ink-500">{ev.note}</p>
              </div>
            ))}
            {evaluations.length === 0 && <p className="text-[12.5px] text-ink-400">No evaluations yet.</p>}
          </div>
          <div className="mt-3 border-t border-ink-100 pt-3">
            <div className="flex flex-wrap items-end gap-2">
              <Field label="Rating"><Select value={String(rating)} onChange={(e) => setRating(Number(e.target.value))} className="w-28">{[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} star{n > 1 ? "s" : ""}</option>)}</Select></Field>
              <div className="min-w-48 flex-1"><Field label="Note"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Screening observation…" /></Field></div>
              <Button onClick={async () => {
                if (note.trim().length < 5) { toast("Add a note", "error"); return; }
                try { await api.addEvaluation(id, rating, note); setNote(""); toast("Evaluation added", "success"); r.reload(); } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); }
              }}>Add</Button>
            </div>
          </div>
        </Card>

        <Card>
          <SectionLabel>Status history</SectionLabel>
          <div className="space-y-0">
            {app.history.map((h, i) => (
              <div key={i} className="relative flex gap-3 pb-4 last:pb-0">
                {i < app.history.length - 1 && <span className="absolute left-[5px] top-4 h-full w-px bg-ink-200" />}
                <span className={cn("mt-1.5 size-[11px] shrink-0 rounded-full ring-2 ring-white", h.status === "REJECTED" ? "bg-red-500" : h.status === "HIRED" ? "bg-emerald-500" : "bg-royal-500")} />
                <div>
                  <div className="text-[12.5px] font-bold text-navy-900">{h.status.replace(/_/g, " ")}</div>
                  <div className="text-[11px] text-ink-400">{h.by} · {fmtDateTime(h.at)}{h.note ? ` — ${h.note}` : ""}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </Drawer>
  );
}

/* ================= post job ================= */
function PostJobModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { toast } = useApp();
  const org = useApi(() => api.orgOverview(), []);
  const [f, setF] = useState({ title: "", departmentId: "", salaryGrade: 11, summary: "", qualifications: "", keywords: "", deadline: "", openings: 1 });
  const [busy, setBusy] = useState(false);
  return (
    <Modal open onClose={onClose} title="Post new job" width="max-w-lg"
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={async () => {
        if (!f.title || !f.departmentId || !f.deadline) { toast("Complete required fields", "error"); return; }
        setBusy(true);
        try {
          await api.createJob({
            title: f.title, departmentId: f.departmentId, positionTitle: f.title, salaryGrade: Number(f.salaryGrade),
            summary: f.summary || `The department is accepting applications for ${f.title}.`, qualifications: f.qualifications.split("\n").filter(Boolean),
            keywords: f.keywords.split(",").map((k) => k.trim()).filter(Boolean), deadline: f.deadline, openings: Number(f.openings) || 1,
          });
          toast("Job posted", "success", "Now live on the public careers page.");
          onDone();
        } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); } finally { setBusy(false); }
      }}>Publish posting</Button></>}>
      <div className="space-y-4">
        <Field label="Position title" required><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Administrative Officer II" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Division" required>
            <Select value={f.departmentId} onChange={(e) => setF({ ...f, departmentId: e.target.value })}>
              <option value="">Select…</option>
              {(org.data?.departments ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
          </Field>
          <Field label="Salary grade" required><Select value={String(f.salaryGrade)} onChange={(e) => setF({ ...f, salaryGrade: Number(e.target.value) })}>{Array.from({ length: 33 }, (_, i) => <option key={i + 1} value={i + 1}>SG {i + 1}</option>)}</Select></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Application deadline" required><Input type="date" value={f.deadline} onChange={(e) => setF({ ...f, deadline: e.target.value })} /></Field>
          <Field label="Openings"><Input type="number" min={1} value={String(f.openings)} onChange={(e) => setF({ ...f, openings: Number(e.target.value) })} /></Field>
        </div>
        <Field label="Qualification standards (one per line)"><Textarea value={f.qualifications} onChange={(e) => setF({ ...f, qualifications: e.target.value })} placeholder={"Civil Service Professional eligibility\n2 years related experience"} /></Field>
        <Field label="Keywords (comma-separated)" hint="Used by the decision-support matcher."><Input value={f.keywords} onChange={(e) => setF({ ...f, keywords: e.target.value })} placeholder="excel, sql, records management" /></Field>
        <Field label="Summary"><Textarea value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} placeholder="Brief posting summary…" /></Field>
      </div>
    </Modal>
  );
}
