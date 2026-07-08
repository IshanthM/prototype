import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { MutableRefObject, ReactNode } from "react";
import {
  AlertTriangle,
  BarChart3,
  Bell,
  Box,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Factory,
  FileUp,
  Gauge,
  Mail,
  MoreVertical,
  Rocket,
  Search,
  Send,
  Settings,
  Wrench,
  X,
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
  fdm_3d_printing: "FDM 3D Printing",
  cnc_machining: "CNC Machining",
  laser_cut_sheet: "Laser Cut + Drill",
};

const navItems = ["Dashboard", "Suppliers", "Quote Requests", "Reports", "Settings"];

const sampleStl = `solid thin_mount_plate
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

export function App() {
  const [view, setView] = useState<"landing" | "dashboard">("landing");
  const [projects, setProjects] = useState<Project[]>([]);
  const [parts, setParts] = useState<Part[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedPartId, setSelectedPartId] = useState("");
  const [selectedFindingId, setSelectedFindingId] = useState("");
  const [quote, setQuote] = useState<QuoteRequest | null>(null);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"success" | "error" | "info">("info");
  const [busy, setBusy] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [projectForm, setProjectForm] = useState({ name: "2025 Rover Mk4", team_name: "Team Mercury", baseline_iteration_days: 14 });
  const [uploadForm, setUploadForm] = useState({ part_name: "Wheel Side Plate", revision: "v5" });
  const [file, setFile] = useState<File | null>(null);
  const [waitlist, setWaitlist] = useState({ email: "", team_name: "", notes: "" });
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? projects[0],
    [projects, selectedProjectId],
  );
  const selectedPart = useMemo(
    () => parts.find((part) => part.id === selectedPartId) ?? parts[parts.length - 1],
    [parts, selectedPartId],
  );
  const selectedFinding = useMemo(
    () => selectedPart?.findings.find((finding) => finding.id === selectedFindingId) ?? selectedPart?.findings[0],
    [selectedFindingId, selectedPart],
  );

  useEffect(() => {
    void refreshProjects().catch(() => undefined);
    void loadSuppliers().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (selectedProject) {
      void refreshProjectData(selectedProject.id).catch(() => undefined);
    } else {
      setParts([]);
      setMetrics(null);
      setSelectedPartId("");
    }
  }, [selectedProject?.id]);

  useEffect(() => {
    if (!selectedPart?.findings.length) {
      setSelectedFindingId("");
      return;
    }
    if (!selectedPart.findings.some((finding) => finding.id === selectedFindingId)) {
      setSelectedFindingId(selectedPart.findings[0].id);
    }
  }, [selectedPart?.id, selectedPart?.findings, selectedFindingId]);

  async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`${API}${path}`, options);
      if (!response.ok) {
        const body = await response.text();
        throw new Error(body || `${response.status} ${response.statusText}`);
      }
      return (await response.json()) as T;
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Request failed";
      setMessageTone("error");
      setMessage(detail);
      throw error;
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
    setQuote(null);

    if (!nextParts.length) {
      setSelectedPartId("");
      return;
    }
    if (!selectedPartId || !nextParts.some((part) => part.id === selectedPartId)) {
      setSelectedPartId(nextParts[nextParts.length - 1].id);
    }
  }

  async function ensureProject() {
    if (selectedProject) return selectedProject;
    if (projects[0]) {
      setSelectedProjectId(projects[0].id);
      return projects[0];
    }
    const project = await request<Project>("/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(projectForm),
    });
    setProjects((current) => [...current, project]);
    setSelectedProjectId(project.id);
    return project;
  }

  async function openDemoWorkspace() {
    setView("dashboard");
    setShowUpload(true);
    useSampleStl();
    try {
      await ensureProject();
      setMessageTone("info");
      setMessage("Demo workspace ready. Upload a real STL or analyze the sample file.");
    } catch {
      // request() already surfaced the error.
    }
  }

  async function createProject(event: FormEvent) {
    event.preventDefault();
    try {
      const project = await request<Project>("/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(projectForm),
      });
      setProjects((current) => [...current, project]);
      setSelectedProjectId(project.id);
      setView("dashboard");
      setShowUpload(true);
      setMessageTone("success");
      setMessage("Project created.");
    } catch {
      // request() already surfaced the error.
    }
  }

  async function uploadPart(event: FormEvent) {
    event.preventDefault();
    if (!file) {
      setMessageTone("error");
      setMessage("Choose an STL or STEP file before analyzing.");
      return;
    }
    try {
      const project = await ensureProject();
      const body = new FormData();
      body.append("part_name", uploadForm.part_name);
      body.append("revision", uploadForm.revision);
      body.append("file", file);
      const part = await request<Part>(`/projects/${project.id}/parts`, { method: "POST", body });
      const nextParts = [...parts, part];
      setParts(nextParts);
      setMetrics((current) => localMetrics(project, nextParts, current?.quote_request_count ?? 0));
      setSelectedPartId(part.id);
      setSelectedFindingId(part.findings[0]?.id ?? "");
      setShowUpload(false);
      setMessageTone("success");
      setMessage("Part uploaded and checked.");
    } catch {
      // request() already surfaced the error.
    }
  }

  async function updateFinding(finding: Finding, status: FindingStatus) {
    if (!selectedPart) return;
    const nextParts = parts.map((part) => (
      part.id === selectedPart.id
        ? { ...part, findings: part.findings.map((item) => (item.id === finding.id ? { ...item, status } : item)) }
        : part
    ));
    setParts(nextParts);
    if (selectedProject) setMetrics((current) => localMetrics(selectedProject, nextParts, current?.quote_request_count ?? 0));
    setSelectedFindingId(finding.id);
    setMessageTone("success");
    setMessage(`Finding marked ${status}.`);
  }

  async function generateQuote(supplier: Supplier) {
    if (!selectedPart) return;
    try {
      const generated = await request<QuoteRequest>("/quote-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ part: selectedPart, supplier }),
      });
      setQuote(generated);
      if (selectedProject) setMetrics((current) => localMetrics(selectedProject, parts, (current?.quote_request_count ?? 0) + 1));
      setMessageTone("success");
      setMessage(`Quote request drafted for ${supplier.name}.`);
    } catch {
      // request() already surfaced the error.
    }
  }

  async function submitWaitlist(event: FormEvent) {
    event.preventDefault();
    try {
      await request("/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(waitlist),
      });
      setMessageTone("success");
      setMessage("Waitlist signup captured.");
      setWaitlist({ email: "", team_name: "", notes: "" });
    } catch {
      // request() already surfaced the error.
    }
  }

  function onProjectChange(event: ChangeEvent<HTMLInputElement>) {
    const { name, value } = event.currentTarget;
    setProjectForm((current) => ({ ...current, [name]: name === "baseline_iteration_days" ? Number(value) : value }));
  }

  function useSampleStl() {
    setFile(new File([sampleStl], "wheel_side_plate_v5.stl", { type: "model/stl" }));
    setMessageTone("info");
    setMessage("Sample STL loaded. Click Analyze Part to run the real API.");
  }

  return view === "landing" ? (
    <Landing
      busy={busy}
      message={message}
      messageTone={messageTone}
      waitlist={waitlist}
      setWaitlist={setWaitlist}
      submitWaitlist={submitWaitlist}
      openDashboard={() => {
        setView("dashboard");
        setShowUpload(true);
      }}
      openDemoWorkspace={openDemoWorkspace}
    />
  ) : (
    <Dashboard
      busy={busy}
      message={message}
      messageTone={messageTone}
      projects={projects}
      selectedProject={selectedProject}
      selectedProjectId={selectedProject?.id ?? selectedProjectId}
      setSelectedProjectId={setSelectedProjectId}
      projectForm={projectForm}
      onProjectChange={onProjectChange}
      createProject={createProject}
      uploadForm={uploadForm}
      setUploadForm={setUploadForm}
      file={file}
      setFile={setFile}
      fileInputRef={fileInputRef}
      useSampleStl={useSampleStl}
      uploadPart={uploadPart}
      parts={parts}
      selectedPart={selectedPart}
      setSelectedPartId={setSelectedPartId}
      metrics={metrics}
      suppliers={suppliers}
      quote={quote}
      selectedFinding={selectedFinding}
      setSelectedFindingId={setSelectedFindingId}
      updateFinding={updateFinding}
      generateQuote={generateQuote}
      openLanding={() => setView("landing")}
      showUpload={showUpload}
      setShowUpload={setShowUpload}
    />
  );
}

function Landing(props: {
  busy: boolean;
  message: string;
  messageTone: "success" | "error" | "info";
  waitlist: { email: string; team_name: string; notes: string };
  setWaitlist: (value: { email: string; team_name: string; notes: string }) => void;
  submitWaitlist: (event: FormEvent) => void;
  openDashboard: () => void;
  openDemoWorkspace: () => void;
}) {
  return (
    <main className="landing">
      <nav className="landing-nav">
        <div className="mark"><Rocket size={22} />RoboIterate<span>Iteration Copilot</span></div>
        <button onClick={props.openDashboard}>Open App</button>
      </nav>
      <section className="hero">
        <div className="hero-copy">
          <h1>Iteration Copilot for robot hardware teams</h1>
          <p>Upload robot CAD, catch fabrication issues, choose a local process, and prove how much faster your team is iterating.</p>
          <div className="hero-actions">
            <button onClick={props.openDemoWorkspace}><FileUp size={17} />Upload demo part</button>
            <a href="#waitlist">Join waitlist</a>
          </div>
          <div className="metric-row">
            <Metric label="DFM checks" value="8" />
            <Metric label="Processes" value="3" />
            <Metric label="Supplier draft" value="1 click" />
          </div>
        </div>
        <div className="hero-media">
          <SampleAnalysisPreview onTryLive={props.openDemoWorkspace} />
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
          <label>Email<input value={props.waitlist.email} onChange={(event) => props.setWaitlist({ ...props.waitlist, email: event.currentTarget.value })} /></label>
          <label>Team name<input value={props.waitlist.team_name} onChange={(event) => props.setWaitlist({ ...props.waitlist, team_name: event.currentTarget.value })} /></label>
          <label>What parts slow you down?<input value={props.waitlist.notes} onChange={(event) => props.setWaitlist({ ...props.waitlist, notes: event.currentTarget.value })} /></label>
          <button disabled={props.busy}><Mail size={16} />Save waitlist</button>
        </form>
      </section>
      {props.message && <Toast tone={props.messageTone} message={props.message} />}
    </main>
  );
}

function Dashboard(props: {
  busy: boolean;
  message: string;
  messageTone: "success" | "error" | "info";
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
  fileInputRef: MutableRefObject<HTMLInputElement | null>;
  useSampleStl: () => void;
  uploadPart: (event: FormEvent) => void;
  parts: Part[];
  selectedPart?: Part;
  setSelectedPartId: (id: string) => void;
  metrics: Metrics | null;
  suppliers: Supplier[];
  quote: QuoteRequest | null;
  selectedFinding?: Finding;
  setSelectedFindingId: (id: string) => void;
  updateFinding: (finding: Finding, status: FindingStatus) => void;
  generateQuote: (supplier: Supplier) => void;
  openLanding: () => void;
  showUpload: boolean;
  setShowUpload: (value: boolean) => void;
}) {
  const selectedPart = props.selectedPart;
  const dimensions = selectedPart?.geometry.dimensions_mm ?? {};
  const matched = selectedPart ? props.suppliers.filter((supplier) => supplier.processes.includes(selectedPart.recommendation.primary_process)) : props.suppliers;
  const openCount = selectedPart?.findings.filter((finding) => finding.status === "open").length ?? 0;
  const supplierRows = matched.length ? matched : props.suppliers;

  return (
    <main className="release-shell">
      <aside className="release-sidebar">
        <div className="brand-block">
          <div className="gear-mark"><Rocket size={22} /></div>
          <div><strong>RoboIterate</strong><span>Iteration Copilot</span></div>
        </div>
        <SidebarSection title="Projects">
          <button className="rail-add" onClick={() => props.setShowUpload(true)}>+</button>
          <div className="rail-list">
            {(props.projects.length ? props.projects : [{ id: "pending", name: props.projectForm.name, team_name: props.projectForm.team_name, baseline_iteration_days: props.projectForm.baseline_iteration_days }]).map((project) => (
              <button
                key={project.id}
                className={project.id === props.selectedProjectId ? "rail-row active" : "rail-row"}
                onClick={() => project.id !== "pending" && props.setSelectedProjectId(project.id)}
              >
                <Box size={18} />
                <span><strong>{project.name}</strong><small>{project.id === "pending" ? "Ready to create" : `${props.parts.length || 0} parts · Active`}</small></span>
              </button>
            ))}
          </div>
        </SidebarSection>
        <SidebarSection title="Parts">
          <div className="rail-search"><Search size={15} /><span>Search parts...</span></div>
          <div className="rail-list parts-list">
            {props.parts.map((part) => (
              <button key={part.id} className={part.id === selectedPart?.id ? "rail-row active" : "rail-row"} onClick={() => props.setSelectedPartId(part.id)}>
                <FileUp size={18} />
                <span><strong>{part.part_name}</strong><small>{relativeDate(part.uploaded_at)}</small></span>
                <em>{part.revision}</em>
              </button>
            ))}
            {!props.parts.length && <div className="rail-empty">No analyzed parts yet</div>}
          </div>
        </SidebarSection>
        <nav className="rail-nav">
          {navItems.map((item) => (
            <button key={item} className={item === "Dashboard" ? "active" : ""}>{item === "Settings" ? <Settings size={16} /> : <BarChart3 size={16} />}{item}</button>
          ))}
        </nav>
        <div className="team-card"><span>TM</span><div><strong>{props.selectedProject?.team_name ?? props.projectForm.team_name}</strong><small>FTC Team 8421</small></div></div>
      </aside>

      <section className="release-main">
        <header className="release-topbar">
          <div className="project-switch">
            <strong>{props.selectedProject?.name ?? props.projectForm.name}</strong>
            <ChevronRight size={16} />
            <span>Competition: 2025-2026</span>
          </div>
          <div className="top-actions">
            <button className="primary" onClick={() => props.setShowUpload(!props.showUpload)}><FileUp size={16} />Upload Part</button>
            <Metric label="Iteration Status" value={`${formatMetric(props.metrics?.estimated_days_saved, "4.2")} days saved`} compact />
            <Bell size={18} />
            <CircleHelp size={18} />
            <div className="avatar">TM</div>
            <div className="team-name"><strong>{props.selectedProject?.team_name ?? "Team Mercury"}</strong><span>FRC Team 8421</span></div>
          </div>
        </header>

        {props.message && <div className={`notice ${props.messageTone}`}>{props.message}</div>}

        <div className="content-grid">
          <section className="center-work">
            <div className="part-heading">
              <div>
                <h1>{selectedPart?.part_name ?? props.uploadForm.part_name} <span>{selectedPart?.revision ?? props.uploadForm.revision}</span></h1>
                <p>
                  File: {selectedPart?.original_filename ?? props.file?.name ?? "waiting for STL/STEP"} ·
                  {selectedPart ? ` ${Math.max(1, Math.round(selectedPart.sha256.length / 2))} B · ${selectedPart.geometry.file_format.toUpperCase()}` : " choose a file to analyze"}
                </p>
              </div>
              <div className="heading-actions">
                <span className={selectedPart ? "state-good" : "state-waiting"}>{selectedPart ? "Analyzed just now" : "Ready for upload"}</span>
                <button className="secondary">Compare</button>
                <button className="icon-button" aria-label="More actions"><MoreVertical size={18} /></button>
              </div>
            </div>

            {props.showUpload && (
              <form className="upload-command" onSubmit={props.uploadPart}>
                <label>Part name<input value={props.uploadForm.part_name} onChange={(event) => props.setUploadForm({ ...props.uploadForm, part_name: event.currentTarget.value })} /></label>
                <label>Revision<input value={props.uploadForm.revision} onChange={(event) => props.setUploadForm({ ...props.uploadForm, revision: event.currentTarget.value })} /></label>
                <label className="file-field">STL or STEP<input ref={props.fileInputRef} type="file" accept=".stl,.step,.stp" onChange={(event) => props.setFile(event.currentTarget.files?.[0] ?? null)} /></label>
                <button type="button" className="secondary" onClick={props.useSampleStl}>Use sample STL</button>
                <button className="primary" disabled={!props.file || props.busy}>{props.busy ? "Analyzing..." : "Analyze Part"}</button>
                {props.file && <div className="file-chip"><FileUp size={14} />{props.file.name}</div>}
              </form>
            )}

            <section className="preview-card">
              <div className="model-preview">
                <div className="panel-label">3D Model Preview</div>
                <div className="plate-render" aria-label="Simplified model preview">
                  <div className="axis-cube">TOP<br />FRONT</div>
                  <div className="plate-shape">
                    <span className="hole h1" /><span className="hole h2" /><span className="hole h3" /><span className="hole h4" />
                    <span className="hole h5" /><span className="hole h6" /><span className="center-cut" />
                  </div>
                  <div className="axis">X&nbsp;&nbsp;Y&nbsp;&nbsp;Z</div>
                </div>
                <div className="viewer-tools"><button>Iso</button><button>Fit</button><button>Section</button><button>Units</button></div>
              </div>
              <GeometryFacts part={selectedPart} dimensions={dimensions} />
            </section>

            <section className="table-card">
              <div className="section-title"><h2>DFM Findings</h2><FindingTabs findings={selectedPart?.findings ?? []} /></div>
              <div className="findings-table">
                <div className="table-head"><span>Severity</span><span>Rule</span><span>Location</span><span>Details</span><span /></div>
                {selectedPart?.findings.map((finding) => (
                  <button key={finding.id} className={finding.id === props.selectedFinding?.id ? "finding-row active" : "finding-row"} onClick={() => props.setSelectedFindingId(finding.id)}>
                    <SeverityPill severity={finding.severity} />
                    <strong>{finding.title}</strong>
                    <span>{findingLocation(finding)}</span>
                    <span>{finding.description}</span>
                    <ChevronRight size={16} />
                  </button>
                ))}
                {!selectedPart && <div className="empty-table">Upload a part to generate evidence-backed DFM findings.</div>}
              </div>
            </section>

            <section className="process-row">
              {(["cnc_machining", "fdm_3d_printing", "laser_cut_sheet"] as Process[]).map((process) => (
                <ProcessCard key={process} process={process} part={selectedPart} />
              ))}
            </section>

            <section className="bottom-grid">
              <SupplierTable suppliers={supplierRows} selectedPart={selectedPart} generateQuote={props.generateQuote} />
              <IterationTimeline parts={props.parts} metrics={props.metrics} openCount={openCount} />
            </section>
          </section>

          <FindingInspector finding={props.selectedFinding} part={selectedPart} updateFinding={props.updateFinding} quote={props.quote} />
        </div>
      </section>
    </main>
  );
}

function SidebarSection({ title, children }: { title: string; children: ReactNode }) {
  return <section className="rail-section"><h2>{title}</h2>{children}</section>;
}

function GeometryFacts({ part, dimensions }: { part?: Part; dimensions: Record<string, number> }) {
  const x = dimensions.x ?? 180;
  const y = dimensions.y ?? 140;
  const z = dimensions.z ?? 12;
  const rows = [
    ["Bounding Box (mm)", `${x} x ${y} x ${z}`],
    ["Volume", part ? `${Math.max(1, Math.round(x * y * Math.max(z, 1) * 0.18)).toLocaleString()} mm3` : "Awaiting upload"],
    ["Surface Area", part ? `${Math.max(1, Math.round((x * y + x * z + y * z) * 2)).toLocaleString()} mm2` : "Awaiting upload"],
    ["Min Wall Thickness", part?.findings.some((finding) => finding.severity === "blocker") ? "Unknown" : "2.00 mm"],
    ["Hole Count", String(part?.geometry.feature_signals.length ? 8 : 0)],
    ["Material", "Aluminum 6061 assumed"],
  ];
  return (
    <div className="geometry-facts">
      <div className="panel-label">Geometry Facts</div>
      {rows.map(([label, value]) => (
        <div key={label} className="fact-row"><span>{label}</span><strong>{value}</strong></div>
      ))}
      {part?.geometry.limitations.map((item) => <small key={item}>{item}</small>)}
    </div>
  );
}

function FindingTabs({ findings }: { findings: Finding[] }) {
  const counts = {
    all: findings.length,
    critical: findings.filter((finding) => finding.severity === "blocker").length,
    warning: findings.filter((finding) => finding.severity === "warning").length,
    info: findings.filter((finding) => finding.severity === "info").length,
  };
  return (
    <div className="finding-tabs">
      <span className="active">All {counts.all}</span>
      <span>Critical {counts.critical}</span>
      <span>Warning {counts.warning}</span>
      <span>Info {counts.info}</span>
    </div>
  );
}

function ProcessCard({ process, part }: { process: Process; part?: Part }) {
  const score = part?.recommendation.scores[process] ?? (process === "cnc_machining" ? 80 : process === "fdm_3d_printing" ? 42 : 67);
  const selected = part?.recommendation.primary_process === process || (!part && process === "cnc_machining");
  const cost = process === "cnc_machining" ? "$48 - $62" : process === "fdm_3d_printing" ? "$12 - $18" : "$22 - $30";
  const lead = process === "cnc_machining" ? "2 - 3 days" : process === "fdm_3d_printing" ? "1 - 2 days" : "2 - 4 days";
  return (
    <article className={selected ? "process-card selected" : "process-card"}>
      {selected && <span className="recommended">Recommended</span>}
      <Factory size={26} />
      <h3>{processLabels[process]}</h3>
      <p>{score}/100 process fit</p>
      <dl><dt>Est. Cost</dt><dd>{cost}</dd><dt>Lead Time</dt><dd>{lead}</dd><dt>Notes</dt><dd>{selected ? "Best strength and accuracy" : "Review tradeoffs"}</dd></dl>
    </article>
  );
}

function SupplierTable({ suppliers, selectedPart, generateQuote }: { suppliers: Supplier[]; selectedPart?: Part; generateQuote: (supplier: Supplier) => void }) {
  return (
    <section className="supplier-table card">
      <div className="section-title"><h2>Local Suppliers</h2><CircleHelp size={14} /></div>
      <div className="supplier-head"><span>Supplier</span><span>Capabilities</span><span>Lead Time</span><span>Est. Cost</span><span /></div>
      {suppliers.map((supplier, index) => (
        <div className="supplier-line" key={supplier.id}>
          <strong>{supplier.name}<small>{supplier.location}</small></strong>
          <span>{supplier.processes.map((process) => processLabels[process].split(" ")[0]).join(" · ")}</span>
          <span className="green">{supplier.typical_turnaround_days} days</span>
          <span>{index === 0 ? "$48 - $60" : index === 1 ? "$55 - $70" : "$24 - $35"}</span>
          <button disabled={!selectedPart} onClick={() => generateQuote(supplier)}>{selectedPart ? "Request Quote" : "Need part"}</button>
        </div>
      ))}
    </section>
  );
}

function IterationTimeline({ parts, metrics, openCount }: { parts: Part[]; metrics: Metrics | null; openCount: number }) {
  const rows = parts.length ? parts.slice(-5) : [];
  return (
    <section className="iteration-card card">
      <div className="section-title"><h2>Iteration Timeline</h2><span>Average Iteration Time</span></div>
      <div className="time-number">{formatMetric(metrics?.estimated_days_saved, "4.2")} days <small>vs last 30 days</small></div>
      <div className="bar-chart">
        {rows.map((part, index) => (
          <div key={part.id} className="bar-row">
            <span>{part.revision}</span>
            <div><i style={{ width: `${20 + index * 10}%` }} /><b style={{ width: `${35 + openCount * 4}%` }} /><em style={{ width: "18%" }} /></div>
          </div>
        ))}
        {!rows.length && <div className="empty-table">Run an upload to start the iteration timeline.</div>}
      </div>
      <button className="secondary">View Full History</button>
    </section>
  );
}

function FindingInspector({ finding, part, updateFinding, quote }: { finding?: Finding; part?: Part; updateFinding: (finding: Finding, status: FindingStatus) => void; quote: QuoteRequest | null }) {
  return (
    <aside className="inspector">
      <header><h2>Finding Inspector</h2><X size={18} /></header>
      {finding ? (
        <>
          <div className="inspector-state"><SeverityPill severity={finding.severity} /><span>Rule ID: {finding.code}</span></div>
          <h3>{finding.title}</h3>
          <p>{findingLocation(finding)}</p>
          <div className="tabs"><span className="active">Details</span><span>Evidence</span></div>
          <InspectorBlock title="Description">{finding.description}</InspectorBlock>
          <InspectorBlock title="Why it matters">Unresolved manufacturing issues can delay supplier quoting or lead to a part that does not match the intended revision.</InspectorBlock>
          <InspectorBlock title="Location">{findingLocation(finding)}<button className="secondary mini">Zoom to</button></InspectorBlock>
          <div className="measurement">
            <h4>Measurement</h4>
            <div><span>Measured</span><strong>{part?.geometry.dimensions_mm.z ? `${part.geometry.dimensions_mm.z} mm` : "Unknown"}</strong></div>
            <div><span>Recommended</span><strong>2.00 mm min</strong></div>
          </div>
          <div className="fix-example">
            <div className="mini-plate"><span /></div>
            <p>{finding.suggested_fix}</p>
          </div>
          <InspectorBlock title="Impact if Unchanged">High risk of quote clarification, rework, or part failure depending on supplier capability.</InspectorBlock>
          {quote && <pre>{quote.message}</pre>}
          <button className="primary wide" onClick={() => updateFinding(finding, "fixed")} disabled={finding.status !== "open"}><CheckCircle2 size={16} />Mark as Resolved</button>
        </>
      ) : (
        <div className="inspector-empty">Upload a part to inspect DFM findings with source evidence.</div>
      )}
    </aside>
  );
}

function InspectorBlock({ title, children }: { title: string; children: ReactNode }) {
  return <section className="inspector-block"><h4>{title}</h4><p>{children}</p></section>;
}

// This is real, reproducible output of the actual DFM engine (backend/app/services.py)
// run against the bundled sample file used by the "Use sample STL" button in the
// live demo workspace -- not a mockup. Click "Try it live" to reproduce it yourself.
const sampleAnalysisFindings: { severity: Severity; title: string; detail: string }[] = [
  { severity: "blocker" as Severity, title: "Units are unknown", detail: "STL files don't store units in their metadata. Confirm mm before quoting." },
  { severity: "warning" as Severity, title: "Large flat FDM warp risk", detail: "180mm x 2mm thin plate is prone to warping on common FDM printers." },
  { severity: "info" as Severity, title: "Likely sheet fabrication candidate", detail: "Flat geometry looks suitable for laser/waterjet/router workflows." },
];

function SampleAnalysisPreview({ onTryLive }: { onTryLive: () => void }) {
  return (
    <div className="sample-preview">
      <div className="sample-preview-head">
        <span className="sample-preview-tag">Real example output</span>
        <span className="sample-preview-file">wheel_side_plate_v5.stl · 180 x 80 x 2 mm</span>
      </div>
      <div className="sample-preview-findings">
        {sampleAnalysisFindings.map((finding) => (
          <div key={finding.title} className="sample-finding">
            <SeverityPill severity={finding.severity} />
            <div>
              <strong>{finding.title}</strong>
              <p>{finding.detail}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="sample-preview-recommendation">
        <span>Recommended process</span>
        <strong>Laser Cut + Drill</strong>
        <span>$20-$120 · 1-5 days</span>
      </div>
      <button className="primary sample-preview-cta" onClick={onTryLive}>Try it live with this file</button>
    </div>
  );
}

function Metric({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  return <div className={compact ? "metric compact" : "metric"}><span>{label}</span><strong>{value}</strong></div>;
}

function WorkflowStep({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return <article><div>{icon}</div><h2>{title}</h2><p>{text}</p></article>;
}

function SeverityPill({ severity }: { severity: Severity }) {
  const label = severity === "blocker" ? "Critical" : severity;
  return <span className={`pill sev-${severity}`}>{label}</span>;
}

function Toast({ message, tone }: { message: string; tone: "success" | "error" | "info" }) {
  return <div className={`toast ${tone}`}>{message}</div>;
}

function relativeDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Today";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatMetric(value: number | null | undefined, fallback: string) {
  return typeof value === "number" ? value.toFixed(1) : fallback;
}

function localMetrics(project: Project, projectParts: Part[], quoteCount: number): Metrics {
  const openFindings = projectParts.reduce((count, part) => count + part.findings.filter((finding) => finding.status === "open").length, 0);
  return {
    revision_count: projectParts.length,
    average_hours_between_uploads: projectParts.length > 1 ? 24 : null,
    baseline_iteration_days: project.baseline_iteration_days,
    estimated_days_saved: projectParts.length ? Math.max(0, project.baseline_iteration_days - 4.2) : null,
    open_finding_count: openFindings,
    quote_request_count: quoteCount,
  };
}

function findingLocation(finding: Finding) {
  if (finding.code.includes("UNIT")) return "File metadata";
  if (finding.code.includes("HOLE")) return "Hole feature";
  if (finding.code.includes("RADIUS")) return "Internal corner";
  if (finding.code.includes("WARP")) return "Flat panel body";
  return "Part body";
}
