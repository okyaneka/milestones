import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInAnonymously, type User } from 'firebase/auth';
import {
  addDoc, collection, deleteDoc, doc, getDocs, getFirestore, onSnapshot, orderBy, query,
  updateDoc, type Firestore,
} from 'firebase/firestore';
import {
  ArrowDown, ArrowRight, ArrowUp, AlertCircle, CalendarDays, Check,
  CheckCheck, ChevronRight, Circle, CircleDashed, Clock3, FolderKanban, ListTodo,
  LoaderCircle, MoreHorizontal, Plus, Search, Target, Trash2, Pencil, X,
} from 'lucide-react';
import { Link, Route, Switch, useLocation, useParams } from 'wouter';

type MilestoneStatus = 'planned' | 'in-progress' | 'completed';
type Project = {
  id: string; ownerUid: string; name: string; description: string;
  targetDate: string; createdAt: string; updatedAt: string;
};
type Milestone = {
  id: string; ownerUid: string; projectId: string; title: string; description: string;
  dueDate: string; status: MilestoneStatus; order: number; createdAt: string; updatedAt: string;
};
type FirebaseClient = { app: FirebaseApp; db: Firestore; auth: ReturnType<typeof getAuth> };
type ProjectDraft = { name: string; description: string; targetDate: string };
type MilestoneDraft = { title: string; description: string; dueDate: string; status: MilestoneStatus };

const requiredEnv = [
  ['VITE_FIREBASE_API_KEY', import.meta.env.VITE_FIREBASE_API_KEY],
  ['VITE_FIREBASE_AUTH_DOMAIN', import.meta.env.VITE_FIREBASE_AUTH_DOMAIN],
  ['VITE_FIREBASE_PROJECT_ID', import.meta.env.VITE_FIREBASE_PROJECT_ID],
  ['VITE_FIREBASE_APP_ID', import.meta.env.VITE_FIREBASE_APP_ID],
] as const;
const missingEnv = requiredEnv.filter(([, value]) => !value).map(([key]) => key);

function createFirebaseClient(): FirebaseClient {
  const config = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  };
  const app = getApps().length ? getApps()[0] : initializeApp(config);
  return { app, db: getFirestore(app), auth: getAuth(app) };
}

const dateFormat = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
const statusLabels: Record<MilestoneStatus, string> = {
  planned: 'Direncanakan', 'in-progress': 'Sedang berjalan', completed: 'Selesai',
};
const isoNow = () => new Date().toISOString();
const formatDate = (value?: string) => value ? dateFormat.format(new Date(`${value.slice(0, 10)}T00:00:00`)) : 'Belum ditentukan';
const projectCollection = (db: Firestore, uid: string) => collection(db, 'users', uid, 'projects');
const projectDoc = (db: Firestore, uid: string, id: string) => doc(db, 'users', uid, 'projects', id);
const milestoneCollection = (db: Firestore, uid: string, id: string) => collection(db, 'users', uid, 'projects', id, 'milestones');
const milestoneDoc = (db: Firestore, uid: string, projectId: string, id: string) =>
  doc(db, 'users', uid, 'projects', projectId, 'milestones', id);

function App() {
  const [firebase] = useState(() => missingEnv.length ? null : createFirebaseClient());
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(Boolean(firebase));
  const [authError, setAuthError] = useState('');

  useEffect(() => {
    if (!firebase) return;
    const stop = onAuthStateChanged(firebase.auth, async (currentUser) => {
      setUser(currentUser);
      if (!currentUser) {
        try {
          await signInAnonymously(firebase.auth);
          setAuthError('');
        } catch (error) {
          setAuthError(error instanceof Error ? error.message : 'Tidak dapat terhubung ke Firebase Authentication.');
        }
      }
      setAuthLoading(false);
    });
    return stop;
  }, [firebase]);

  if (missingEnv.length) return <SetupScreen missing={missingEnv} />;
  if (authLoading) return <AppLoading />;
  if (authError || !firebase || !user) {
    return <ConnectionError message={authError || 'Sesi anonim belum dapat dibuat.'} onRetry={() => {
      setAuthLoading(true);
      void signInAnonymously(firebase!.auth).then(() => setAuthError('')).catch((error: unknown) => {
        setAuthError(error instanceof Error ? error.message : 'Koneksi gagal.');
      }).finally(() => setAuthLoading(false));
    }} />;
  }
  return <Workspace firebase={firebase} user={user} />;
}

function Workspace({ firebase, user }: { firebase: FirebaseClient; user: User }) {
  return (
    <div className="app-shell">
      <header className="topbar">
        <Link href="/" className="brand" data-testid="link-home">
          <span className="brand-mark"><Target size={18} /></span>
          <span>TitikMaju</span>
        </Link>
        <div className="topbar-right">
          <span className="sync-note" data-testid="status-sync"><i className="sync-dot" />Tersimpan di cloud</span>
          <span className="user-mark" aria-label="Workspace pribadi"><FolderKanban size={16} /></span>
        </div>
      </header>
      <Switch>
        <Route path="/" component={() => <Dashboard firebase={firebase} user={user} />} />
        <Route path="/projects/:projectId" component={() => <ProjectPage firebase={firebase} user={user} />} />
        <Route component={UnknownPage} />
      </Switch>
    </div>
  );
}

function SetupScreen({ missing }: { missing: string[] }) {
  return (
    <main className="setup-page">
      <section className="setup-card" data-testid="screen-firebase-setup">
        <div className="brand"><span className="brand-mark"><Target size={18} /></span>TitikMaju</div>
        <h1>Siapkan ruang kerjamu</h1>
        <p>TitikMaju menyimpan proyek dan milestone secara langsung di Firebase. Tambahkan konfigurasi publik berikut agar sinkronisasi dapat dimulai.</p>
        <ul className="setup-list">
          {requiredEnv.map(([key, value]) => (
            <li key={key} className={value ? 'present' : 'missing'} data-testid={`setup-env-${key.toLowerCase()}`}>
              {value ? <Check size={15} /> : <AlertCircle size={15} />}
              <code>{key}</code><span>{value ? 'tersedia' : 'belum diatur'}</span>
            </li>
          ))}
        </ul>
        <p className="config-note">Tambahkan nilai tersebut sebagai environment variable dengan awalan <code>VITE_</code>, aktifkan Anonymous Authentication, lalu muat ulang aplikasi. Data tidak disimpan selama konfigurasi belum lengkap.</p>
      </section>
    </main>
  );
}

function AppLoading() {
  return <main className="setup-page"><section className="setup-card" aria-label="Memuat TitikMaju">
    <div className="brand"><span className="brand-mark"><Target size={18} /></span>TitikMaju</div>
    <div style={{ marginTop: 28 }} className="skeleton skeleton-line" />
    <div className="skeleton skeleton-line" style={{ width: '70%' }} />
    <p>Menyiapkan ruang kerja amanmu…</p>
  </section></main>;
}

function ConnectionError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <main className="setup-page"><section className="setup-card">
    <div className="brand"><span className="brand-mark"><Target size={18} /></span>TitikMaju</div>
    <div className="empty-icon" style={{ marginTop: 28 }}><AlertCircle size={22} /></div>
    <h1 style={{ marginTop: 0 }}>Koneksi belum siap</h1>
    <p data-testid="status-auth-error">{message}</p>
    <button className="button button-primary" onClick={onRetry} data-testid="button-retry-auth">Coba lagi</button>
  </section></main>;
}

function UnknownPage() {
  return <main className="not-found" data-testid="screen-not-found"><div><strong>404</strong><h1>Halaman ini tidak ditemukan</h1><p>Sepertinya langkah ini belum ada di peta.</p><Link className="button button-primary" href="/" data-testid="link-not-found-home">Kembali ke ruang kerja</Link></div></main>;
}

function Dashboard({ firebase, user }: { firebase: FirebaseClient; user: User }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [counts, setCounts] = useState<Record<string, { total: number; completed: number }>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('updated');
  const [projectModal, setProjectModal] = useState<Project | 'new' | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [, navigate] = useLocation();

  useEffect(() => {
    setLoading(true);
    const q = query(projectCollection(firebase.db, user.uid), orderBy('updatedAt', 'desc'));
    return onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(item => ({ id: item.id, ...item.data() } as Project));
      setProjects(list); setLoading(false); setError('');
    }, (reason) => { setError(reason.message); setLoading(false); });
  }, [firebase.db, user.uid]);
  const projectIds = projects.map(project => project.id).join('|');
  useEffect(() => {
    const ids = projectIds ? projectIds.split('|') : [];
    setCounts(previous => Object.fromEntries(Object.entries(previous).filter(([id]) => ids.includes(id))));
    const unsubscribers = ids.map(id => onSnapshot(
      milestoneCollection(firebase.db, user.uid, id),
      (snapshot) => setCounts(prev => ({ ...prev, [id]: {
        total: snapshot.size,
        completed: snapshot.docs.filter(item => item.data().status === 'completed').length,
      } })),
      (reason) => setError(reason.message),
    ));
    return () => unsubscribers.forEach(unsubscribe => unsubscribe());
  }, [firebase.db, user.uid, projectIds]);

  const visibleProjects = useMemo(() => {
    const filtered = projects.filter(project => `${project.name} ${project.description}`.toLowerCase().includes(search.toLowerCase()));
    return [...filtered].sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name) : sort === 'target'
      ? (a.targetDate || '9999').localeCompare(b.targetDate || '9999')
      : b.updatedAt.localeCompare(a.updatedAt));
  }, [projects, search, sort]);
  const totalMilestones = Object.values(counts).reduce((sum, count) => sum + count.total, 0);
  const finished = Object.values(counts).reduce((sum, count) => sum + count.completed, 0);

  async function saveProject(draft: ProjectDraft, current: Project | null) {
    const now = isoNow();
    if (current) await updateDoc(projectDoc(firebase.db, user.uid, current.id), { ...draft, updatedAt: now });
    else {
      const reference = await addDoc(projectCollection(firebase.db, user.uid), {
        ...draft, ownerUid: user.uid, createdAt: now, updatedAt: now,
      });
      navigate(`/projects/${reference.id}`);
    }
    setProjectModal(null);
  }
  async function removeProject(project: Project) {
    try {
      const milestones = await getDocs(milestoneCollection(firebase.db, user.uid, project.id));
      await Promise.all(milestones.docs.map(item => deleteDoc(item.ref)));
      await deleteDoc(projectDoc(firebase.db, user.uid, project.id));
      setDeleteTarget(null);
    } catch (reason) { setError(errorMessage(reason)); }
  }

  return <main className="page-wrap">
    <div className="page-heading">
      <div><div className="eyebrow">Ruang kerja pribadi</div><h1>Langkah besar,<br className="mobile-break" /> dibuat lebih jelas.</h1>
        <p>Ubah tujuan penting menjadi rangkaian langkah yang nyata dan bisa kamu pantau.</p></div>
      <button className="button button-primary" onClick={() => setProjectModal('new')} data-testid="button-create-project"><Plus size={17} /> Proyek baru</button>
    </div>
    {error && <ErrorBanner message={error} onDismiss={() => setError('')} />}
    <section className="summary-strip" aria-label="Ringkasan ruang kerja">
      <div className="summary-item"><span className="summary-icon"><FolderKanban size={17} /></span><div><div className="summary-label">Proyek aktif</div><div className="summary-value" data-testid="text-project-count">{projects.length}</div></div></div>
      <div className="summary-item"><span className="summary-icon"><ListTodo size={17} /></span><div><div className="summary-label">Total milestone</div><div className="summary-value" data-testid="text-milestone-count">{totalMilestones}</div></div></div>
      <div className="summary-item"><span className="summary-icon"><CheckCheck size={17} /></span><div><div className="summary-label">Tuntas</div><div className="summary-value" data-testid="text-completed-count">{finished}</div></div></div>
    </section>
    <div className="section-bar">
      <div className="section-title">Semua proyek <span className="section-count" data-testid="text-filtered-project-count">{projects.length}</span></div>
    </div>
    <div className="toolbar">
      <label className="search-wrap"><Search size={16} /><span className="sr-only">Cari proyek</span>
        <input className="field" value={search} onChange={event => setSearch(event.target.value)} placeholder="Cari proyek…" data-testid="input-search-projects" /></label>
      <label className="sr-only" htmlFor="project-sort">Urutkan proyek</label>
      <select id="project-sort" className="select-field" value={sort} onChange={event => setSort(event.target.value)} data-testid="select-project-sort">
        <option value="updated">Terakhir diperbarui</option><option value="target">Tanggal target</option><option value="name">Nama proyek</option>
      </select>
    </div>
    {loading ? <div className="project-grid" aria-label="Memuat proyek">{[0, 1, 2, 3].map(item => <div className="skeleton-card" key={item}><div className="skeleton skeleton-line" style={{ width: '54%' }} /><div className="skeleton skeleton-line" style={{ width: '88%', marginTop: 24 }} /><div className="skeleton skeleton-line" style={{ width: '42%', marginTop: 50 }} /></div>)}</div>
      : visibleProjects.length ? <div className="project-grid" data-testid="list-projects">{visibleProjects.map((project, index) => {
        const projectCounts = counts[project.id] || { total: 0, completed: 0 };
        const progress = projectCounts.total ? Math.round(projectCounts.completed / projectCounts.total * 100) : 0;
        return <article className="project-card" style={{ animationDelay: `${Math.min(index * 55, 220)}ms` }} key={project.id} data-testid={`card-project-${project.id}`}>
          <div className="project-card-top">
            <div><h3 data-testid={`text-project-name-${project.id}`}>{project.name}</h3><p className="project-description">{project.description || 'Belum ada deskripsi. Tambahkan konteks agar langkahmu tetap terarah.'}</p></div>
            <ProjectActions projectId={project.id} onEdit={() => setProjectModal(project)} onDelete={() => setDeleteTarget(project)} />
          </div>
          <div className="progress-label"><span>{projectCounts.completed} dari {projectCounts.total} milestone selesai</span><span>{progress}%</span></div>
          <div className="progress-track" aria-label={`Progres ${progress}%`}><div className="progress-fill" style={{ width: `${progress}%` }} /></div>
          <div className="project-card-footer"><span className="date-line"><CalendarDays size={14} /> Target {formatDate(project.targetDate)}</span>
            <Link href={`/projects/${project.id}`} className="card-open" data-testid={`link-project-${project.id}`}>Buka proyek <ArrowRight size={14} /></Link>
          </div>
        </article>;
      })}</div> : search ? <div className="empty-state" data-testid="empty-search"><div className="empty-icon"><Search size={21} /></div><h2>Belum ada yang cocok</h2><p>Coba kata kunci lain atau bersihkan pencarian untuk melihat semua proyek.</p><button className="button button-secondary" onClick={() => setSearch('')} data-testid="button-clear-search">Bersihkan pencarian</button></div>
      : <div className="empty-state" data-testid="empty-projects"><div className="empty-icon"><Target size={22} /></div><h2>Tujuan pertamamu dimulai di sini</h2><p>Buat proyek untuk mengurai tujuan besar menjadi langkah yang terukur, lengkap dengan tanggal dan progresnya.</p><button className="button button-primary" onClick={() => setProjectModal('new')} data-testid="button-create-first-project"><Plus size={16} /> Buat proyek pertama</button></div>}
    {projectModal && <ProjectDialog project={projectModal === 'new' ? null : projectModal} onClose={() => setProjectModal(null)} onSave={saveProject} />}
    {deleteTarget && <ConfirmDialog title="Hapus proyek ini?" description={`“${deleteTarget.name}” akan dihapus. Milestone di dalamnya juga tidak akan tersedia lagi.`} onCancel={() => setDeleteTarget(null)} onConfirm={() => void removeProject(deleteTarget)} />}
  </main>;
}

function ProjectActions({ projectId, onEdit, onDelete }: { projectId: string; onEdit: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  return <div className="project-menu">
    <button className="icon-button" aria-label="Aksi proyek" onClick={() => setOpen(!open)} data-testid={`button-project-actions-${projectId}`}><MoreHorizontal size={18} /></button>
    {open && <div className="action-popover">
      <button onClick={() => { onEdit(); setOpen(false); }} data-testid={`button-edit-project-${projectId}`}><Pencil size={14} /> Ubah proyek</button>
      <button className="danger-action" onClick={() => { onDelete(); setOpen(false); }} data-testid={`button-delete-project-${projectId}`}><Trash2 size={14} /> Hapus proyek</button>
    </div>}
  </div>;
}

function ProjectPage({ firebase, user }: { firebase: FirebaseClient; user: User }) {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;
  const [project, setProject] = useState<Project | null>(null);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState<Milestone | 'new' | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Milestone | null>(null);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    const stopProject = onSnapshot(projectDoc(firebase.db, user.uid, projectId), (snapshot) => {
      if (snapshot.exists()) setProject({ id: snapshot.id, ...snapshot.data() } as Project);
      else setProject(null);
      setLoading(false);
    }, reason => { setError(reason.message); setLoading(false); });
    const stopMilestones = onSnapshot(query(milestoneCollection(firebase.db, user.uid, projectId), orderBy('order', 'asc')), snapshot => {
      setMilestones(snapshot.docs.map(item => ({ id: item.id, ...item.data() } as Milestone)));
      setError('');
    }, reason => setError(reason.message));
    return () => { stopProject(); stopMilestones(); };
  }, [firebase.db, user.uid, projectId]);

  const completedCount = milestones.filter(item => item.status === 'completed').length;
  const progress = milestones.length ? Math.round(completedCount / milestones.length * 100) : 0;
  const filtered = filter === 'all' ? milestones : milestones.filter(item => item.status === filter);

  async function saveMilestone(draft: MilestoneDraft, current: Milestone | null) {
    if (!projectId) return;
    const now = isoNow();
    if (current) await updateDoc(milestoneDoc(firebase.db, user.uid, projectId, current.id), { ...draft, updatedAt: now });
    else await addDoc(milestoneCollection(firebase.db, user.uid, projectId), {
      ...draft, projectId, ownerUid: user.uid, order: milestones.length ? Math.max(...milestones.map(item => item.order)) + 1 : 0,
      createdAt: now, updatedAt: now,
    });
    await updateDoc(projectDoc(firebase.db, user.uid, projectId), { updatedAt: now });
    setModal(null);
  }
  async function updateStatus(milestone: Milestone, status: MilestoneStatus) {
    try {
      const now = isoNow();
      await updateDoc(milestoneDoc(firebase.db, user.uid, projectId, milestone.id), { status, updatedAt: now });
      await updateDoc(projectDoc(firebase.db, user.uid, projectId), { updatedAt: now });
    }
    catch (reason) { setError(errorMessage(reason)); }
  }
  async function removeMilestone(milestone: Milestone) {
    try {
      await deleteDoc(milestoneDoc(firebase.db, user.uid, projectId, milestone.id));
      await updateDoc(projectDoc(firebase.db, user.uid, projectId), { updatedAt: isoNow() });
      setDeleteTarget(null);
    } catch (reason) { setError(errorMessage(reason)); }
  }
  async function moveMilestone(item: Milestone, direction: -1 | 1) {
    const index = milestones.findIndex(milestone => milestone.id === item.id);
    const neighbor = milestones[index + direction];
    if (!neighbor) return;
    try {
      await Promise.all([
        updateDoc(milestoneDoc(firebase.db, user.uid, projectId, item.id), { order: neighbor.order, updatedAt: isoNow() }),
        updateDoc(milestoneDoc(firebase.db, user.uid, projectId, neighbor.id), { order: item.order, updatedAt: isoNow() }),
      ]);
      await updateDoc(projectDoc(firebase.db, user.uid, projectId), { updatedAt: isoNow() });
    } catch (reason) { setError(errorMessage(reason)); }
  }

  if (loading) return <main className="page-wrap"><div className="skeleton skeleton-line" style={{ width: 120 }} /><div className="skeleton skeleton-line" style={{ width: '42%', height: 36, marginTop: 24 }} /><div className="skeleton-card" style={{ marginTop: 35, height: 330 }} /></main>;
  if (!project) return <main className="page-wrap"><div className="breadcrumb"><Link href="/">Ruang kerja</Link><ChevronRight size={13} />Proyek</div><div className="error-state"><div className="empty-icon"><FolderKanban size={21} /></div><h2>Proyek tidak ditemukan</h2><p>Proyek mungkin sudah dihapus, atau tautan ini tidak lagi tersedia.</p><Link className="button button-primary" href="/">Kembali ke ruang kerja</Link></div></main>;

  return <main className="page-wrap">
    <div className="breadcrumb"><Link href="/" data-testid="link-back-dashboard">Ruang kerja</Link><ChevronRight size={13} /><span data-testid="text-project-breadcrumb">{project.name}</span></div>
    {error && <ErrorBanner message={error} onDismiss={() => setError('')} />}
    <section className="detail-hero">
      <div>
        <div className="eyebrow">Rencana proyek</div><h1 style={{ marginTop: 9 }} data-testid="text-project-title">{project.name}</h1>
        <p style={{ color: 'hsl(var(--muted-foreground))', lineHeight: 1.6, maxWidth: 620, margin: 0 }}>{project.description || 'Setiap langkah kecil membawa tujuan ini lebih dekat.'}</p>
        <div className="detail-stats"><span><CalendarDays size={14} /> Target {formatDate(project.targetDate)}</span><span><ListTodo size={14} /> {milestones.length} milestone</span></div>
      </div>
      <div className="detail-progress"><div className="detail-progress-head"><span>Progres keseluruhan</span><strong data-testid="text-project-progress">{progress}%</strong></div><div className="progress-track"><div className="progress-fill" style={{ width: `${progress}%` }} /></div><div className="progress-label" style={{ marginBottom: 0 }}><span>{completedCount} dari {milestones.length} langkah tuntas</span></div></div>
    </section>
    <div className="detail-toolbar">
      <div className="section-title">Milestone <span className="section-count">{milestones.length}</span></div>
      <button className="button button-primary" onClick={() => setModal('new')} data-testid="button-create-milestone"><Plus size={16} /> Tambah milestone</button>
    </div>
    {milestones.length > 0 && <div className="toolbar">
      <label className="sr-only" htmlFor="milestone-filter">Filter milestone</label>
      <select id="milestone-filter" className="select-field" style={{ width: 'auto' }} value={filter} onChange={event => setFilter(event.target.value)} data-testid="select-milestone-filter">
        <option value="all">Semua langkah</option><option value="planned">Direncanakan</option><option value="in-progress">Sedang berjalan</option><option value="completed">Selesai</option>
      </select>
      <span className="date-line">{filtered.length} ditampilkan</span>
    </div>}
    {milestones.length === 0 ? <div className="empty-state" data-testid="empty-milestones"><div className="empty-icon"><CircleDashed size={21} /></div><h2>Belum ada langkah yang disusun</h2><p>Tambahkan milestone pertama dengan target tanggal yang masuk akal. Kamu bisa mengubah urutannya kapan saja.</p><button className="button button-primary" onClick={() => setModal('new')} data-testid="button-create-first-milestone"><Plus size={16} /> Tambah milestone pertama</button></div>
      : filtered.length === 0 ? <div className="empty-state" data-testid="empty-filtered-milestones"><div className="empty-icon"><Search size={20} /></div><h2>Tidak ada milestone di status ini</h2><p>Pilih status lain untuk melihat langkah proyek.</p><button className="button button-secondary" onClick={() => setFilter('all')} data-testid="button-reset-milestone-filter">Lihat semua milestone</button></div>
      : <section className="timeline" data-testid="list-milestones">{filtered.map((milestone, index) =>
        <MilestoneRow key={milestone.id} item={milestone} index={milestones.findIndex(candidate => candidate.id === milestone.id)} count={milestones.length}
          onStatus={status => void updateStatus(milestone, status)} onEdit={() => setModal(milestone)} onDelete={() => setDeleteTarget(milestone)}
          onMove={direction => void moveMilestone(milestone, direction)} />
      )}</section>}
    {modal && <MilestoneDialog milestone={modal === 'new' ? null : modal} onClose={() => setModal(null)} onSave={saveMilestone} />}
    {deleteTarget && <ConfirmDialog title="Hapus milestone?" description={`“${deleteTarget.title}” akan dihapus dari proyek ini.`} onCancel={() => setDeleteTarget(null)} onConfirm={() => void removeMilestone(deleteTarget)} />}
  </main>;
}

function MilestoneRow({ item, index, count, onStatus, onEdit, onDelete, onMove }: {
  item: Milestone; index: number; count: number; onStatus: (status: MilestoneStatus) => void;
  onEdit: () => void; onDelete: () => void; onMove: (direction: -1 | 1) => void;
}) {
  const Icon = item.status === 'completed' ? Check : item.status === 'in-progress' ? Clock3 : Circle;
  return <article className="milestone-row" data-testid={`row-milestone-${item.id}`}>
    <div className="timeline-rail"><span className={`milestone-marker ${item.status}`}><Icon size={14} /></span></div>
    <div className="milestone-content">
      <h3 data-testid={`text-milestone-title-${item.id}`}>{item.title}</h3>
      {item.description && <p>{item.description}</p>}
      <div className="milestone-meta"><span className={`status-pill status-${item.status}`} data-testid={`status-milestone-${item.id}`}>{statusLabels[item.status]}</span><span className="milestone-date"><CalendarDays size={13} />{formatDate(item.dueDate)}</span></div>
    </div>
    <div className="milestone-actions">
      <label className="sr-only" htmlFor={`status-${item.id}`}>Ubah status {item.title}</label>
      <select id={`status-${item.id}`} className="select-field" style={{ width: 'auto', height: 33, padding: '0 8px', fontSize: 11 }} value={item.status} onChange={event => onStatus(event.target.value as MilestoneStatus)} data-testid={`select-status-${item.id}`}>
        <option value="planned">Direncanakan</option><option value="in-progress">Sedang berjalan</option><option value="completed">Selesai</option>
      </select>
      <button className="icon-button" aria-label="Pindah ke atas" disabled={index === 0} onClick={() => onMove(-1)} data-testid={`button-move-up-${item.id}`}><ArrowUp size={15} /></button>
      <button className="icon-button" aria-label="Pindah ke bawah" disabled={index === count - 1} onClick={() => onMove(1)} data-testid={`button-move-down-${item.id}`}><ArrowDown size={15} /></button>
      <button className="icon-button" aria-label="Ubah milestone" onClick={onEdit} data-testid={`button-edit-milestone-${item.id}`}><Pencil size={15} /></button>
      <button className="icon-button" aria-label="Hapus milestone" onClick={onDelete} data-testid={`button-delete-milestone-${item.id}`}><Trash2 size={15} /></button>
    </div>
  </article>;
}

function ProjectDialog({ project, onClose, onSave }: {
  project: Project | null; onClose: () => void; onSave: (draft: ProjectDraft, current: Project | null) => Promise<void>;
}) {
  const [draft, setDraft] = useState<ProjectDraft>({ name: project?.name || '', description: project?.description || '', targetDate: project?.targetDate || '' });
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft.name.trim()) { setError('Nama proyek perlu diisi.'); return; }
    setBusy(true); setError('');
    try { await onSave({ ...draft, name: draft.name.trim(), description: draft.description.trim() }, project); }
    catch (reason) { setError(errorMessage(reason)); } finally { setBusy(false); }
  }
  return <Modal onClose={onClose} testId="dialog-project">
    <h2>{project ? 'Ubah detail proyek' : 'Mulai proyek baru'}</h2><p className="dialog-lead">{project ? 'Perbarui konteks dan tanggal tujuan proyekmu.' : 'Tentukan tujuan. Langkah-langkahnya bisa kamu susun setelah ini.'}</p>
    <form onSubmit={submit} data-testid="form-project">
      <div className="form-stack">
        <div><label className="form-label" htmlFor="project-name">Nama proyek</label><input id="project-name" className="field" autoFocus maxLength={90} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} placeholder="Contoh: Luncurkan toko daring" data-testid="input-project-name" /></div>
        <div><label className="form-label" htmlFor="project-description">Deskripsi <span style={{ fontWeight: 400, color: 'hsl(var(--muted-foreground))' }}>— opsional</span></label><textarea id="project-description" className="field" maxLength={400} value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} placeholder="Apa yang ingin dicapai dan mengapa ini penting?" data-testid="input-project-description" /></div>
        <div><label className="form-label" htmlFor="project-target">Tanggal target <span style={{ fontWeight: 400, color: 'hsl(var(--muted-foreground))' }}>— opsional</span></label><input id="project-target" type="date" className="field" value={draft.targetDate} onChange={event => setDraft({ ...draft, targetDate: event.target.value })} data-testid="input-project-target-date" /></div>
      </div>
      {error && <div className="form-error" role="alert">{error}</div>}
      <div className="dialog-actions"><button type="button" className="button button-secondary" onClick={onClose} data-testid="button-cancel-project">Batal</button><button className="button button-primary" disabled={busy} data-testid="button-save-project">{busy ? <LoaderCircle size={15} className="spin" /> : <Check size={15} />}{project ? 'Simpan perubahan' : 'Buat proyek'}</button></div>
    </form>
  </Modal>;
}

function MilestoneDialog({ milestone, onClose, onSave }: {
  milestone: Milestone | null; onClose: () => void; onSave: (draft: MilestoneDraft, current: Milestone | null) => Promise<void>;
}) {
  const [draft, setDraft] = useState<MilestoneDraft>({ title: milestone?.title || '', description: milestone?.description || '', dueDate: milestone?.dueDate || '', status: milestone?.status || 'planned' });
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft.title.trim()) { setError('Nama milestone perlu diisi.'); return; }
    setBusy(true); setError('');
    try { await onSave({ ...draft, title: draft.title.trim(), description: draft.description.trim() }, milestone); }
    catch (reason) { setError(errorMessage(reason)); } finally { setBusy(false); }
  }
  return <Modal onClose={onClose} testId="dialog-milestone">
    <h2>{milestone ? 'Ubah milestone' : 'Tambah milestone'}</h2><p className="dialog-lead">Satu hasil konkret yang membawa proyek lebih dekat ke tujuan.</p>
    <form onSubmit={submit} data-testid="form-milestone">
      <div className="form-stack">
        <div><label className="form-label" htmlFor="milestone-title">Nama milestone</label><input id="milestone-title" className="field" autoFocus maxLength={100} value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} placeholder="Contoh: Draf produk pertama selesai" data-testid="input-milestone-title" /></div>
        <div><label className="form-label" htmlFor="milestone-description">Catatan <span style={{ fontWeight: 400, color: 'hsl(var(--muted-foreground))' }}>— opsional</span></label><textarea id="milestone-description" className="field" maxLength={400} value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} placeholder="Ruang lingkup atau detail yang perlu diingat" data-testid="input-milestone-description" /></div>
        <div className="form-stack" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div><label className="form-label" htmlFor="milestone-date">Target tanggal</label><input id="milestone-date" type="date" className="field" value={draft.dueDate} onChange={event => setDraft({ ...draft, dueDate: event.target.value })} data-testid="input-milestone-due-date" /></div>
          <div><label className="form-label" htmlFor="milestone-status">Status</label><select id="milestone-status" className="select-field" value={draft.status} onChange={event => setDraft({ ...draft, status: event.target.value as MilestoneStatus })} data-testid="select-milestone-status"><option value="planned">Direncanakan</option><option value="in-progress">Sedang berjalan</option><option value="completed">Selesai</option></select></div>
        </div>
      </div>
      {error && <div className="form-error" role="alert">{error}</div>}
      <div className="dialog-actions"><button type="button" className="button button-secondary" onClick={onClose} data-testid="button-cancel-milestone">Batal</button><button className="button button-primary" disabled={busy} data-testid="button-save-milestone">{busy ? <LoaderCircle size={15} className="spin" /> : <Check size={15} />}{milestone ? 'Simpan perubahan' : 'Tambah milestone'}</button></div>
    </form>
  </Modal>;
}

function Modal({ children, onClose, testId }: { children: ReactNode; onClose: () => void; testId: string }) {
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);
  return <div className="dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="dialog" role="dialog" aria-modal="true" data-testid={testId}>{children}</section>
  </div>;
}

function ConfirmDialog({ title, description, onCancel, onConfirm }: { title: string; description: string; onCancel: () => void; onConfirm: () => void }) {
  return <Modal onClose={onCancel} testId="dialog-confirm">
    <div className="empty-icon" style={{ margin: '0 0 16px', color: 'hsl(var(--destructive))', background: 'hsl(var(--destructive) / .09)' }}><Trash2 size={20} /></div>
    <h2>{title}</h2><p className="dialog-lead">{description}</p>
    <div className="dialog-actions"><button className="button button-secondary" onClick={onCancel} data-testid="button-cancel-delete">Jangan hapus</button><button className="button button-danger" onClick={onConfirm} data-testid="button-confirm-delete"><Trash2 size={15} /> Hapus</button></div>
  </Modal>;
}

function ErrorBanner({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return <div className="error-banner" role="alert" data-testid="status-firestore-error"><span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><AlertCircle size={16} />Tidak dapat menyinkronkan perubahan. {message}</span><button className="icon-button" aria-label="Tutup pesan error" onClick={onDismiss} data-testid="button-dismiss-error"><X size={15} /></button></div>;
}
function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Perubahan gagal disimpan. Periksa koneksi dan coba lagi.';
}

export default App;
