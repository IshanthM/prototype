import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock3,
  Factory,
  FileUp,
  Gauge,
  Mail,
  Rocket,
  Send,
  Wrench,
} from "lucide-react";

type Process = "fdm_3d_printing" | "cnc_machining" | "laser_cut_sheet";
type Severity = "blocker" | "warning" | "info";
type FindingStatus = "open" | "fixed" | "accepted";

type Project = {
  id: string;
  name: string;
  team_name: string;
  baseline_iteration_days: number;
};

type Geometry = {
  file_format: "stl" | "step";
  units: string;
  dimensions_mm: Record<string, number>;
  triangle_count?: number | null;
  feature_signals: string[];
  limitations: string[];
};

type Finding = {
  id: string;
  code: string;
  title: string;
  severity: Severity;
  status: FindingStatus;
  description: string;
  suggested_fix: string;
  evidence: string;
  affected_processes: Process[];
};

type Part = {
  id: string;
  project_id: string;
  part_name: string;
  revision: string;
  original_filename: string;
  sha256: string;
  uploaded_at: string;
  geometry: Geometry;
  findings: Finding[];
  recommendation: {
    primary_process: Process;
    scores: Record<string, number>;
    rationale: string[];
    rough_cost_band: string;
    lead_time_days: string;
    limitations: string[];
  };
};

type Supplier = {
  id: string;
  name: string;
  contact: string;
  location: string;
  processes: Process[];
  typical_turnaround_days: string;
  rate_notes: string;
  notes: string;
};

type Metrics = {
  revision_count: number;
  average_hours_between_uploads?: number | null;
  baseline_iteration_days: number;
  estimated_days_saved?: number | null;
  open_finding_count: number;
  quote_request_count: number;
};

type QuoteRequest = {
  id: string;
  message: string;
};

const API = "/api";

const processLabels: Record<Process, string> = {
  fdm_3d_printing: "FDM print",
  cnc_machining: "CNC machine",
  laser_cut_sheet: "Laser cut",
};

export function App() {
  const [view, setView] = useState<"landing" | "dashboard">("landing");
  const [projects, setProjects] = useState<Project[]>([]);
  const [parts, setParts] = useState<Part[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [matchedSuppliers, setMatchedSuppliers] = useState<Supplier[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedPartId, setSelectedPartId] = useState("");
  const [quote, setQuote] = useState<QuoteRequest | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [projectForm, setProjectForm] = useState({ name: "Centerstage drivetrain", team_name: "FTC 9999", baseline_iteration_days: 14 });
  const [uploadForm, setUploadForm] = useState({ part_name: "Thin mounting plate", revision: "A" });
  const [file, setFile] = useState<File | null>(null);
  const [waitlist, setWaitlist] = useState({ email: "", team_name: "", notes: "" });

  const selectedProject = useMemo(() => projects.find((project) => project.id === selectedProjectId) ?? projects[0], [projects, selectedProjectId]);
  const selectedPart = useMemo(() => parts.find((part) => part.id === selectedPartId) ?? parts[parts.length - 1], [parts, selectedPartId]);

  useEffect(() => {
    void refreshProjects();
    void loadSuppliers();
  }, []);

  useEffect(() => {
    if (selectedProject) void refreshProjectData(selectedProject.id);
  }, [selectedProject?.id]);

  useEffect(() => {
    if (selectedPart) void loadMatchedSuppliers(selectedPart.id);
  }, [selectedPart?.id]);

  async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`${API}${path}`, options);
      if (!response.ok) throw new Error(await response.text());
      return (await response.json()) as T;
    } finally {
      setBusy(false);
    }
  }

  async function refreshProjects() {
    const data = await request<Project[]>("/projects");
    setProjects(data);
    if (!selectedProjectId && data[0]) setSelectedProjectId(data[0].id);
  }

  async function loadSuppliers() {
    setSuppliers(await request<Supplier[]>("/suppliers"));
  }

  async function refreshProjectData(projectId: string) {
    const [nextParts, nextMetrics] = await Promise.all([
      request<Part[]>(`/projects/${projectId}/parts`),
      request<Metrics>(`/projects/${projectId}/metrics`),
    ]);
    setParts(nextParts);
    setMetrics(nextMetrics);
    if (nextParts.length && !selectedPartId) setSelectedPartId(nextParts[nextParts.length - 1].id);
  }

  async function loadMatchedSuppliers(partId: string) {
    setMatchedSuppliers(await request<Supplier[]>(`/parts/${partId}/suppliers`));
  }

  async function createProject(event: FormEvent) {
    event.preventDefault();
    const project = await request<Project>("/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(projectForm),
    });
    setProjects((current) => [...current, project]);
    setSelectedProjectId(project.id);
    setView("dashboard");
    setMessage("Project created.");
  }

  async function uploadPart(event: FormEvent) {
    event.preventDefault();
    if (!selectedProject || !file) return;
    const body = new FormData();
    body.append("part_name", uploadForm.part_name);
    body.append("revision", uploadForm.revision);
    body.append("file", file);
    const part = await request<Part>(`/projects/${selectedProject.id}/parts`, { method: "POST", body });
    setParts((current) => [...current, part]);
    setSelectedPartId(part.id);
    await refreshProjectData(selectedProject.id);
    setMessage("Part uploaded and checked.");
  }

  async function updateFinding(finding: Finding, status: FindingStatus) {
    if (!selectedPart) return;
    const updated = await request<Part>(`/parts/${selectedPart.id}/findings/${finding.id}?status=${status}`, { method: "PATCH" });
    setParts((current) => current.map((part) => (part.id === updated.id ? updated : part)));
    setMessage(`Finding marked ${status}.`);
  }

  async function generateQuote(supplier: Supplier) {
    if (!selectedPart) return;
    const generated = await request<QuoteRequest>(`/parts/${selectedPart.id}/quote-request/${supplier.id}`, { method: "POST" });
    setQuote(generated);
    if (selectedProject) await refreshProjectData(selectedProject.id);
  }

  async function submitWaitlist(event: FormEvent) {
    event.preventDefault();
    await request("/waitlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(waitlist),
    });
    setMessage("Waitlist signup captured.");
    setWaitlist({ email: "", team_name: "", notes: "" });
  }

  function onProjectChange(event: ChangeEvent<HTMLInputElement>) {
    const { name, value } = event.currentTarget;
    setProjectForm((current) => ({ ...current, [name]: name === "baseline_iteration_days" ? Number(value) : value }));
  }

  function useSampleStl() {
    const sample = `solid thin_mount_plate
facet normal 0 0 1
outer loop
vertex 0 0 0
vertex 180 0 0
vertex 180 80 0
endloop
endfacet
facet normal 0 0 1
outer loop
vertex 0 0 0
vertex 180 80 0
vertex 0 80 2
endloop
endfacet
endsolid thin_mount_plate`;
    setFile(new File([sample], "thin_mount_plate_hole.stl", { type: "model/stl" }));
  }

  return view === "landing" ? (
    <Landing
      busy={busy}
      message={message}
      waitlist={waitlist}
      setWaitlist={setWaitlist}
      submitWaitlist={submitWaitlist}
      openDashboard={() => setView("dashboard")}
    />
  ) : (
    <Dashboard
      busy={busy}
      message={message}
      projects={projects}
      selectedProject={selectedProject}
      selectedProjectId={selectedProjectId}
      setSelectedProjectId={setSelectedProjectId}
      projectForm={projectForm}
      onProjectChange={onProjectChange}
      createProject={createProject}
      uploadForm={uploadForm}
      setUploadForm={setUploadForm}
      file={file}
      setFile={setFile}
      useSampleStl={useSampleStl}
      uploadPart={uploadPart}
      parts={parts}
      selectedPart={selectedPart}
      setSelectedPartId={setSelectedPartId}
      metrics={metrics}
      suppliers={suppliers}
      matchedSuppliers={matchedSuppliers}
      quote={quote}
      updateFinding={updateFinding}
      generateQuote={generateQuote}
      openLanding={() => setView("landing")}
    />
  );
}

function Landing(props: {
  busy: boolean;
  message: string;
  waitlist: { email: string; team_name: string; notes: string };
  setWaitlist: (value: { email: string; team_name: string; notes: string }) => void;
  submitWaitlist: (event: FormEvent) => void;
  openDashboard: () => void;
}) {
  return (
    <main className="landing">
      <nav className="landing-nav">
        <div className="mark"><Rocket size={22} />RoboIterate</div>
        <button onClick={props.openDashboard}>Open demo</button>
      </nav>
      <section className="hero">
        <div className="hero-copy">
          <h1>RoboIterate hardware loop accelerator</h1>
          <p>Upload robot CAD, catch fabrication issues, choose a local process, and prove how much faster your team is iterating.</p>
          <div className="hero-actions">
            <button onClick={props.openDashboard}><FileUp size={17} />Upload demo part</button>
            <a href="#waitlist">Join waitlist</a>
          </div>
          <div className="metric-row">
            <Metric label="DFM checks" value="8" />
            <Metric label="Processes" value="3" />
            <Metric label="Supplier draft" value="1 click" />
          </div>
        </div>
        <div className="hero-media">
          <img src="/assets/dashboard-concept.png" alt="RoboIterate dashboard concept" />
        </div>
      </section>
      <section className="workflow">
        <WorkflowStep icon={<Gauge />} title="Analyze" text="Read STL/STEP metadata, estimate size, and flag risky geometry." />
        <WorkflowStep icon={<Wrench />} title="Fix" text="Turn DFM findings into concrete changes students can make in CAD." />
        <WorkflowStep icon={<Factory />} title="Fabricate" text="Generate quote requests for local shops, labs, and makerspaces." />
      </section>
      <section className="proof">
        <div>
          <h2>Built for the YC evidence path</h2>
          <p>Every uploaded revision feeds the dashboard: findings caught, quotes generated, and average hours between iterations.</p>
        </div>
        <form id="waitlist" onSubmit={props.submitWaitlist}>
          <input placeholder="Email" value={props.waitlist.email} onChange={(event) => props.setWaitlist({ ...props.waitlist, email: event.currentTarget.value })} />
          <input placeholder="Team name" value={props.waitlist.team_name} onChange={(event) => props.setWaitlist({ ...props.waitlist, team_name: event.currentTarget.value })} />
          <input placeholder="What parts slow you down?" value={props.waitlist.notes} onChange={(event) => props.setWaitlist({ ...props.waitlist, notes: event.currentTarget.value })} />
          <button disabled={props.busy}><Mail size={16} />Save waitlist</button>
        </form>
      </section>
      {props.message && <div className="toast">{props.message}</div>}
    </main>
  );
}

function Dashboard(props: {
  busy: boolean;
  message: string;
  projects: Project[];
  selectedProject?: Project;
  selectedProjectId: string;
  setSelectedProjectId: (id: string) => void;
  projectForm: { name: string; team_name: string; baseline_iteration_days: number };
  onProjectChange: (event: ChangeEvent<HTMLInputElement>) => void;
  createProject: (event: FormEvent) => void;
  uploadForm: { part_name: string; revision: string };
  setUploadForm: (value: { part_name: string; revision: string }) => void;
  file: File | null;
  setFile: (file: File | null) => void;
  useSampleStl: () => void;
  uploadPart: (event: FormEvent) => void;
  parts: Part[];
  selectedPart?: Part;
  setSelectedPartId: (id: string) => void;
  metrics: Metrics | null;
  suppliers: Supplier[];
  matchedSuppliers: Supplier[];
  quote: QuoteRequest | null;
  updateFinding: (finding: Finding, status: FindingStatus) => void;
  generateQuote: (supplier: Supplier) => void;
  openLanding: () => void;
}) {
  const selectedPart = props.selectedPart;
  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="mark"><Rocket size={21} />RoboIterate</div>
        <button className="secondary" onClick={props.openLanding}>Landing page</button>
        <form className="stack" onSubmit={props.createProject}>
          <label>Project<input name="name" value={props.projectForm.name} onChange={props.onProjectChange} /></label>
          <label>Team<input name="team_name" value={props.projectForm.team_name} onChange={props.onProjectChange} /></label>
          <label>Old iteration days<input name="baseline_iteration_days" type="number" min={1} value={props.projectForm.baseline_iteration_days} onChange={props.onProjectChange} /></label>
          <button disabled={props.busy}>Create project</button>
        </form>
        <div className="project-list">
          {props.projects.map((project) => (
            <button key={project.id} className={project.id === props.selectedProjectId ? "row active" : "row"} onClick={() => props.setSelectedProjectId(project.id)}>
              <strong>{project.name}</strong><span>{project.team_name}</span>
            </button>
          ))}
        </div>
      </aside>
      <section className="workspace">
        <header className="toolbar">
          <div>
            <h1>{props.selectedProject?.name ?? "Create a robotics project"}</h1>
            <p>{props.selectedProject ? `${props.selectedProject.team_name} · ${props.parts.length} revisions` : "Upload a real robot STL or STEP file to start."}</p>
          </div>
          <div className="toolbar-stats">
            <Metric label="Revisions" value={String(props.metrics?.revision_count ?? 0)} />
            <Metric label="Open findings" value={String(props.metrics?.open_finding_count ?? 0)} />
            <Metric label="Quote drafts" value={String(props.metrics?.quote_request_count ?? 0)} />
          </div>
        </header>
        {props.message && <div className="notice">{props.message}</div>}
        <div className="dashboard-grid">
          <section className="panel upload-panel">
            <div className="panel-title"><FileUp size={18} />Upload revision</div>
            <form className="stack" onSubmit={props.uploadPart}>
              <label>Part name<input value={props.uploadForm.part_name} onChange={(event) => props.setUploadForm({ ...props.uploadForm, part_name: event.currentTarget.value })} /></label>
              <label>Revision<input value={props.uploadForm.revision} onChange={(event) => props.setUploadForm({ ...props.uploadForm, revision: event.currentTarget.value })} /></label>
              <label>STL or STEP<input type="file" accept=".stl,.step,.stp" onChange={(event) => props.setFile(event.currentTarget.files?.[0] ?? null)} /></label>
              <button type="button" className="secondary" onClick={props.useSampleStl}>Use sample STL</button>
              <button disabled={!props.selectedProject || !props.file || props.busy}>Analyze part</button>
            </form>
            <div className="revision-list">
              {props.parts.map((part) => (
                <button key={part.id} className={part.id === selectedPart?.id ? "row active" : "row"} onClick={() => props.setSelectedPartId(part.id)}>
                  <strong>{part.part_name} Rev {part.revision}</strong>
                  <span>{part.original_filename}</span>
                </button>
              ))}
            </div>
          </section>
          <section className="panel analysis-panel">
            <div className="panel-title"><Gauge size={18} />Part analysis</div>
            {selectedPart ? (
              <>
                <div className="geometry-grid">
                  <Metric label="Format" value={selectedPart.geometry.file_format.toUpperCase()} />
                  <Metric label="Units" value={selectedPart.geometry.units} />
                  <Metric label="Triangles" value={String(selectedPart.geometry.triangle_count ?? "n/a")} />
                  <Metric label="SHA" value={`${selectedPart.sha256.slice(0, 10)}...`} />
                </div>
                <div className="dims">
                  {Object.entries(selectedPart.geometry.dimensions_mm).map(([axis, value]) => <span key={axis}>{axis}: {value} mm</span>)}
                </div>
                <div className="process-strip">
                  {Object.entries(selectedPart.recommendation.scores).map(([process, score]) => (
                    <div key={process} className={process === selectedPart.recommendation.primary_process ? "process-card selected" : "process-card"}>
                      <strong>{processLabels[process as Process]}</strong>
                      <span>{score}/100</span>
                    </div>
                  ))}
                </div>
                <p className="rationale">{selectedPart.recommendation.rationale.join(" ")}</p>
              </>
            ) : <p className="empty">Upload a part to see shape facts and process recommendations.</p>}
          </section>
          <section className="panel findings-panel">
            <div className="panel-title"><AlertTriangle size={18} />DFM findings</div>
            {selectedPart?.findings.map((finding) => (
              <article className="finding" key={finding.id}>
                <div><SeverityPill severity={finding.severity} /> <Status status={finding.status} /></div>
                <h3>{finding.title}</h3>
                <p>{finding.description}</p>
                <strong>{finding.suggested_fix}</strong>
                <small>{finding.evidence}</small>
                <div className="finding-actions">
                  <button className="secondary" onClick={() => props.updateFinding(finding, "fixed")} disabled={finding.status !== "open"}><CheckCircle2 size={15} />Fixed</button>
                  <button className="secondary" onClick={() => props.updateFinding(finding, "accepted")} disabled={finding.status !== "open"}>Accept risk</button>
                </div>
              </article>
            )) ?? <p className="empty">No part selected.</p>}
          </section>
          <section className="panel supplier-panel">
            <div className="panel-title"><Factory size={18} />Local suppliers</div>
            {(selectedPart ? props.matchedSuppliers : props.suppliers).map((supplier) => (
              <article className="supplier" key={supplier.id}>
                <h3>{supplier.name}</h3>
                <p>{supplier.location} · {supplier.typical_turnaround_days} days</p>
                <small>{supplier.rate_notes}</small>
                {selectedPart && <button onClick={() => props.generateQuote(supplier)}><Send size={15} />Draft quote</button>}
              </article>
            ))}
          </section>
          <section className="panel timeline-panel">
            <div className="panel-title"><BarChart3 size={18} />Iteration proof</div>
            <div className="timeline">
              {props.parts.map((part, index) => (
                <div className="timeline-item" key={part.id}>
                  <span>{index + 1}</span>
                  <div><strong>{part.part_name} Rev {part.revision}</strong><small>{new Date(part.uploaded_at).toLocaleString()}</small></div>
                </div>
              ))}
            </div>
            <div className="proof-metrics">
              <Metric label="Avg hours/revision" value={String(props.metrics?.average_hours_between_uploads ?? "need 2")} />
              <Metric label="Est. days saved" value={String(props.metrics?.estimated_days_saved ?? "need 2")} />
            </div>
          </section>
          <section className="panel quote-panel">
            <div className="panel-title"><Mail size={18} />Quote request</div>
            {props.quote ? <pre>{props.quote.message}</pre> : <p className="empty">Select a supplier and draft a quote request.</p>}
          </section>
        </div>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong></div>;
}

function WorkflowStep({ icon, title, text }: { icon: JSX.Element; title: string; text: string }) {
  return <article><div>{icon}</div><h2>{title}</h2><p>{text}</p></article>;
}

function SeverityPill({ severity }: { severity: Severity }) {
  return <span className={`pill sev-${severity}`}>{severity}</span>;
}

function Status({ status }: { status: FindingStatus }) {
  return <span className={`pill status-${status}`}>{status}</span>;
}

